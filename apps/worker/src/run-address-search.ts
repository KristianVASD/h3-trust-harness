import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
import { extractBusinesses, sameHostServicesUrl } from "./address-extract.js";
import { fetchPage } from "./fetch-page.js";
import { h3 } from "./h3-api.js";
import { completeJson, isRateLimitError, parseJsonObject } from "./openrouter.js";
import { loadPrompt } from "./load-prompt.js";
import { heartbeat, markStatus, writeEvent } from "./progress.js";
import { isRegistryListUrl } from "./source-guards.js";
import type { WorkerRun } from "./types.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const MAX_HARVESTS = 40;

type Working = {
  cell: PlaceCell;
  companies: Company[];
  pages: Map<string, string>;
};

function modelOf(run: WorkerRun): string {
  return typeof run.input.model === "string" && run.input.model.trim()
    ? run.input.model.trim()
    : process.env.OPENROUTER_MODEL || "minimax/minimax-m3:free";
}

async function askJson(
  model: string,
  system: string,
  user: string,
): Promise<Record<string, unknown> | null> {
  if (!(process.env.OPENROUTER_API_KEY ?? "").trim()) return null;
  try {
  const raw = await completeJson({
    model,
    system: `${loadPrompt("address-search")}\n\n${system}`,
    user,
    job: "address_search",
  });
    return parseJsonObject(raw);
  } catch (err) {
    if (isRateLimitError(err)) throw err;
    return null;
  }
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

function blocked(url: string, status: number, html: string, text: string): boolean {
  if (isRegistryListUrl(url)) return true;
  if (status === 401 || status === 403) return true;
  return /captcha|g-recaptcha|inloggen om|log in to continue/i.test(html) && text.length < 900;
}

async function readPage(url: string, pages: Map<string, string>): Promise<{ text: string; html: string; blocked: boolean }> {
  const cached = pages.get(url);
  if (cached) return { text: cached, html: "", blocked: false };
  const page = await fetchPage(url);
  const text = page.ok ? page.text : "";
  const isBlocked = blocked(page.url || url, page.status, page.html, page.text);
  if (!isBlocked && text) pages.set(url, text);
  return {
    text: isBlocked ? "" : text,
    html: page.html,
    blocked: isBlocked,
  };
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

async function proposeUrls(
  model: string,
  place: string,
  kind: "sport" | "festivity",
): Promise<string[]> {
  const ask =
    kind === "sport"
      ? `Public sport-club sponsor pages near ${place}, Netherlands. Sponsors only, no member lists.`
      : `Public pages for a local festivity, braderie, kermis or jaarmarkt near ${place}, Netherlands. Standholders or sponsors only.`;
  const json = await askJson(
    model,
    "Return JSON {\"urls\": string[]} with at most 3 absolute http(s) URLs. No other keys. If unsure, return {\"urls\":[]}.",
    ask,
  );
  const urls = Array.isArray(json?.urls) ? json.urls : [];
  return urls
    .filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u))
    .slice(0, 3);
}

