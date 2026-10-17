import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  HhhPublicShortlistSchema,
  OV_PICK_COUNT,
  OV_RADIUS_KM,
  SPORT_PICK_COUNT,
  TradeIdSchema,
  buildVisitList,
  canonicalWebsite,
  choosePublicPassers,
  lookupOutcome,
  mergeCategorySignals,
  pickNearest,
  publicFromFresh,
  selectFreshPartners,
  selectStalePartners,
  signalOnPage,
  tradeLabel,
  type CategorySignal,
  type HhhPublicShortlist,
  type TradeId,
} from "@h3-trust/schema";
import type { Store } from "@h3-trust/store";
import { fetchPage, pageBlocked, extractBusinesses } from "./address-search-fetch.js";
import { assessCompany } from "./company-assess.js";
import { getPartnerJob, savePartnerJob } from "./hhh-shortlist-jobs.js";
import { browserSearchCompanies } from "./hhh-shortlist-search.js";
import { listActiveLocalSources } from "./hhh-shortlist-sources.js";
import {
  cardsFromStored,
  loadTrustedCompanies,
  storeShortlistCompanies,
  type StoredAssessment,
} from "./hhh-shortlist-persist.js";
import type { PlaceCellStore } from "./place-cell-store.js";

const STALE_MS = 90_000;

type Hit = { name: string; website: string };

type SignalRow = {
  website: string;
  signal: CategorySignal;
  sourceUrl?: string;
  sourceName?: string;
};

type ShortRow = Hit & {
  signal: "in_category" | "not_listed";
  sourceUrl?: string;
  sourceName?: string;
};

type RecheckRow = {
  companyId: string;
  name: string;
  website: string;
  signal: "in_category" | "not_listed";
  sourceUrl?: string;
  sourceName?: string;
};

type JobPayload = {
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
  stage: "lookup" | "recheck" | "search" | "category" | "assess" | "store" | "done";
  lock?: string;
  lockAt?: string;
  hits: Hit[];
  signals: SignalRow[];
  shortlist: ShortRow[];
  assessIndex: number;
  assessed: StoredAssessment[];
  recheck: RecheckRow[];
  recheckIndex: number;
  drops: string[];
  fromCache: boolean;
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readPayload(raw: Record<string, unknown>): JobPayload {
  const trade = TradeIdSchema.safeParse(raw.tradeId);
  if (!trade.success) throw new Error("Shortlist job is missing a trade");
  const stage = raw.stage;
  const stages = ["lookup", "recheck", "search", "category", "assess", "store", "done"] as const;
  return {
    requestId: asString(raw.requestId) ?? "",
    postcode4: asString(raw.postcode4),
    gemeente: asString(raw.gemeente),
    woonplaats: asString(raw.woonplaats),
    placeLabel: asString(raw.placeLabel) ?? "NL",
    lat: typeof raw.lat === "number" ? raw.lat : 0,
    lon: typeof raw.lon === "number" ? raw.lon : 0,
    tradeId: trade.data,
    elementCodes: Array.isArray(raw.elementCodes)
      ? raw.elementCodes.filter((code): code is string => typeof code === "string")
      : [],
    jobText: asString(raw.jobText) ?? "",
    stage: stages.includes(stage as JobPayload["stage"]) ? (stage as JobPayload["stage"]) : "lookup",
    lock: asString(raw.lock),
    lockAt: asString(raw.lockAt),
    hits: Array.isArray(raw.hits) ? (raw.hits as Hit[]) : [],
    signals: Array.isArray(raw.signals) ? (raw.signals as SignalRow[]) : [],
    shortlist: Array.isArray(raw.shortlist) ? (raw.shortlist as ShortRow[]) : [],
    assessIndex: typeof raw.assessIndex === "number" ? raw.assessIndex : 0,
    assessed: Array.isArray(raw.assessed) ? (raw.assessed as StoredAssessment[]) : [],
    recheck: Array.isArray(raw.recheck) ? (raw.recheck as RecheckRow[]) : [],
    recheckIndex: typeof raw.recheckIndex === "number" ? raw.recheckIndex : 0,
    drops: Array.isArray(raw.drops) ? raw.drops.filter((item): item is string => typeof item === "string") : [],
    fromCache: raw.fromCache === true,
  };
}

function canRun(payload: JobPayload, incoming?: string): boolean {
  const at = payload.lockAt ? Date.parse(payload.lockAt) : Number.NaN;
  const fresh = Boolean(payload.lock) && Number.isFinite(at) && Date.now() - at < STALE_MS;
  if (!fresh) return true;
  return Boolean(incoming) && incoming === payload.lock;
}

function modelName(): string {
  return process.env.OPENROUTER_MODEL?.trim() || "minimax/minimax-m3:free";
}

export async function runHhhShortlistSlice(args: {
  admin: SupabaseClient;
  store: Store;
  cells: PlaceCellStore;
  jobId: string;
  lock?: string;
}): Promise<{ continue: boolean; lock?: string }> {
  const job = await getPartnerJob(args.admin, args.jobId);
  if (!job || job.status === "ready" || job.status === "failed") return { continue: false };
  const payload = readPayload(job.payload);
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
    const outcome = await advance(args, payload, (next) => {
      publicResult = next;
    });
    if (outcome === "ready") {
      payload.stage = "done";
      payload.lock = undefined;
      payload.lockAt = undefined;
      await savePartnerJob(args.admin, {
        id: job.id,
        status: "ready",
        payload: { ...payload },
        publicResult,
      });
      return { continue: false };
    }
    await savePartnerJob(args.admin, {
      id: job.id,
      status: "running",
      payload: { ...payload },
      publicResult,
    });
    return { continue: true, lock };
  } catch (err) {
    console.error("[hhh-shortlist]", err instanceof Error ? err.message : err);
    payload.lock = undefined;
    await savePartnerJob(args.admin, {
      id: job.id,
      status: "failed",
      payload: { ...payload },
      publicResult: null,
    });
    return { continue: false };
  }
}

