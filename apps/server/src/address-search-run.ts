import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ADDRESS_SEARCH_STAGES,
  MAX_COMPANIES_PER_DOOR,
  OV_PICK_COUNT,
  OV_RADIUS_KM,
  TRADE_IDS,
  TRADES,
  buildTrustProposal,
  cellIsFresh,
  classifyLocalAuthenticity,
  findersForTrade,
  matchPageToTrades,
  pickNearest,
  type AddressCandidate,
  type AddressSearchStage,
  type Company,
  type CountryCheck,
  type EcologySeed,
  type PlaceCell,
  type TradeId,
} from "@h3-trust/schema";
import type { Store } from "@h3-trust/store";
import {
  applyAddressSnapshot,
  geocodeCached,
  type AddressCompanyInput,
  type AddressSeedInput,
} from "./address-search-job.js";
import {
  extractBusinesses,
  fetchPage,
  pageBlocked,
  sameHostServicesUrl,
} from "./address-search-fetch.js";
import { AddressSearchRateLimitError, askAddressJson } from "./address-search-llm.js";
import type { NationLandscapeStore } from "./nation-landscape-store.js";
import type { PlaceCellStore } from "./place-cell-store.js";
import type { WorkerRun } from "./worker-progress.js";

const GEOCODE_BATCH = 20;
const HARVEST_BATCH = 3;
const AUTH_BATCH = 5;
const COUNTRY_BATCH = 2;
const STALE_MS = 90_000;

type SearchCursor = {
  stage: AddressSearchStage;
  offset: number;
  lock: string;
  urls: string[];
};

type Working = {
  cell: PlaceCell;
  companies: Company[];
};

export type AddressSliceResult = {
  status: "busy" | "running" | "succeeded" | "failed" | "cancelled";
  continue: boolean;
  lock?: string;
};

function asCursor(raw: Record<string, unknown> | null | undefined): SearchCursor {
  const stage = ADDRESS_SEARCH_STAGES.includes(raw?.stage as AddressSearchStage)
    ? (raw?.stage as AddressSearchStage)
    : "geocode";
  const offset = typeof raw?.offset === "number" && raw.offset >= 0 ? raw.offset : 0;
  const lock = typeof raw?.lock === "string" ? raw.lock : "";
  const urls = Array.isArray(raw?.urls)
    ? raw.urls.filter((u): u is string => typeof u === "string")
    : [];
  return { stage, offset, lock, urls };
}

function modelOf(run: WorkerRun): string {
  return typeof run.input.model === "string" && run.input.model.trim()
    ? run.input.model.trim()
    : process.env.OPENROUTER_MODEL || "minimax/minimax-m3:free";
}

function stageLabel(stage: AddressSearchStage, cell: PlaceCell): string {
  const place = cell.woonplaats || cell.label;
  switch (stage) {
    case "geocode":
      return `Place cell · ${place}`;
    case "ecology_ov":
      return `Ondernemersverenigingen near ${place}`;
    case "ecology_sport":
      return `Sport sponsors near ${place}`;
    case "ecology_festivity":
      return `Festivities near ${place}`;
    case "trade_search":
      return `12 doors around ${place}`;
    case "harvest_match":
      return "Website match";
    case "local_authenticity":
      return "Local authenticity";
    case "country_corroboration":
      return "Country map check";
    case "score":
      return "Provisional trust";
  }
}