export async function processAddressSearch(run: WorkerRun): Promise<void> {
  const cellId = String(run.input.cellId ?? run.target_id ?? "");
  if (!cellId) {
    await markStatus(run.id, "failed", { error: "No place cell id", currentAction: "Failed" });
    return;
  }
  const loaded = await h3.getPlaceCell(cellId);
  const state: Working = {
    cell: loaded,
    companies: run.mission_id ? await h3.getCompanies(run.mission_id) : [],
    pages: new Map(),
  };
  const model = modelOf(run);

  for (let i = 0; i < ADDRESS_SEARCH_STAGES.length; i++) {
    const stage = ADDRESS_SEARCH_STAGES[i]!;
    if (!needsStage(stage, state)) continue;
    await heartbeat(run.id, stageLabel(stage, state.cell), {
      progress_pct: Math.round((i / ADDRESS_SEARCH_STAGES.length) * 100),
      step_index: i + 1,
      phase: stage,
    });
    await markStatus(run.id, "running", {
      progressPct: Math.round((i / ADDRESS_SEARCH_STAGES.length) * 100),
      currentAction: stageLabel(stage, state.cell),
    });
    await writeEvent(run, {
      event_type: "step_started",
      level: "info",
      message: stageLabel(stage, state.cell),
      data: { stage },
    });
    await runStage(stage, state, model);
    if (!state.cell.finishedStages.includes(stage)) {
      state.cell.finishedStages = [...state.cell.finishedStages, stage];
    }
    const applied = await h3.applyPlaceCell(state.cell);
    state.cell = applied.cell;
    if (run.mission_id) state.companies = await h3.getCompanies(run.mission_id);
  }

  await markStatus(run.id, "succeeded", {
    progressPct: 100,
    currentAction: `Address search stored · ${state.cell.label}`,
    outputSummary: {
      cellId: state.cell.id,
      companies: state.companies.length,
      label: state.cell.label,
    },
  });
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
      const named = state.companies.some(
        (company) => company.name.trim().toLowerCase() === c.name.trim().toLowerCase(),
      );
      return !named;
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

async function runStage(stage: AddressSearchStage, state: Working, model: string): Promise<void> {
  if (stage === "geocode") return;
  if (stage === "ecology_ov") return ecologyOv(state);
  if (stage === "ecology_sport") return ecologyWeb(state, model, "sport");
  if (stage === "ecology_festivity") return ecologyWeb(state, model, "festivity");
  if (stage === "trade_search") return tradeSearch(state, model);
  if (stage === "harvest_match") return harvestMatch(state, model);
  if (stage === "local_authenticity") return authenticity(state);
  if (stage === "country_corroboration") return countryCheck(state);
  return score(state);
}

async function ecologyOv(state: Working): Promise<void> {
  let csv = "";
  try {
    csv = await readFile(join(ROOT, "writable", "docs", "data", "OVtotaal.csv"), "utf8");
  } catch {
    state.cell.notes = [...state.cell.notes, "OVtotaal.csv missing — no OV seeds"];
    return;
  }
  const rows = parseOvCsv(csv);
  const places = [...new Set(rows.map((r) => r.plaats))];
  const located: { plaats: string; lat: number; lon: number }[] = [];
  for (const plaats of places) {
    const hit = await h3.geocodeNl(plaats, "woonplaats");
    if (hit) located.push({ plaats, lat: hit.lat, lon: hit.lon });
  }
  const nearest = pickNearest(
    { lat: state.cell.lat, lon: state.cell.lon },
    located,
    OV_PICK_COUNT,
    OV_RADIUS_KM,
  );
  const seeds: EcologySeed[] = [];
  const sources: { name: string; url?: string; category: "local_business_association"; suggestedWeight: number }[] = [];
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
      if (!page.ok || blocked(page.url, page.status, page.html, page.text)) {
        state.cell.notes = [...state.cell.notes, `OV blocked or unread: ${club.naam}`];
        continue;
      }
      remember(state, club.naam, "ov", extractBusinesses(page.html, page.url, "members"));
    }
  }
  state.cell.ecology = { ...state.cell.ecology, ov: seeds };
  if (sources.length) await h3.applyPlaceCell(state.cell, sources);
}

function remember(
  state: Working,
  sourceName: string,
  from: AddressCandidate["from"],
  rows: { name: string; website?: string }[],
): void {
  const seen = new Set(state.cell.candidates.map((c) => c.name.toLowerCase()));
  const next = [...state.cell.candidates];
  for (const row of rows) {
    const key = row.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push({
      name: row.name,
      website: row.website,
      from,
      sourceName,
    });
  }
  state.cell.candidates = next;
}

async function ecologyWeb(
  state: Working,
  model: string,
  kind: "sport" | "festivity",
): Promise<void> {
  const place = state.cell.woonplaats || state.cell.label;
  const urls = await proposeUrls(model, place, kind);
  if (!urls.length) {
    state.cell.notes = [
      ...state.cell.notes,
      kind === "sport"
        ? "No sport-sponsor URLs this run"
        : "No festivity URLs this run",
    ];
    return;
  }
  const seeds: EcologySeed[] = [];
  const category = kind === "sport" ? "sponsorship" : "trade_fair";
  const sources: { name: string; url?: string; category: "sponsorship" | "trade_fair"; suggestedWeight: number }[] = [];
  for (const url of urls) {
    const page = await fetchPage(url);
    if (!page.ok || blocked(page.url, page.status, page.html, page.text)) continue;
    const name = kind === "sport" ? `Sport · ${place}` : `Festivity · ${place}`;
    const label = `${name} · ${new URL(page.url).host}`;
    seeds.push({ name: label, website: page.url, kind, place });
    sources.push({
      name: label,
      url: page.url,
      category,
      suggestedWeight: kind === "sport" ? 50 : 60,
    });
    remember(state, label, kind, extractBusinesses(page.html, page.url, "sponsor"));
  }
  state.cell.ecology = {
    ...state.cell.ecology,
    [kind]: seeds,
  };
  if (sources.length) await h3.applyPlaceCell(state.cell, sources);
}