async function advance(
  args: {
    admin: SupabaseClient;
    store: Store;
    cells: PlaceCellStore;
  },
  payload: JobPayload,
  setPublic: (result: HhhPublicShortlist) => void,
): Promise<"continue" | "ready"> {
  if (payload.stage === "lookup") return lookup(args.store, payload, setPublic);
  if (payload.stage === "recheck") return recheck(payload);
  if (payload.stage === "search") {
    await search(payload);
    return "continue";
  }
  if (payload.stage === "category") {
    await category(args.admin, payload);
    return "continue";
  }
  if (payload.stage === "assess") {
    await assessOne(payload);
    return "continue";
  }
  if (payload.stage === "store") {
    await storePass(args, payload, setPublic);
    return "ready";
  }
  return "ready";
}

async function lookup(
  store: Store,
  payload: JobPayload,
  setPublic: (result: HhhPublicShortlist) => void,
): Promise<"continue" | "ready"> {
  const companies = await loadTrustedCompanies(store);
  const query = {
    tradeId: payload.tradeId,
    postcode4: payload.postcode4,
    gemeente: payload.gemeente,
  };
  const fresh = selectFreshPartners(companies, query);
  const stale = selectStalePartners(companies, query);
  const outcome = lookupOutcome(fresh.length, stale.length);
  if (outcome === "ready") {
    payload.fromCache = true;
    setPublic(
      HhhPublicShortlistSchema.parse({
        fromCache: true,
        companies: publicFromFresh(fresh, payload.placeLabel),
      }),
    );
    return "ready";
  }
  if (outcome === "recheck") {
    payload.recheck = stale.map((company) => {
      const trust = company.partnerTrust;
      const signal =
        trust?.categorySignal === "in_category" || trust?.status === "lokaal_verbonden"
          ? "in_category"
          : "not_listed";
      const list = trust?.facts.find((fact) => fact.kind === "list_mention");
      return {
        companyId: company.id,
        name: company.name,
        website: company.website_url ?? "",
        signal,
        sourceUrl: list?.sourceUrl,
        sourceName: list?.sourceName,
      };
    });
    payload.recheckIndex = 0;
    payload.assessed = [];
    payload.stage = "recheck";
    return "continue";
  }
  payload.stage = "search";
  return "continue";
}

async function recheck(payload: JobPayload): Promise<"continue"> {
  const passes = payload.assessed.filter((item) => item.assessment.pass).length;
  const row = passes >= 3 ? undefined : payload.recheck[payload.recheckIndex];
  if (!row) {
    payload.stage = passes >= 3 ? "store" : "search";
    if (payload.stage === "search") payload.assessed = [];
    return "continue";
  }
  const assessment = await assessCompany({
    name: row.name,
    website: row.website,
    tradeId: payload.tradeId,
    elementCodes: payload.elementCodes,
    jobText: payload.jobText,
    woonplaats: payload.woonplaats,
    postcode4: payload.postcode4,
    signal: row.signal,
    model: modelName(),
  });
  payload.assessed.push({
    name: row.name,
    website: row.website,
    signal: row.signal,
    sourceUrl: row.sourceUrl,
    sourceName: row.sourceName,
    assessment,
  });
  if (!assessment.pass && assessment.withholdReason) {
    payload.drops.push(`${row.name}: ${assessment.withholdReason}`);
  }
  payload.recheckIndex += 1;
  return "continue";
}

async function search(payload: JobPayload): Promise<void> {
  payload.hits = await browserSearchCompanies({
    model: modelName(),
    tradeLabel: tradeLabel(payload.tradeId),
    jobText: payload.jobText,
    place: payload.placeLabel,
    postcode4: payload.postcode4,
    elementCodes: payload.elementCodes,
  });
  payload.stage = "category";
}