function needsStage(stage: AddressSearchStage, state: Working): boolean {
  const fresh = cellIsFresh(state.cell.updatedAt) && state.cell.finishedStages.includes(stage);
  if (stage === "geocode") return !state.cell.finishedStages.includes("geocode");
  if (stage === "score") return true;
  if (!fresh) return true;
  if (stage === "trade_search") {
    const filled = new Set(state.companies.map((c) => c.category));
    return TRADE_IDS.some((id) => !filled.has(id));
  }
  if (stage === "harvest_match") {
    const known = new Set(
      state.companies.map((c) =>
        (c.website_url ?? "").replace(/^https?:\/\//i, "").replace(/^www\./, "").toLowerCase(),
      ),
    );
    return state.cell.candidates.some((c) => {
      const site = (c.website ?? "").replace(/^https?:\/\//i, "").replace(/^www\./, "").toLowerCase();
      if (site) return !known.has(site);
      return !state.companies.some(
        (company) => company.name.trim().toLowerCase() === c.name.trim().toLowerCase(),
      );
    });
  }
  if (stage === "local_authenticity") {
    return state.companies.some((c) => c.website_url && !c.localAuthenticity);
  }
  if (stage === "country_corroboration") {
    return state.companies.some(
      (c) => c.localAuthenticity?.verdict !== "fake_local" && !(c.countryChecks ?? []).length,
    );
  }
  return false;
}

function firstNeeded(from: AddressSearchStage, state: Working): AddressSearchStage | null {
  const start = Math.max(0, ADDRESS_SEARCH_STAGES.indexOf(from));
  for (let i = start; i < ADDRESS_SEARCH_STAGES.length; i++) {
    const stage = ADDRESS_SEARCH_STAGES[i]!;
    if (needsStage(stage, state)) return stage;
  }
  return null;
}

function normalizeSite(raw: string | undefined): string | undefined {
  const value = (raw ?? "").trim();
  if (!value || /^n\.?v\.?t\.?$/i.test(value) || value === "-" || /linkedin/i.test(value)) {
    return undefined;
  }
  if (/^https?:\/\//i.test(value)) return value;
  if (!value.includes(".")) return undefined;
  return `https://${value.replace(/^\/\//, "")}`;
}

function remember(
  cell: PlaceCell,
  sourceName: string,
  from: AddressCandidate["from"],
  rows: { name: string; website?: string }[],
): void {
  const seen = new Set(cell.candidates.map((c) => c.name.toLowerCase()));
  const next = [...cell.candidates];
  for (const row of rows) {
    const key = row.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push({ name: row.name, website: row.website, from, sourceName });
  }
  cell.candidates = next;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function readOvCsv(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const paths = [
    join(process.cwd(), "writable/docs/data/OVtotaal.csv"),
    join(process.cwd(), "apps/server/data/OVtotaal.csv"),
    join(here, "../../../writable/docs/data/OVtotaal.csv"),
  ];
  for (const path of paths) {
    try {
      return readFileSync(path, "utf8");
    } catch {
      /* next */
    }
  }
  return "";
}

function parseOvCsv(text: string): { plaats: string; naam: string; website?: string }[] {
  const rows: { plaats: string; naam: string; website?: string }[] = [];
  for (const line of text.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const [plaats = "", naam = "", website = ""] = line.split(",");
    if (!plaats.trim() || !naam.trim()) continue;
    rows.push({
      plaats: plaats.trim(),
      naam: naam.trim(),
      website: normalizeSite(website.trim()),
    });
  }
  return rows;
}

function ecologyMention(name: string, cell: PlaceCell): boolean {
  const needle = name.trim().toLowerCase();
  const seeds = [...cell.ecology.ov, ...cell.ecology.sport, ...cell.ecology.festivity];
  return (
    cell.candidates.some(
      (c) =>
        c.name.trim().toLowerCase() === needle &&
        (c.from === "ov" || c.from === "sport" || c.from === "festivity"),
    ) || seeds.some((s) => s.name.trim().toLowerCase() === needle)
  );
}

function localEvidence(company: Company, cell: PlaceCell): { kind: EcologySeed["kind"]; label: string }[] {
  const names = new Set((company.list_membership ?? []).map((n) => n.toLowerCase()));
  const out: { kind: EcologySeed["kind"]; label: string }[] = [];
  for (const seed of [...cell.ecology.ov, ...cell.ecology.sport, ...cell.ecology.festivity]) {
    if (names.has(seed.name.toLowerCase())) out.push({ kind: seed.kind, label: seed.name });
  }
  return out;
}

async function loadRun(admin: SupabaseClient, runId: string): Promise<WorkerRun | null> {
  const { data, error } = await admin.from("worker_runs").select("*").eq("id", runId).maybeSingle();
  if (error || !data) return null;
  return data as WorkerRun;
}

async function patchRun(
  admin: SupabaseClient,
  runId: string,
  patch: Record<string, unknown>,
  match?: { status?: string; lock?: string },
): Promise<WorkerRun | null> {
  let query = admin.from("worker_runs").update(patch).eq("id", runId);
  if (match?.status) query = query.eq("status", match.status);
  if (match?.lock) query = query.filter("cursor->>lock", "eq", match.lock);
  const { data, error } = await query.select("*").maybeSingle();
  if (error) throw new Error(error.message);
  return (data as WorkerRun | null) ?? null;
}

async function writeEvent(
  admin: SupabaseClient,
  run: WorkerRun,
  message: string,
  data: Record<string, unknown>,
  level: "info" | "warn" | "error" = "info",
): Promise<void> {
  const { error } = await admin.from("worker_events").insert({
    run_id: run.id,
    mission_id: run.mission_id,
    level,
    event_type: level === "error" ? "step_failed" : "step_started",
    step_name: typeof data.stage === "string" ? data.stage : null,
    message,
    data,
  });
  if (error) console.warn(`[address-search] event: ${error.message}`);
}

function heartbeatFresh(run: WorkerRun): boolean {
  const at = Date.parse(run.heartbeat_at ?? "");
  return Number.isFinite(at) && Date.now() - at < STALE_MS;
}

async function claimSlice(
  admin: SupabaseClient,
  run: WorkerRun,
  bodyLock: string | undefined,
): Promise<{ run: WorkerRun; lock: string } | null> {
  const now = new Date().toISOString();
  const cursor = asCursor(run.cursor);
  const lock = randomUUID();
  const nextCursor = { ...cursor, lock };
  if (run.status === "queued" || (run.status === "running" && !heartbeatFresh(run))) {
    const claimed = await patchRun(
      admin,
      run.id,
      {
        status: "running",
        started_at: run.started_at ?? now,
        heartbeat_at: now,
        current_action: "Claimed",
        cursor: nextCursor,
        error: null,
        finished_at: null,
        updated_at: now,
      },
      { status: run.status },
    );
    return claimed ? { run: claimed, lock } : null;
  }
  if (run.status === "running" && bodyLock && bodyLock === cursor.lock) {
    const claimed = await patchRun(
      admin,
      run.id,
      {
        heartbeat_at: now,
        cursor: nextCursor,
        updated_at: now,
      },
      { lock: bodyLock },
    );
    return claimed ? { run: claimed, lock } : null;
  }
  return null;
}

type SliceAdvance = {
  done: boolean;
  offset: number;
  urls: string[];
};

async function saveCell(
  store: Store,
  cells: PlaceCellStore,
  cell: PlaceCell,
  sources?: AddressSeedInput[],
  companies?: AddressCompanyInput[],
): Promise<{ cell: PlaceCell; companies: Company[] }> {
  const applied = await applyAddressSnapshot({ store, cells, cell, sources, companies });
  const listed = await store.listByMission("companies", applied.cell.missionId);
  return { cell: applied.cell, companies: listed };
}

async function ecologyWebSlice(
  state: Working,
  model: string,
  kind: "sport" | "festivity",
  cursor: SearchCursor,
): Promise<SliceAdvance & { sources?: AddressSeedInput[] }> {
  const place = state.cell.woonplaats || state.cell.label;
  let urls = cursor.urls;
  if (!urls.length && cursor.offset === 0) {
    const ask =
      kind === "sport"
        ? `Public sport-club sponsor pages near ${place}, Netherlands. Sponsors only, no member lists.`
        : `Public pages for a local festivity, braderie, kermis or jaarmarkt near ${place}, Netherlands. Standholders or sponsors only.`;
    const json = await askAddressJson(
      model,
      'Return JSON {"urls": string[]} with at most 3 absolute http(s) URLs. No other keys. If unsure, return {"urls":[]}.',
      ask,
    );
    const raw = Array.isArray(json?.urls) ? json.urls : [];
    urls = raw.filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u)).slice(0, 3);
    if (!urls.length) {
      state.cell.notes = [
        ...state.cell.notes,
        kind === "sport" ? "No sport-sponsor URLs this run" : "No festivity URLs this run",
      ];
      return { done: true, offset: 0, urls: [] };
    }
  }
  const category = kind === "sport" ? "sponsorship" : "trade_fair";
  const seeds: EcologySeed[] = [...state.cell.ecology[kind]];
  const sources: AddressSeedInput[] = [];
  const batch = urls.slice(0, 3);
  for (const url of batch) {
    const page = await fetchPage(url);
    if (!page.ok || pageBlocked(page.url, page.status, page.html, page.text)) continue;
    const name = kind === "sport" ? `Sport · ${place}` : `Festivity · ${place}`;
    const label = `${name} · ${hostOf(page.url)}`;
    seeds.push({ name: label, website: page.url, kind, place });
    sources.push({
      name: label,
      url: page.url,
      category,
      suggestedWeight: kind === "sport" ? 50 : 60,
    });
    remember(state.cell, label, kind, extractBusinesses(page.html, page.url, "sponsor"));
  }
  state.cell.ecology = { ...state.cell.ecology, [kind]: seeds };
  return { done: true, offset: 0, urls: [], sources };
}

async function tradeSlice(state: Working, model: string): Promise<SliceAdvance> {
  const place = state.cell.woonplaats || state.cell.label;
  const queries = TRADES.trades.map((t) => `${t.label} ${place}`);
  state.cell.notes = [...state.cell.notes, `Place queries: ${queries.join(" · ")}`];
  const filled = new Set(state.companies.map((c) => c.category).filter(Boolean));
  const empty = TRADE_IDS.filter((id) => !filled.has(id));
  if (!empty.length) return { done: true, offset: 0, urls: [] };
  const json = await askAddressJson(
    model,
    'Return JSON {"companies":[{"name":string,"website":string,"tradeId":string}]} with at most 2 websites per requested trade. Only real local craft firms, absolute https URLs. No national lead-gen. If unsure, {"companies":[]}.',
    `Place: ${place}, ${state.cell.country}. Empty trade doors: ${empty.join(", ")}. Known local names: ${state.cell.candidates
      .slice(0, 30)
      .map((c) => c.name)
      .join(", ")}`,
  );
  const rows = Array.isArray(json?.companies) ? json.companies : [];
  const perDoor = new Map<string, number>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const tradeId = typeof rec.tradeId === "string" ? rec.tradeId : "";
    if (!empty.includes(tradeId as TradeId)) continue;
    const count = perDoor.get(tradeId) ?? 0;
    if (count >= 2) continue;
    const website = normalizeSite(typeof rec.website === "string" ? rec.website : "");
    const name = typeof rec.name === "string" ? rec.name.trim() : "";
    if (!name || !website) continue;
    perDoor.set(tradeId, count + 1);
    remember(state.cell, "trade search", "trade_search", [{ name, website }]);
    const idx = state.cell.candidates.findIndex((c) => c.name.toLowerCase() === name.toLowerCase());
    const current = idx >= 0 ? state.cell.candidates[idx] : undefined;
    if (current) {
      state.cell.candidates[idx] = { ...current, tradeId: tradeId as TradeId, website };
    }
  }
  return { done: true, offset: 0, urls: [] };
}

function siteKey(value: string | undefined): string {
  return (value ?? "").replace(/^https?:\/\//i, "").replace(/^www\./, "").toLowerCase();
}

async function harvestSlice(
  state: Working,
  model: string,
  cursor: SearchCursor,
): Promise<SliceAdvance & { companies?: AddressCompanyInput[] }> {
  const place =
    [state.cell.woonplaats, state.cell.gemeente].filter(Boolean).join(" ") || state.cell.label;
  const addressLine = [state.cell.postcode4, state.cell.woonplaats || state.cell.label]
    .filter(Boolean)
    .join(" ");
  const known = new Set(state.companies.map((c) => siteKey(c.website_url)));
  const knownNames = new Set(state.companies.map((c) => c.name.trim().toLowerCase()));
  const attempted = new Set(cursor.urls);
  const pending = state.cell.candidates.filter((c) => {
    if (c.website && attempted.has(c.website)) return false;
    const site = siteKey(c.website);
    if (site) return !known.has(site);
    return !knownNames.has(c.name.trim().toLowerCase());
  });
  const withSite = pending.filter((c) => c.website);
  if (withSite.length) {
    const batch = withSite.slice(0, HARVEST_BATCH);
    const payloads: AddressCompanyInput[] = [];
    const perDoor = new Map<string, number>();
    for (const company of state.companies) {
      if (!company.category) continue;
      perDoor.set(company.category, (perDoor.get(company.category) ?? 0) + 1);
    }
    for (const candidate of batch) {
      const website = candidate.website;
      if (!website) continue;
      const home = await fetchPage(website);
      if (!home.ok || pageBlocked(home.url, home.status, home.html, home.text) || !home.text) continue;
      let text = home.text;
      const extra = sameHostServicesUrl(home.html, website);
      if (extra) {
        const second = await fetchPage(extra);
        if (second.text && !pageBlocked(second.url, second.status, second.html, second.text)) {
          text = `${text}\n${second.text}`;
        }
      }
      let match = matchPageToTrades(text);
      const guided = await askAddressJson(
        model,
        'Return JSON {"tradeIds":string[],"capabilities":string[],"serviceContexts":string[],"specialism":string}. Use only the trade ids and specialisation ids you are given. serviceContexts are private, hoa, municipal, commercial, industrial.',
        `Trades: ${TRADES.trades
          .map((t) => `${t.id} (${t.specialisations.map((s) => s.id).join(", ")})`)
          .join("; ")}. Page text:\n${text.slice(0, 4000)}`,
      );
      if (guided) {
        const tradeIds = Array.isArray(guided.tradeIds)
          ? guided.tradeIds.filter((id): id is TradeId => TRADE_IDS.includes(id as TradeId))
          : match.tradeIds;
        const allowed = new Set(TRADES.trades.flatMap((t) => t.specialisations.map((s) => s.id)));
        const capabilities = Array.isArray(guided.capabilities)
          ? guided.capabilities.filter((id): id is string => typeof id === "string" && allowed.has(id))
          : match.capabilities;
        match = {
          ...match,
          tradeIds: tradeIds.length ? tradeIds : match.tradeIds,
          primaryTradeId: (tradeIds[0] as TradeId | undefined) ?? match.primaryTradeId,
          capabilities: capabilities.length ? capabilities : match.capabilities,
          specialism:
            typeof guided.specialism === "string" && guided.specialism.trim()
              ? guided.specialism.trim().slice(0, 160)
              : match.specialism,
        };
      }
      const tradeId = candidate.tradeId ?? match.primaryTradeId ?? "";
      if (tradeId) {
        const count = perDoor.get(tradeId) ?? 0;
        if (count >= MAX_COMPANIES_PER_DOOR) continue;
        perDoor.set(tradeId, count + 1);
      }
      payloads.push({
        name: candidate.name,
        website_url: website,
        region: place,
        address: addressLine,
        category: tradeId,
        capabilities: match.capabilities,
        serviceContexts: match.serviceContexts,
        audienceMode: match.audienceMode,
        specialism: match.specialism,
        servicedElementCodes: match.servicedElementCodes,
        profileSnippet: match.specialism
          ? `${candidate.name} · ${match.specialism}`
          : `${candidate.name} · ${place}`,
        profileSourceUrl: website,
        sourceNames: candidate.sourceName ? [candidate.sourceName] : [],
      });
    }
    const more = withSite.length > batch.length || pending.some((c) => !c.website);
    return {
      done: !more,
      offset: cursor.offset + batch.length,
      urls: [...cursor.urls, ...batch.map((c) => c.website).filter((u): u is string => Boolean(u))],
      companies: payloads,
    };
  }
  const payloads: AddressCompanyInput[] = pending.slice(0, 40).map((candidate) => ({
    name: candidate.name,
    region: place,
    address: addressLine,
    sourceNames: candidate.sourceName ? [candidate.sourceName] : [],
    profileSnippet: `${candidate.name} · named locally in ${place}`,
  }));
  return { done: true, offset: 0, urls: [], companies: payloads };
}

async function authenticitySlice(state: Working): Promise<SliceAdvance & { companies?: AddressCompanyInput[] }> {
  const pending = state.companies.filter((c) => c.website_url && !c.localAuthenticity).slice(0, AUTH_BATCH);
  const payloads: AddressCompanyInput[] = [];
  for (const company of pending) {
    const page = await fetchPage(company.website_url!);
    const text = pageBlocked(page.url, page.status, page.html, page.text) ? "" : page.text;
    const match = matchPageToTrades(text);
    const judged = classifyLocalAuthenticity({
      text,
      woonplaats: state.cell.woonplaats || state.cell.label,
      postcode4: state.cell.postcode4,
      mentionedInEcology: ecologyMention(company.name, state.cell),
      hasCraft: match.tradeIds.length > 0,
    });
    payloads.push({
      name: company.name,
      website_url: company.website_url,
      address: company.address,
      region: company.region,
      localAuthenticity: {
        verdict: judged.verdict,
        reasons: judged.reasons,
        checkedAt: new Date().toISOString(),
      },
    });
  }
  const remaining = state.companies.filter((c) => c.website_url && !c.localAuthenticity).length;
  return {
    done: remaining <= pending.length,
    offset: 0,
    urls: [],
    companies: payloads,
  };
}

async function countrySlice(
  state: Working,
  landscapes: NationLandscapeStore,
): Promise<SliceAdvance & { companies?: AddressCompanyInput[] }> {
  let landscape = null;
  try {
    landscape = await landscapes.get(state.cell.countrySlug || state.cell.country);
  } catch {
    landscape = null;
  }
  const pending = state.companies
    .filter((c) => c.localAuthenticity?.verdict !== "fake_local" && !(c.countryChecks ?? []).length)
    .slice(0, COUNTRY_BATCH);
  const payloads: AddressCompanyInput[] = [];
  for (const company of pending) {
    const tradeId = TRADE_IDS.find((id) => id === company.category);
    if (!tradeId) {
      payloads.push({
        name: company.name,
        website_url: company.website_url,
        address: company.address,
        region: company.region,
        countryChecks: [
          { sourceName: "Country map", category: "branch_association", outcome: "country_map_missing" },
        ],
      });
      continue;
    }
    const finders = findersForTrade(landscape, tradeId).slice(0, 4);
    if (!finders.length) {
      payloads.push({
        name: company.name,
        website_url: company.website_url,
        address: company.address,
        region: company.region,
        countryChecks: [
          { sourceName: "Country map", category: "branch_association", outcome: "country_map_missing" },
        ],
      });
      continue;
    }
    const checks: CountryCheck[] = [];
    for (const finder of finders) {
      if (!finder.url) {
        checks.push({
          sourceName: finder.name,
          category: finder.category,
          outcome: "blocked",
          payToPlay: finder.payToPlay,
          weight: finder.weight,
        });
        continue;
      }
      const page = await fetchPage(finder.url);
      if (!page.ok || pageBlocked(page.url, page.status, page.html, page.text)) {
        checks.push({
          sourceName: finder.name,
          category: finder.category,
          outcome: "blocked",
          url: finder.url,
          payToPlay: finder.payToPlay,
          weight: finder.weight,
        });
        continue;
      }
      const listed = page.text.toLowerCase().includes(company.name.trim().toLowerCase());
      checks.push({
        sourceName: finder.name,
        category: finder.category,
        outcome: listed ? "listed" : "not_listed",
        url: finder.url,
        payToPlay: finder.payToPlay,
        weight: finder.weight,
      });
    }
    payloads.push({
      name: company.name,
      website_url: company.website_url,
      address: company.address,
      region: company.region,
      countryChecks: checks,
    });
  }
  const remaining = state.companies.filter(
    (c) => c.localAuthenticity?.verdict !== "fake_local" && !(c.countryChecks ?? []).length,
  ).length;
  return { done: remaining <= pending.length, offset: 0, urls: [], companies: payloads };
}

function scoreSlice(state: Working): AddressCompanyInput[] {
  return state.companies.map((company) => ({
    name: company.name,
    website_url: company.website_url,
    address: company.address,
    region: company.region,
    trustProposal: buildTrustProposal({
      authenticity: company.localAuthenticity?.verdict ?? "unknown",
      localEvidence: localEvidence(company, state.cell),
      countryChecks: company.countryChecks ?? [],
      kvkPass: company.kvk_gate === "pass",
    }),
  }));
}

export async function runAddressSearchSlice(args: {
  admin: SupabaseClient;
  store: Store;
  cells: PlaceCellStore;
  landscapes: NationLandscapeStore;
  runId: string;
  lock?: string;
}): Promise<AddressSliceResult> {
  const loaded = await loadRun(args.admin, args.runId);
  if (!loaded) return { status: "failed", continue: false };
  if (loaded.command !== "address_search") return { status: "failed", continue: false };
  if (loaded.status === "succeeded" || loaded.status === "failed" || loaded.status === "cancelled") {
    return { status: loaded.status, continue: false };
  }
  const claimed = await claimSlice(args.admin, loaded, args.lock);
  if (!claimed) return { status: "busy", continue: false };
  const run = claimed.run;
  const lock = claimed.lock;
  try {
    const cellId = String(run.input.cellId ?? run.target_id ?? "");
    const cell = await args.cells.get(cellId);
    if (!cell) throw new Error("Place cell not found");
    const companies = run.mission_id ? await args.store.listByMission("companies", run.mission_id) : [];
    const state: Working = { cell, companies };
    const cursor = asCursor(run.cursor);
    const stage = firstNeeded(cursor.stage, state);
    if (!stage) {
      await finish(args.admin, run, state, "succeeded");
      return { status: "succeeded", continue: false };
    }
    const stageCursor: SearchCursor =
      stage === cursor.stage ? { ...cursor, lock } : { stage, offset: 0, lock, urls: [] };
    const now = new Date().toISOString();
    const index = ADDRESS_SEARCH_STAGES.indexOf(stage);
    await patchRun(args.admin, run.id, {
      heartbeat_at: now,
      phase: stage,
      step_index: index + 1,
      progress_pct: Math.round((index / ADDRESS_SEARCH_STAGES.length) * 100),
      current_action: stageLabel(stage, state.cell),
      updated_at: now,
    });
    await writeEvent(args.admin, run, stageLabel(stage, state.cell), { stage });

    let advance: SliceAdvance & { companies?: AddressCompanyInput[]; sources?: AddressSeedInput[] };
    if (stage === "geocode") {
      if (!state.cell.finishedStages.includes("geocode")) {
        state.cell.finishedStages = [...state.cell.finishedStages, "geocode"];
      }
      advance = { done: true, offset: 0, urls: [] };
    } else if (stage === "ecology_ov") {
      advance = await ecologyOvGeocodeOrFetch(state, args.cells, stageCursor);
    } else if (stage === "ecology_sport" || stage === "ecology_festivity") {
      const kind = stage === "ecology_sport" ? "sport" : "festivity";
      advance = await ecologyWebSlice(state, modelOf(run), kind, stageCursor);
    } else if (stage === "trade_search") {
      advance = await tradeSlice(state, modelOf(run));
    } else if (stage === "harvest_match") {
      advance = await harvestSlice(state, modelOf(run), stageCursor);
    } else if (stage === "local_authenticity") {
      advance = await authenticitySlice(state);
    } else if (stage === "country_corroboration") {
      advance = await countrySlice(state, args.landscapes);
    } else {
      advance = { done: true, offset: 0, urls: [], companies: scoreSlice(state) };
    }

    if (advance.done && !state.cell.finishedStages.includes(stage)) {
      state.cell.finishedStages = [...state.cell.finishedStages, stage];
    }
    const saved = await saveCell(
      args.store,
      args.cells,
      state.cell,
      advance.sources,
      advance.companies,
    );
    state.cell = saved.cell;
    state.companies = saved.companies;

    if (stage === "score" && advance.done) {
      await finish(args.admin, run, state, "succeeded");
      return { status: "succeeded", continue: false };
    }

    const next = advance.done ? firstNeeded(nextStage(stage), state) : stage;
    if (!next) {
      await finish(args.admin, run, state, "succeeded");
      return { status: "succeeded", continue: false };
    }
    const nextCursor: SearchCursor = advance.done
      ? { stage: next, offset: 0, lock, urls: [] }
      : { stage, offset: advance.offset, lock, urls: advance.urls };
    await patchRun(args.admin, run.id, {
      cursor: nextCursor,
      heartbeat_at: new Date().toISOString(),
      phase: next,
      current_action: stageLabel(next, state.cell),
      updated_at: new Date().toISOString(),
    });
    return { status: "running", continue: true, lock };
  } catch (err) {
    const rate = err instanceof AddressSearchRateLimitError;
    const message = err instanceof Error ? err.message : String(err);
    await writeEvent(args.admin, run, message, { stage: asCursor(run.cursor).stage }, "error");
    await patchRun(args.admin, run.id, {
      status: "failed",
      error: message.slice(0, 500),
      current_action: rate ? "Waiting for model quota" : "Failed",
      finished_at: new Date().toISOString(),
      heartbeat_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    return { status: "failed", continue: false };
  }
}

function nextStage(stage: AddressSearchStage): AddressSearchStage {
  const index = ADDRESS_SEARCH_STAGES.indexOf(stage);
  return ADDRESS_SEARCH_STAGES[Math.min(index + 1, ADDRESS_SEARCH_STAGES.length - 1)]!;
}

async function finish(
  admin: SupabaseClient,
  run: WorkerRun,
  state: Working,
  status: "succeeded",
): Promise<void> {
  await patchRun(admin, run.id, {
    status,
    progress_pct: 100,
    current_action: `Address search stored · ${state.cell.label}`,
    output_summary: {
      cellId: state.cell.id,
      companies: state.companies.length,
      label: state.cell.label,
    },
    finished_at: new Date().toISOString(),
    heartbeat_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

async function ecologyOvGeocodeOrFetch(
  state: Working,
  cells: PlaceCellStore,
  cursor: SearchCursor,
): Promise<SliceAdvance & { sources?: AddressSeedInput[] }> {
  const csv = readOvCsv();
  if (!csv) {
    state.cell.notes = [...state.cell.notes, "OVtotaal.csv missing — no OV seeds"];
    return { done: true, offset: 0, urls: [] };
  }
  const rows = parseOvCsv(csv);
  const places = [...new Set(rows.map((r) => r.plaats))];
  if (cursor.offset < places.length) {
    const batch = places.slice(cursor.offset, cursor.offset + GEOCODE_BATCH);
    for (const plaats of batch) await geocodeCached(cells, plaats, "woonplaats");
    return { done: false, offset: cursor.offset + batch.length, urls: [] };
  }
  const located: { plaats: string; lat: number; lon: number }[] = [];
  for (const plaats of places) {
    const hit = await cells.getGeo(`woonplaats:${plaats.trim().toLowerCase()}`);
    if (hit) located.push({ plaats, lat: hit.lat, lon: hit.lon });
  }
  const nearest = pickNearest(
    { lat: state.cell.lat, lon: state.cell.lon },
    located,
    OV_PICK_COUNT,
    OV_RADIUS_KM,
  );
  const seeds: EcologySeed[] = [];
  const sources: AddressSeedInput[] = [];
  for (const place of nearest) {
    const clubs = rows.filter((r) => r.plaats === place.plaats).slice(0, 3);
    for (const club of clubs) {
      if (seeds.length >= OV_PICK_COUNT) break;
      seeds.push({
        name: club.naam,
        place: club.plaats,
        website: club.website,
        lat: place.lat,
        lon: place.lon,
        distanceKm: place.distanceKm,
        kind: "ov",
      });
      sources.push({
        name: club.naam,
        url: club.website,
        category: "local_business_association",
        suggestedWeight: 65,
      });
      if (!club.website) continue;
      const page = await fetchPage(club.website);
      if (!page.ok || pageBlocked(page.url, page.status, page.html, page.text)) {
        state.cell.notes = [...state.cell.notes, `OV blocked or unread: ${club.naam}`];
        continue;
      }
      remember(state.cell, club.naam, "ov", extractBusinesses(page.html, page.url, "members"));
    }
  }
  state.cell.ecology = { ...state.cell.ecology, ov: seeds };
  return { done: true, offset: 0, urls: [], sources };
}
