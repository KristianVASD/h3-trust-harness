import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  HhhPublicShortlistSchema,
  cardFromFound,
  cardFromStoredFound,
  classifyLocalAuthenticity,
  companiesFromSearch,
  lookupFoundOutcome,
  selectFreshFound,
  tradeLabel,
  type GeminiCandidate,
  type GeminiFoundCompany,
  type HhhPublicShortlist,
  type TradeId,
} from "@h3-trust/schema";
import { fetchPage, pageBlocked } from "./address-search-fetch.js";
import { checkLocalMentions, findLocalCompanies } from "./hhh-gemini-search.js";
import { getPartnerJob, savePartnerJob } from "./hhh-shortlist-jobs.js";
import { scheduleHhhFoundKnockout } from "./hhh-shortlist-kick.js";
import {
  loadFoundCompaniesForPlace,
  markFoundKnockout,
  storeFoundCompanies,
} from "./hhh-shortlist-persist.js";
import type { PlaceCellStore } from "./place-cell-store.js";
import type { Store } from "@h3-trust/store";

const STALE_MS = 90_000;

type GeminiStage = "lookup" | "find" | "check" | "gate" | "store" | "done";

type GeminiPayload = {
  route: "gemini-found";
  requestId: string;
  postcode4?: string;
  gemeente?: string;
  woonplaats?: string;
  placeLabel: string;
  lat: number;
  lon: number;
  tradeId: TradeId;
  elementCodes: string[];
  jobText: string;
  stage: GeminiStage;
  lock?: string;
  lockAt?: string;
  candidates: GeminiCandidate[];
  found: GeminiFoundCompany[];
  drops: string[];
  findSkips: string[];
  findRaw?: string;
  fromCache: boolean;
  progress: string[];
  lastError?: string;
  knockout?: "pending" | "done";
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readCandidates(value: unknown): GeminiCandidate[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const name = asString(row.name);
    if (!name) return [];
    return [
      {
        name,
        website: asString(row.website) ?? "",
        address: asString(row.address) ?? "",
        phone: asString(row.phone) ?? "",
        email: asString(row.email) ?? "",
      },
    ];
  });
}

export function readGeminiPayload(raw: Record<string, unknown>): GeminiPayload | null {
  if (raw.route !== "gemini-found") return null;
  const tradeId = asString(raw.tradeId);
  if (!tradeId) throw new Error("Shortlist job is missing a trade");
  const stages: GeminiStage[] = ["lookup", "find", "check", "gate", "store", "done"];
  const stage = stages.includes(raw.stage as GeminiStage) ? (raw.stage as GeminiStage) : "lookup";
  return {
    route: "gemini-found",
    requestId: asString(raw.requestId) ?? "",
    postcode4: asString(raw.postcode4),
    gemeente: asString(raw.gemeente),
    woonplaats: asString(raw.woonplaats),
    placeLabel: asString(raw.placeLabel) ?? "NL",
    lat: typeof raw.lat === "number" ? raw.lat : 0,
    lon: typeof raw.lon === "number" ? raw.lon : 0,
    tradeId: tradeId as TradeId,
    elementCodes: Array.isArray(raw.elementCodes)
      ? raw.elementCodes.filter((code): code is string => typeof code === "string")
      : [],
    jobText: asString(raw.jobText) ?? "",
    stage,
    lock: asString(raw.lock),
    lockAt: asString(raw.lockAt),
    candidates: readCandidates(raw.candidates),
    found: Array.isArray(raw.found) ? (raw.found as GeminiFoundCompany[]) : [],
    drops: Array.isArray(raw.drops) ? raw.drops.filter((item): item is string => typeof item === "string") : [],
    findSkips: Array.isArray(raw.findSkips)
      ? raw.findSkips.filter((item): item is string => typeof item === "string").slice(0, 12)
      : [],
    findRaw: asString(raw.findRaw)?.slice(0, 500),
    fromCache: raw.fromCache === true,
    progress: Array.isArray(raw.progress)
      ? raw.progress.filter((item): item is string => typeof item === "string").slice(-30)
      : [],
    lastError: asString(raw.lastError),
    knockout: raw.knockout === "done" || raw.knockout === "pending" ? raw.knockout : undefined,
  };
}

function note(payload: GeminiPayload, message: string): void {
  payload.progress = [...payload.progress, message].slice(-30);
}

function canRun(payload: GeminiPayload, incoming?: string): boolean {
  const at = payload.lockAt ? Date.parse(payload.lockAt) : Number.NaN;
  const fresh = Boolean(payload.lock) && Number.isFinite(at) && Date.now() - at < STALE_MS;
  if (!fresh) return true;
  return Boolean(incoming) && incoming === payload.lock;
}

function placeQuery(payload: GeminiPayload) {
  return {
    tradeId: payload.tradeId,
    postcode4: payload.postcode4,
    gemeente: payload.gemeente,
  };
}