async function category(admin: SupabaseClient, payload: JobPayload): Promise<void> {
  const sources = await listActiveLocalSources(admin).catch(() => []);
  const located = sources.flatMap((row) =>
    row.lat == null || row.lon == null ? [] : [{ ...row, lat: row.lat, lon: row.lon }],
  );
  const origin = { lat: payload.lat, lon: payload.lon };
  const ovs = pickNearest(
    origin,
    located.filter((row) => row.kind === "ov"),
    OV_PICK_COUNT,
    OV_RADIUS_KM,
  );
  const sports = pickNearest(
    origin,
    located.filter((row) => row.kind === "sport"),
    SPORT_PICK_COUNT,
    OV_RADIUS_KM,
  );
  const pages = await Promise.all(
    [...ovs, ...sports].map(async (source) => {
      const page = await fetchPage(source.website, 7000);
      const usable =
        page.ok && !pageBlocked(source.website, page.status, page.html, page.text);
      return { source, html: usable ? page.html : "", text: usable ? page.text : "" };
    }),
  );
  payload.signals = payload.hits.map((hit) => {
    const mentions = pages.map((page) => ({
      signal: page.text
        ? signalOnPage(page.text, hit.name, payload.tradeId)
        : ("not_listed" as const),
      sourceUrl: page.source.website,
      sourceName: page.source.name,
    }));
    const signal = mergeCategorySignals(mentions.map((mention) => mention.signal));
    const listed = mentions.find((mention) => mention.signal === "in_category");
    return {
      website: hit.website,
      signal,
      sourceUrl: listed?.sourceUrl,
      sourceName: listed?.sourceName,
    };
  });
  const localFound: Array<{
    name: string;
    website: string;
    sourceUrl: string;
    sourceName: string;
  }> = [];
  for (const page of pages) {
    if (!page.html) continue;
    const mode = page.source.kind === "sport" ? "sponsor" : "members";
    for (const business of extractBusinesses(page.html, page.source.website, mode)) {
      const website = business.website ? canonicalWebsite(business.website) : null;
      if (!website) continue;
      if (signalOnPage(page.text, business.name, payload.tradeId) !== "in_category") continue;
      localFound.push({
        name: business.name,
        website,
        sourceUrl: page.source.website,
        sourceName: page.source.name,
      });
    }
  }
  payload.shortlist = buildVisitList(
    payload.hits.map((hit) => {
      const signal = payload.signals.find((row) => row.website === hit.website);
      const gold = signal?.signal === "in_category";
      return {
        ...hit,
        signal: gold ? ("in_category" as const) : ("not_listed" as const),
        sourceUrl: gold ? signal?.sourceUrl : undefined,
        sourceName: gold ? signal?.sourceName : undefined,
      };
    }),
    localFound,
  );
  payload.assessIndex = 0;
  payload.assessed = [];
  payload.stage = payload.shortlist.length === 0 ? "store" : "assess";
}

async function assessOne(payload: JobPayload): Promise<void> {
  const row = payload.shortlist[payload.assessIndex];
  if (!row) {
    payload.stage = "store";
    return;
  }
  const assessment = await assessCompany({
    name: row.name,
    website: row.website,
    tradeId: payload.tradeId,
    elementCodes: payload.elementCodes,
    jobText: payload.jobText,
    woonplaats: payload.woonplaats,
    postcode4: payload.postcode4,
    signal: row.signal,
    model: modelName(),
  });
  payload.assessed.push({
    name: row.name,
    website: row.website,
    signal: row.signal,
    sourceUrl: row.sourceUrl,
    sourceName: row.sourceName,
    assessment,
  });
  if (!assessment.pass && assessment.withholdReason) {
    payload.drops.push(`${row.name}: ${assessment.withholdReason}`);
  }
  payload.assessIndex += 1;
  if (payload.assessIndex >= payload.shortlist.length) payload.stage = "store";
}

async function storePass(
  args: { store: Store; cells: PlaceCellStore },
  payload: JobPayload,
  setPublic: (result: HhhPublicShortlist) => void,
): Promise<void> {
  const ordered = choosePublicPassers(
    payload.assessed.map((row) => ({
      ...row,
      pass: row.assessment.pass,
      elementOverlap: row.assessment.elementOverlap,
      jobTermHits: row.assessment.jobTermHits,
    })),
  );
  const ids = await storeShortlistCompanies({
    store: args.store,
    cells: args.cells,
    place: payload,
    rows: payload.assessed,
  });
  const observedAt = new Date().toISOString();
  const byWebsite = new Map(ordered.map((row) => [row.website, row]));
  const cards = cardsFromStored({
    ids,
    rows: payload.assessed.filter((row) => byWebsite.has(row.website)),
    place: payload.placeLabel,
    tradeId: payload.tradeId,
    observedAt,
  });
  const rankedCards = ordered
    .map((row) => cards.find((card) => card.website === row.website))
    .filter((card): card is NonNullable<typeof card> => Boolean(card));
  setPublic(
    HhhPublicShortlistSchema.parse({
      fromCache: false,
      companies: rankedCards.slice(0, 3),
    }),
  );
  payload.fromCache = false;
}