async function tradeSearch(state: Working, model: string): Promise<void> {
  const place = state.cell.woonplaats || state.cell.label;
  const queries = TRADES.trades.map((t) => `${t.label} ${place}`);
  state.cell.notes = [...state.cell.notes, `Place queries: ${queries.join(" · ")}`];
  const filled = new Set(state.companies.map((c) => c.category).filter(Boolean));
  const empty = TRADE_IDS.filter((id) => !filled.has(id));
  if (!empty.length) return;
  const json = await askJson(
    model,
    "Return JSON {\"companies\":[{\"name\":string,\"website\":string,\"tradeId\":string}]} with at most 2 websites per requested trade. Only real local craft firms, absolute https URLs. No national lead-gen. If unsure, {\"companies\":[]}.",
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
    remember(state, "trade search", "trade_search", [{ name, website }]);
    const idx = state.cell.candidates.findIndex((c) => c.name.toLowerCase() === name.toLowerCase());
    const current = idx >= 0 ? state.cell.candidates[idx] : undefined;
    if (current) {
      state.cell.candidates[idx] = { ...current, tradeId: tradeId as TradeId, website };
    }
  }
}

async function harvestMatch(state: Working, model: string): Promise<void> {
  const place = [state.cell.woonplaats, state.cell.gemeente].filter(Boolean).join(" ") || state.cell.label;
  const addressLine = [state.cell.postcode4, state.cell.woonplaats || state.cell.label]
    .filter(Boolean)
    .join(" ");
  const batch = state.cell.candidates.filter((c) => c.website).slice(0, MAX_HARVESTS);
  const payloads: {
    name: string;
    website_url?: string;
    region?: string;
    address?: string;
    category?: string;
    capabilities?: string[];
    serviceContexts?: ("private" | "hoa" | "municipal" | "commercial" | "industrial")[];
    audienceMode?: "b2c" | "b2b" | "both";
    specialism?: string;
    servicedElementCodes?: string[];
    profileSnippet?: string;
    profileSourceUrl?: string;
    sourceNames?: string[];
    localAuthenticity?: Company["localAuthenticity"];
    countryChecks?: CountryCheck[];
    trustProposal?: Company["trustProposal"];
  }[] = [];
  const perDoor = new Map<string, number>();
  for (const candidate of batch) {
    const website = candidate.website;
    if (!website) continue;
    const home = await readPage(website, state.pages);
    if (home.blocked || !home.text) continue;
    let text = home.text;
    if (home.html) {
      const extra = sameHostServicesUrl(home.html, website);
      if (extra) {
        const second = await readPage(extra, state.pages);
        if (second.text) text = `${text}\n${second.text}`;
      }
    }
    let match = matchPageToTrades(text);
    const guided = await askJson(
      model,
      "Return JSON {\"tradeIds\":string[],\"capabilities\":string[],\"serviceContexts\":string[],\"specialism\":string}. Use only the trade ids and specialisation ids you are given. serviceContexts are private, hoa, municipal, commercial, industrial.",
      `Trades: ${TRADES.trades
        .map((t) => `${t.id} (${t.specialisations.map((s) => s.id).join(", ")})`)
        .join("; ")}. Page text:\n${text.slice(0, 4000)}`,
    );
    if (guided) {
      const deterministic = match;
      const tradeIds = Array.isArray(guided.tradeIds)
        ? guided.tradeIds.filter((id): id is TradeId => TRADE_IDS.includes(id as TradeId))
        : deterministic.tradeIds;
      const allowed = new Set(
        TRADES.trades.flatMap((t) => t.specialisations.map((s) => s.id)),
      );
      const capabilities = Array.isArray(guided.capabilities)
        ? guided.capabilities.filter((id): id is string => typeof id === "string" && allowed.has(id))
        : deterministic.capabilities;
      match = {
        ...deterministic,
        tradeIds: tradeIds.length ? tradeIds : deterministic.tradeIds,
        primaryTradeId: (tradeIds[0] as TradeId | undefined) ?? deterministic.primaryTradeId,
        capabilities: capabilities.length ? capabilities : deterministic.capabilities,
        specialism:
          typeof guided.specialism === "string" && guided.specialism.trim()
            ? guided.specialism.trim().slice(0, 160)
            : deterministic.specialism,
      };
    }
    const tradeId = candidate.tradeId ?? match.primaryTradeId ?? "";
    if (tradeId) {
      const count = perDoor.get(tradeId) ?? 0;
      if (count >= MAX_COMPANIES_PER_DOOR) continue;
      perDoor.set(tradeId, count + 1);
    }
    state.pages.set(website, text);
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
  const seenNames = new Set(payloads.map((p) => p.name.trim().toLowerCase()));
  for (const candidate of state.cell.candidates.filter((c) => !c.website).slice(0, MAX_HARVESTS)) {
    if (seenNames.has(candidate.name.trim().toLowerCase())) continue;
    seenNames.add(candidate.name.trim().toLowerCase());
    payloads.push({
      name: candidate.name,
      region: place,
      address: addressLine,
      sourceNames: candidate.sourceName ? [candidate.sourceName] : [],
      profileSnippet: `${candidate.name} · named locally in ${place}`,
    });
  }
  if (payloads.length) await h3.applyPlaceCell(state.cell, [], payloads);
}

async function authenticity(state: Working): Promise<void> {
  const payloads: {
    name: string;
    website_url?: string;
    address?: string;
    region?: string;
    localAuthenticity?: Company["localAuthenticity"];
  }[] = [];
  for (const company of state.companies) {
    if (!company.website_url || company.localAuthenticity) continue;
    const page = await readPage(company.website_url, state.pages);
    const match = matchPageToTrades(page.text);
    const judged = classifyLocalAuthenticity({
      text: page.text,
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
  if (payloads.length) await h3.applyPlaceCell(state.cell, [], payloads);
}

async function countryCheck(state: Working): Promise<void> {
  let landscape = null;
  try {
    landscape = (await h3.getLandscape(state.cell.countrySlug || state.cell.country)).landscape;
  } catch {
    landscape = null;
  }
  const payloads: {
    name: string;
    website_url?: string;
    address?: string;
    region?: string;
    countryChecks?: CountryCheck[];
  }[] = [];
  for (const company of state.companies) {
    if (company.localAuthenticity?.verdict === "fake_local") continue;
    if ((company.countryChecks ?? []).length) continue;
    const tradeId = TRADE_IDS.find((id) => id === company.category);
    if (!tradeId) {
      payloads.push({
        name: company.name,
        website_url: company.website_url,
        address: company.address,
        region: company.region,
        countryChecks: [
          {
            sourceName: "Country map",
            category: "branch_association",
            outcome: "country_map_missing",
          },
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
          {
            sourceName: "Country map",
            category: "branch_association",
            outcome: "country_map_missing",
          },
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
      if (!page.ok || blocked(page.url, page.status, page.html, page.text)) {
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
  if (payloads.length) await h3.applyPlaceCell(state.cell, [], payloads);
}

async function score(state: Working): Promise<void> {
  const payloads: {
    name: string;
    website_url?: string;
    address?: string;
    region?: string;
    trustProposal?: Company["trustProposal"];
  }[] = [];
  for (const company of state.companies) {
    const proposal = buildTrustProposal({
      authenticity: company.localAuthenticity?.verdict ?? "unknown",
      localEvidence: localEvidence(company, state.cell),
      countryChecks: company.countryChecks ?? [],
      kvkPass: company.kvk_gate === "pass",
    });
    payloads.push({
      name: company.name,
      website_url: company.website_url,
      address: company.address,
      region: company.region,
      trustProposal: proposal,
    });
  }
  if (payloads.length) await h3.applyPlaceCell(state.cell, [], payloads);
}