async function lookup(
  store: Store,
  payload: GeminiPayload,
  setPublic: (result: HhhPublicShortlist) => void,
): Promise<"continue" | "ready"> {
  const companies = await loadFoundCompaniesForPlace(store, placeQuery(payload));
  const fresh = selectFreshFound(companies, placeQuery(payload));
  if (lookupFoundOutcome(fresh.length) === "ready") {
    const cards = fresh.flatMap((company) => {
      const card = cardFromStoredFound(company, payload.placeLabel);
      return card ? [card] : [];
    });
    payload.fromCache = true;
    payload.stage = "done";
    note(payload, `Found ${cards.length} fresh local companies for this place. Returning those.`);
    setPublic(HhhPublicShortlistSchema.parse({ fromCache: true, companies: cards.slice(0, 5) }));
    return "ready";
  }
  payload.stage = "find";
  note(payload, "No stored local list yet. Asking Gemini to find companies.");
  return "continue";
}

async function find(payload: GeminiPayload): Promise<HhhPublicShortlist | null> {
  const found = await findLocalCompanies({
    tradeLabel: tradeLabel(payload.tradeId),
    jobText: payload.jobText,
    place: [payload.placeLabel, payload.postcode4].filter(Boolean).join(" "),
  });
  const candidates = found.companies;
  payload.candidates = candidates;
  payload.findSkips = found.skipped;
  payload.findRaw = found.raw || undefined;
  note(
    payload,
    found.parsed
      ? `Find step kept ${candidates.length} companies${found.skipped.length ? `, skipped ${found.skipped.length}` : ""}.`
      : "Find step reply was not usable JSON.",
  );
  payload.stage = candidates.length > 0 ? "check" : "done";
  if (candidates.length === 0) {
    return HhhPublicShortlistSchema.parse({ fromCache: false, companies: [] });
  }
  return null;
}

async function check(payload: GeminiPayload): Promise<void> {
  let found = companiesFromSearch(payload.candidates, null);
  try {
    const checked = await checkLocalMentions({
      place: payload.placeLabel,
      tradeLabel: tradeLabel(payload.tradeId),
      companies: payload.candidates,
    });
    found = companiesFromSearch(payload.candidates, checked);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Local-mention check failed";
    note(payload, `${message} Returning the companies from the first search.`);
  }
  const mentioned = found.filter((row) => row.hits.some((hit) => hit.kind !== "search")).length;
  payload.found = found;
  payload.drops = [];
  note(
    payload,
    found.length === 0
      ? "The first search returned no company."
      : mentioned > 0
        ? `Returning ${found.length} companies. ${mentioned} also have a local mention.`
        : `No club or association page. Returning ${found.length} companies from the search.`,
  );
  payload.stage = "store";
}

async function rememberedCards(store: Store, payload: GeminiPayload): Promise<HhhPublicShortlist["companies"]> {
  const companies = await loadFoundCompaniesForPlace(store, placeQuery(payload));
  return selectFreshFound(companies, placeQuery(payload)).flatMap((company) => {
    const card = cardFromStoredFound(company, payload.placeLabel);
    return card ? [card] : [];
  });
}

function publishCards(cards: HhhPublicShortlist["companies"]): HhhPublicShortlist["companies"] {
  const seen = new Set<string>();
  const unique = cards.filter((card) => {
    if (seen.has(card.id)) return false;
    seen.add(card.id);
    return true;
  });
  return unique
    .sort(
      (a, b) =>
        (b.sourceCount ?? b.score) - (a.sourceCount ?? a.score) || a.name.localeCompare(b.name, "nl"),
    )
    .slice(0, 5);
}

async function storeFound(
  args: { store: Store; cells: PlaceCellStore },
  payload: GeminiPayload,
  setPublic: (result: HhhPublicShortlist) => void,
): Promise<void> {
  const observedAt = new Date().toISOString();
  const remembered = await rememberedCards(args.store, payload);
  if (payload.found.length === 0) {
    payload.stage = "done";
    const companies = publishCards(remembered);
    setPublic(HhhPublicShortlistSchema.parse({ fromCache: false, companies }));
    note(
      payload,
      companies.length > 0
        ? `No new local mention. Returning ${companies.length} companies already on file.`
        : "No company had a local mention.",
    );
    return;
  }
  const stored = await storeFoundCompanies({
    store: args.store,
    cells: args.cells,
    place: {
      postcode4: payload.postcode4,
      gemeente: payload.gemeente,
      woonplaats: payload.woonplaats,
      placeLabel: payload.placeLabel,
      lat: payload.lat,
      lon: payload.lon,
      tradeId: payload.tradeId,
    },
    rows: payload.found,
    observedAt,
  });
  payload.drops = [...payload.drops, ...stored.withheld];
  const fresh = payload.found.flatMap((row) => {
    const id = stored.ids.get(row.name);
    if (!id) return [];
    return [
      cardFromFound({
        id,
        row,
        place: payload.placeLabel,
        tradeId: payload.tradeId,
        observedAt,
      }),
    ];
  });
  const companies = publishCards([...fresh, ...remembered]);
  payload.stage = "done";
  payload.knockout = "pending";
  setPublic(HhhPublicShortlistSchema.parse({ fromCache: false, companies }));
  note(payload, `Returning ${companies.length} companies as gevonden.`);
}

export async function runGeminiFoundSlice(args: {
  admin: SupabaseClient;
  store: Store;
  cells: PlaceCellStore;
  jobId: string;
  lock?: string;
  release?: boolean;
}): Promise<{ continue: boolean; lock?: string }> {
  const job = await getPartnerJob(args.admin, args.jobId);
  if (!job || job.status === "ready" || job.status === "failed") return { continue: false };
  const payload = readGeminiPayload(job.payload);
  if (!payload) return { continue: false };
  if (!canRun(payload, args.lock)) return { continue: false };
  const lock = randomUUID();
  payload.lock = lock;
  payload.lockAt = new Date().toISOString();
  let publicResult = job.public_result;
  await savePartnerJob(args.admin, {
    id: job.id,
    status: "running",
    payload: { ...payload },
    publicResult,
  });
  try {
    let outcome: "continue" | "ready" = "continue";
    if (payload.stage === "lookup") outcome = await lookup(args.store, payload, (next) => (publicResult = next));
    else if (payload.stage === "find") {
      const tries = payload.progress.filter((line) => line.startsWith("Searching the live web")).length;
      if (tries >= 2) {
        payload.stage = "done";
        note(payload, "Live search was started twice and did not finish.");
        publicResult = HhhPublicShortlistSchema.parse({ fromCache: false, companies: [] });
      } else {
        note(payload, "Searching the live web for local companies.");
        await savePartnerJob(args.admin, {
          id: job.id,
          status: "running",
          payload: { ...payload },
          publicResult,
        });
        const empty = await find(payload);
        if (empty) publicResult = empty;
      }
    } else if (payload.stage === "check") await check(payload);
    else if (payload.stage === "gate") payload.stage = "store";
    else if (payload.stage === "store") {
      await storeFound(args, payload, (next) => (publicResult = next));
      outcome = "ready";
    } else outcome = "ready";
    if (payload.stage === "done") outcome = "ready";
    if (outcome === "ready") {
      payload.lock = undefined;
      payload.lockAt = undefined;
      await savePartnerJob(args.admin, {
        id: job.id,
        status: "ready",
        payload: { ...payload },
        publicResult,
      });
      if (payload.knockout === "pending") scheduleHhhFoundKnockout(args.jobId);
      return { continue: false };
    }
    await savePartnerJob(args.admin, {
      id: job.id,
      status: "running",
      payload: { ...payload },
      publicResult,
    });
    if (args.release) {
      payload.lock = undefined;
      payload.lockAt = undefined;
      await savePartnerJob(args.admin, {
        id: job.id,
        status: "running",
        payload: { ...payload },
        publicResult,
      });
    }
    return { continue: true, lock: args.release ? undefined : lock };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Shortlist step failed";
    console.error("[hhh-gemini]", message);
    payload.lock = undefined;
    payload.lastError = message;
    note(payload, message);
    await savePartnerJob(args.admin, {
      id: job.id,
      status: "failed",
      payload: { ...payload },
      publicResult: null,
    });
    return { continue: false };
  }
}

/** Homepage read only. A fake-local verdict hides the company on the next read. */
export async function runFoundKnockout(args: {
  admin: SupabaseClient;
  store: Store;
  jobId: string;
}): Promise<void> {
  const job = await getPartnerJob(args.admin, args.jobId);
  if (!job || job.status !== "ready" || !job.public_result) return;
  const payload = readGeminiPayload(job.payload);
  if (!payload || payload.knockout === "done") return;
  const checkedAt = new Date().toISOString();
  const hidden = new Set<string>();
  for (const card of job.public_result.companies) {
    if (!card.website) continue;
    const page = await fetchPage(card.website).catch(() => null);
    const text =
      page && page.ok && !pageBlocked(card.website, page.status, page.html, page.text) ? page.text : "";
    const verdict =
      text.trim().length >= 40
        ? classifyLocalAuthenticity({
            text,
            woonplaats: payload.woonplaats,
            postcode4: payload.postcode4,
            mentionedInEcology: true,
            hasCraft: false,
          })
        : { verdict: "unknown" as const, reasons: ["Homepage could not be read"] };
    await markFoundKnockout({
      store: args.store,
      companyId: card.id,
      verdict: verdict.verdict,
      reasons: verdict.reasons,
      checkedAt,
    });
    if (verdict.verdict === "fake_local") hidden.add(card.id);
  }
  payload.knockout = "done";
  payload.drops = [
    ...payload.drops,
    ...job.public_result.companies.filter((card) => hidden.has(card.id)).map((card) => `${card.name}: fake_local`),
  ];
  const companies = job.public_result.companies.filter((card) => !hidden.has(card.id));
  if (hidden.size > 0) note(payload, `Antifaker hid ${hidden.size} companies.`);
  await savePartnerJob(args.admin, {
    id: job.id,
    status: "ready",
    payload: { ...payload },
    publicResult: { ...job.public_result, companies },
  });
}
