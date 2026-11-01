import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CompanySchema,
  HhhPublicShortlistSchema,
  GeminiEvidenceResultSchema,
  GeminiLandscapeSchema,
  GeminiReviewSchema,
  acceptLocalPage,
  annotateFoundReview,
  applyShortlistGates,
  attachVerifiedLocalHits,
  cardFromFound,
  cardFromStoredFound,
  citedLocalHits,
  domainAgeYears,
  foldTradeLabel,
  lookupFoundOutcome,
  publicHttpUrl,
  registrationMillis,
  selectFreshFound,
  tradeLabel,
  websiteHost,
  type GeminiFoundCompany,
  type GeminiCandidate,
  type GeminiCheck,
  type GeminiEvidenceResult,
  type GeminiLandscape,
  type GeminiReview,
  type GeminiUsage,
  type HhhPublicShortlist,
  type LocalHit,
  type TradeId,
} from "@h3-trust/schema";
import { checkLocalMentions, findLocalCompanies, reviewGeminiCompanies } from "./hhh-gemini-search.js";
import { fetchPage, pageBlocked } from "./address-search-fetch.js";
import { fillCandidateContacts, screenCandidateSites } from "./site-contact.js";
import { getPartnerJob, isShortlistResult, savePartnerJob } from "./hhh-shortlist-jobs.js";
import {
  loadFoundCompaniesForPlace,
  storeFoundCompanies,
} from "./hhh-shortlist-persist.js";
import type { PlaceCellStore } from "./place-cell-store.js";
import type { Store } from "@h3-trust/store";

const STALE_MS = 90_000;
/** A search that has not finished its review by then fails empty. */
const SEARCH_BUDGET_MS = 3 * 60 * 1000;

type GeminiStage =
  | "lookup"
  | "find"
  | "check"
  | "sources"
  | "candidateEvidence"
  | "sourceCandidates"
  | "review"
  | "mentions"
  | "store"
  | "done";

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
  /** Set when the job is created. The three-minute clock starts here. */
  startedAt?: string;
  lock?: string;
  lockAt?: string;
  candidates: GeminiCandidate[];
  landscape: GeminiLandscape;
  evidence: GeminiEvidenceResult;
  review: GeminiReview;
  tokenUsage: GeminiUsage;
  found: GeminiFoundCompany[];
  drops: string[];
  findSkips: string[];
  findRaw?: string;
  fromCache: boolean;
  progress: string[];
  lastError?: string;
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
        contactUrl: publicHttpUrl(asString(row.contactUrl)),
        candidateBasis: Array.isArray(row.candidateBasis)
          ? row.candidateBasis.filter((item): item is string => typeof item === "string")
          : [],
        riskFlags: Array.isArray(row.riskFlags)
          ? row.riskFlags.filter((item): item is string => typeof item === "string")
          : [],
      },
    ];
  });
}

function addUsage(payload: GeminiPayload, usage: GeminiUsage): void {
  payload.tokenUsage = {
    promptTokens: payload.tokenUsage.promptTokens + usage.promptTokens,
    completionTokens: payload.tokenUsage.completionTokens + usage.completionTokens,
    totalTokens: payload.tokenUsage.totalTokens + usage.totalTokens,
  };
}

export function readGeminiPayload(raw: Record<string, unknown>): GeminiPayload | null {
  if (raw.route !== "gemini-found") return null;
  const tradeId = asString(raw.tradeId);
  if (!tradeId) throw new Error("Shortlist job is missing a trade");
  const stages: GeminiStage[] = [
    "lookup",
    "find",
    "check",
    "sources",
    "candidateEvidence",
    "sourceCandidates",
    "review",
    "mentions",
    "store",
    "done",
  ];
  const legacyStage = raw.stage === "gate" ? "check" : raw.stage;
  const stage = stages.includes(legacyStage as GeminiStage)
    ? (legacyStage as GeminiStage)
    : "lookup";
  const landscape = GeminiLandscapeSchema.safeParse(raw.landscape);
  const evidence = GeminiEvidenceResultSchema.safeParse(raw.evidence);
  const review = GeminiReviewSchema.safeParse(raw.review);
  const usage =
    raw.tokenUsage && typeof raw.tokenUsage === "object"
      ? (raw.tokenUsage as Record<string, unknown>)
      : {};
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
    startedAt: asString(raw.startedAt),
    lock: asString(raw.lock),
    lockAt: asString(raw.lockAt),
    candidates: readCandidates(raw.candidates),
    landscape: landscape.success ? landscape.data : { sources: [] },
    evidence: evidence.success ? evidence.data : { companies: [] },
    review: review.success ? review.data : { companies: [] },
    tokenUsage: {
      promptTokens: typeof usage.promptTokens === "number" ? usage.promptTokens : 0,
      completionTokens:
        typeof usage.completionTokens === "number" ? usage.completionTokens : 0,
      totalTokens: typeof usage.totalTokens === "number" ? usage.totalTokens : 0,
    },
    found: Array.isArray(raw.found) ? (raw.found as GeminiFoundCompany[]) : [],
    drops: Array.isArray(raw.drops)
      ? raw.drops.filter((item): item is string => typeof item === "string")
      : [],
    findSkips: Array.isArray(raw.findSkips)
      ? raw.findSkips
          .filter((item): item is string => typeof item === "string")
          .slice(0, 12)
      : [],
    findRaw: asString(raw.findRaw)?.slice(0, 500),
    fromCache: raw.fromCache === true,
    progress: Array.isArray(raw.progress)
      ? raw.progress.filter((item): item is string => typeof item === "string").slice(-30)
      : [],
    lastError: asString(raw.lastError),
  };
}

function note(payload: GeminiPayload, message: string): void {
  payload.progress = [...payload.progress, message].slice(-30);
}

function canRun(payload: GeminiPayload, incoming?: string): boolean {
  const at = payload.lockAt ? Date.parse(payload.lockAt) : Number.NaN;
  const fresh =
    Boolean(payload.lock) && Number.isFinite(at) && Date.now() - at < STALE_MS;
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

async function fillStoredContacts(
  store: Store,
  companies: Array<{ name: string; website_url?: string; phone?: string; email?: string }>,
): Promise<number> {
  const missing = companies.filter((company) => !company.email?.trim() && company.website_url);
  if (missing.length === 0) return 0;
  const filled = await fillCandidateContacts(
    missing.map((company) => ({
      name: company.name,
      website: company.website_url ?? "",
      address: "",
      phone: company.phone ?? "",
      email: "",
    })),
    { companies: [] },
  ).catch(() => null);
  if (!filled) return 0;
  const observedAt = new Date().toISOString();
  let count = 0;
  for (let index = 0; index < missing.length; index += 1) {
    const email = filled.candidates[index]?.email.trim();
    if (!email) continue;
    const company = missing[index]!;
    company.email = email;
    count += 1;
    const next = CompanySchema.safeParse({ ...company, email, updatedAt: observedAt });
    if (next.success) await store.upsert("companies", next.data).catch(() => undefined);
  }
  return count;
}

async function storedCards(
  store: Store,
  payload: GeminiPayload,
): Promise<HhhPublicShortlist["companies"]> {
  const companies = await loadFoundCompaniesForPlace(store, placeQuery(payload));
  const fresh = selectFreshFound(companies, placeQuery(payload));
  return fresh.flatMap((company) => {
    const card = cardFromStoredFound(company, payload.placeLabel);
    return card ? [card] : [];
  });
}

async function lookup(
  store: Store,
  payload: GeminiPayload,
  setPublic: (result: HhhPublicShortlist) => void,
): Promise<"continue" | "ready"> {
  let cards: HhhPublicShortlist["companies"] = [];
  try {
    const companies = await loadFoundCompaniesForPlace(store, placeQuery(payload));
    const fresh = selectFreshFound(companies, placeQuery(payload));
    const filledEmails = await fillStoredContacts(store, fresh);
    if (filledEmails > 0) {
      note(payload, `Site contact filled ${filledEmails} stored public email${filledEmails === 1 ? "" : "s"}.`);
    }
    cards = fresh.flatMap((company) => {
      const card = cardFromStoredFound(company, payload.placeLabel);
      return card ? [card] : [];
    });
  } catch {
    note(payload, "Stored companies could not be read. Starting live candidate discovery.");
    payload.stage = "find";
    return "continue";
  }
  const outcome = lookupFoundOutcome(cards.length);
  if (outcome === "ready") {
    payload.fromCache = true;
    payload.stage = "done";
    note(payload, `Found ${cards.length} fresh local companies for this place. Returning those.`);
    setPublic(
      HhhPublicShortlistSchema.parse({ fromCache: true, companies: cards.slice(0, 3) }),
    );
    return "ready";
  }
  if (outcome === "fill") {
    payload.fromCache = true;
    payload.stage = "find";
    note(
      payload,
      `Found ${cards.length} stored companies. Publishing those and searching for more.`,
    );
    setPublic(
      HhhPublicShortlistSchema.parse({ fromCache: true, companies: cards.slice(0, 3) }),
    );
    return "continue";
  }
  payload.stage = "find";
  note(payload, "No complete local shortlist yet. Starting live candidate discovery.");
  return "continue";
}

function cardsForPartner(
  rows: readonly GeminiFoundCompany[],
  place: string,
  tradeId: TradeId,
): HhhPublicShortlist {
  const observedAt = new Date().toISOString();
  const cards = rows.map((row) =>
    cardFromFound({
      id: randomUUID(),
      row,
      place,
      tradeId,
      observedAt,
    }),
  );
  return HhhPublicShortlistSchema.parse({
    fromCache: false,
    companies: publishCards(cards),
  });
}

function publishHeld(payload: GeminiPayload): HhhPublicShortlist {
  payload.stage = "done";
  const listed = cardsForPartner(payload.found, payload.placeLabel, payload.tradeId);
  note(payload, `Returning ${listed.companies.length} reviewed companies.`);
  return listed;
}

function noteCutOff(payload: GeminiPayload, label: string, cutOff: boolean): void {
  if (cutOff) note(payload, `${label} reply was incomplete.`);
}

function searchPlace(payload: GeminiPayload): string {
  return [payload.placeLabel, payload.postcode4].filter(Boolean).join(" ");
}

function searchExpired(payload: GeminiPayload): boolean {
  const start = Date.parse(payload.startedAt ?? "");
  return Number.isFinite(start) && Date.now() - start > SEARCH_BUDGET_MS;
}

type FindCompanies = typeof findLocalCompanies;
type ScreenSites = typeof screenCandidateSites;
type ReviewCompanies = typeof reviewGeminiCompanies;

/** One model call. The site check and the review each get their own invocation. */
async function findOnly(payload: GeminiPayload, findCompanies: FindCompanies): Promise<boolean> {
  const tries = payload.progress.filter((line) => line.startsWith("Searching the live web")).length;
  if (tries >= 2) {
    payload.found = [];
    payload.stage = "done";
    note(payload, "Live search was started twice and did not finish.");
    return true;
  }
  note(payload, "Searching the live web for local companies.");
  const found = await findCompanies({
    tradeLabel: tradeLabel(payload.tradeId),
    jobText: payload.jobText,
    place: searchPlace(payload),
  });
  addUsage(payload, found.usage);
  payload.candidates = found.companies;
  payload.findSkips = found.skipped;
  payload.findRaw = found.raw || undefined;
  note(
    payload,
    found.parsed
      ? `Find step kept ${found.companies.length} companies${found.skipped.length ? `, skipped ${found.skipped.length}` : ""}.`
      : "Find step reply was not usable JSON.",
  );
  noteCutOff(payload, "Find", found.cutOff);
  if (payload.candidates.length === 0) {
    payload.found = [];
    payload.stage = "done";
    return true;
  }
  payload.stage = "check";
  return false;
}

async function checkSites(payload: GeminiPayload, screenSites: ScreenSites): Promise<boolean> {
  const screened = await screenSites(payload.candidates, payload.evidence);
  payload.candidates = screened.candidates;
  payload.drops = [...payload.drops, ...screened.drops];
  if (screened.filled > 0 || screened.contactOnly > 0) {
    note(
      payload,
      `Site contact filled ${screened.filled} public email${screened.filled === 1 ? "" : "s"} and left ${screened.contactOnly} contact page${screened.contactOnly === 1 ? "" : "s"}.`,
    );
  }
  if (payload.candidates.length === 0) {
    payload.found = [];
    payload.stage = "done";
    note(payload, "No company site confirmed the name.");
    return true;
  }
  note(payload, `${payload.candidates.length} company sites confirmed. Ready for review.`);
  payload.stage = "review";
  return false;
}

export function candidateBatches(
  candidates: readonly GeminiCandidate[],
): [GeminiCandidate[], GeminiCandidate[]] {
  return [candidates.slice(0, 5), candidates.slice(5, 10)];
}

type ReadDomainAge = (host: string) => Promise<number | null>;
type CheckMentions = typeof checkLocalMentions;
type FetchMention = (
  url: string,
) => Promise<{ url: string; ok: boolean; status: number; html: string; text: string }>;

async function readDomainAge(host: string): Promise<number | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(host)}`, {
      signal: ctrl.signal,
      headers: { Accept: "application/rdap+json, application/json" },
    });
    if (!res.ok) return null;
    const registered = registrationMillis(await res.json());
    return registered == null ? null : domainAgeYears(registered);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function domainAges(
  candidates: readonly GeminiCandidate[],
  readAge: ReadDomainAge,
): Promise<Record<string, number | null>> {
  const hosts = [
    ...new Set(
      candidates.flatMap((candidate) => {
        const host = websiteHost(candidate.website);
        return host ? [host] : [];
      }),
    ),
  ];
  const rows = await Promise.all(
    hosts.map(async (host) => {
      try {
        return [host, await readAge(host)] as const;
      } catch {
        return [host, null] as const;
      }
    }),
  );
  return Object.fromEntries(rows);
}

/** True when every candidate was rejected. Survivors are stored on the payload. */
async function gateCandidates(
  payload: GeminiPayload,
  readAge: ReadDomainAge,
): Promise<boolean> {
  const gated = applyShortlistGates({
    candidates: payload.candidates,
    place: payload.placeLabel,
    domainAgeByHost: await domainAges(payload.candidates, readAge),
  });
  payload.drops = [...payload.drops, ...gated.dropped];
  payload.found = gated.kept;
  payload.candidates = gated.kept;
  note(
    payload,
    gated.dropped.length
      ? `Code checks kept ${gated.kept.length} companies and dropped ${gated.dropped.length}.`
      : `Code checks kept ${gated.kept.length} companies.`,
  );
  return gated.kept.length === 0;
}

function provisionalList(
  payload: GeminiPayload,
  remembered: HhhPublicShortlist["companies"],
): HhhPublicShortlist {
  const observedAt = new Date().toISOString();
  const fresh = payload.found.map((row) =>
    cardFromFound({
      id: randomUUID(),
      row,
      place: payload.placeLabel,
      tradeId: payload.tradeId,
      observedAt,
    }),
  );
  return HhhPublicShortlistSchema.parse({
    fromCache: false,
    companies: publishCards([...fresh, ...remembered]),
  });
}

async function finishWithoutNewFirms(
  store: Store,
  payload: GeminiPayload,
): Promise<{ outcome: "ready" | "no_results"; result: HhhPublicShortlist }> {
  const companies = publishCards(await rememberedCards(store, payload));
  payload.stage = "done";
  if (companies.length === 0) {
    note(payload, "No stored or new company passed the checks.");
    return {
      outcome: "no_results",
      result: HhhPublicShortlistSchema.parse({ fromCache: false, companies: [] }),
    };
  }
  payload.fromCache = true;
  note(
    payload,
    `No new firm passed the checks. Returning ${companies.length} companies already on file.`,
  );
  return {
    outcome: "ready",
    result: HhhPublicShortlistSchema.parse({ fromCache: true, companies }),
  };
}

async function review(payload: GeminiPayload, reviewCompanies: ReviewCompanies): Promise<void> {
  try {
    const result = await reviewCompanies({
      place: payload.placeLabel,
      tradeLabel: tradeLabel(payload.tradeId),
      jobText: payload.jobText,
      candidates: payload.candidates,
      evidence: payload.evidence,
    });
    payload.review = result.review;
    addUsage(payload, result.usage);
    noteCutOff(payload, "Review", result.cutOff);
    payload.found = annotateFoundReview(payload.found, payload.review);
    note(
      payload,
      `Review noted ${payload.found.length} companies. Token total: ${payload.tokenUsage.totalTokens}.`,
    );
  } catch {
    note(payload, "Review did not finish. Keeping the published companies.");
  }
  payload.stage = "mentions";
}

async function mention(
  payload: GeminiPayload,
  checkMentions: CheckMentions,
  fetchMention: FetchMention,
): Promise<void> {
  try {
    const check: GeminiCheck = await checkMentions({
      place: payload.placeLabel,
      tradeLabel: tradeLabel(payload.tradeId),
      companies: payload.found,
    });
    const verified: { name: string; hits: LocalHit[] }[] = [];
    for (const company of payload.found) {
      const accepted: LocalHit[] = [];
      for (const hit of citedLocalHits(company, check)) {
        try {
          const page = await fetchMention(hit.url);
          if (
            !page.ok ||
            pageBlocked(page.url || hit.url, page.status, page.html, page.text)
          ) {
            continue;
          }
          if (
            !acceptLocalPage({
              companyName: company.name,
              ownHost: websiteHost(company.website) ?? "",
              url: hit.url,
              text: page.text,
            })
          ) {
            continue;
          }
          accepted.push(hit);
        } catch {
          continue;
        }
      }
      verified.push({ name: company.name, hits: accepted });
    }
    payload.found = attachVerifiedLocalHits(payload.found, verified);
    const proved = verified.filter((item) => item.hits.length > 0).length;
    note(payload, `Local pages confirmed for ${proved} companies.`);
  } catch {
    note(payload, "Local mention check did not finish. Companies stay without a local badge.");
  }
  payload.stage = "store";
}

async function rememberedCards(
  store: Store,
  payload: GeminiPayload,
): Promise<HhhPublicShortlist["companies"]> {
  try {
    return await storedCards(store, payload);
  } catch {
    return [];
  }
}

function publishCards(
  cards: HhhPublicShortlist["companies"],
): HhhPublicShortlist["companies"] {
  const seen = new Set<string>();
  const unique = cards.filter((card) => {
    const key = websiteHost(card.website) || foldTradeLabel(card.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const proved = (card: (typeof unique)[number]) =>
    card.status === "lokaal_verbonden" ? 1 : 0;
  return unique
    .sort(
      (a, b) =>
        proved(b) - proved(a) || (b.sourceCount ?? b.score) - (a.sourceCount ?? a.score),
    )
    .slice(0, 3);
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
        ? `No new firm passed the checks. Returning ${companies.length} companies already on file.`
        : "No company passed the checks.",
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
  setPublic(HhhPublicShortlistSchema.parse({ fromCache: false, companies }));
  note(payload, `Returning ${companies.length} companies.`);
}

/** Save the partner list first. A failed database write must leave that list in place. */
async function commitSearchResult(
  args: { admin: SupabaseClient; store: Store; cells: PlaceCellStore; jobId: string },
  payload: GeminiPayload,
  sealed: HhhPublicShortlist,
  persistFound = true,
): Promise<HhhPublicShortlist> {
  payload.stage = "done";
  payload.lock = undefined;
  payload.lockAt = undefined;
  await savePartnerJob(args.admin, {
    id: args.jobId,
    status: "ready",
    payload: { ...payload },
    publicResult: sealed,
  });
  if (!persistFound) return sealed;
  try {
    let stored = sealed;
    await storeFound({ store: args.store, cells: args.cells }, payload, (next) => {
      stored = next;
    });
    payload.lock = undefined;
    payload.lockAt = undefined;
    await savePartnerJob(args.admin, {
      id: args.jobId,
      status: "ready",
      payload: { ...payload },
      publicResult: stored,
    });
    return stored;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Storing the firms failed";
    note(payload, `The company list is saved for HandyHouseHelp. ${message}`);
    payload.stage = "done";
    payload.lock = undefined;
    payload.lockAt = undefined;
    await savePartnerJob(args.admin, {
      id: args.jobId,
      status: "ready",
      payload: { ...payload },
      publicResult: sealed,
    });
    return sealed;
  }
}

/** A poll of a job that already has firms publishes them. It does not start another web search. */
export async function releaseHeldSearch(args: {
  admin: SupabaseClient;
  store: Store;
  cells: PlaceCellStore;
  job: { id: string; status: string; payload: Record<string, unknown> };
}): Promise<HhhPublicShortlist | null> {
  if (args.job.status === "ready" || args.job.status === "failed" || args.job.status === "no_results") {
    return null;
  }
  if (args.job.payload.route !== "gemini-found") return null;
  const payload = readGeminiPayload(args.job.payload);
  if (!payload || payload.stage !== "store" || payload.found.length === 0 || !canRun(payload)) {
    return null;
  }
  const listed = publishHeld(payload);
  return commitSearchResult(
    {
      admin: args.admin,
      store: args.store,
      cells: args.cells,
      jobId: args.job.id,
    },
    payload,
    listed,
  );
}

export async function runGeminiFoundSlice(args: {
  admin: SupabaseClient;
  store: Store;
  cells: PlaceCellStore;
  jobId: string;
  lock?: string;
  release?: boolean;
  findCompanies?: FindCompanies;
  screenSites?: ScreenSites;
  reviewCompanies?: ReviewCompanies;
  readDomainAge?: ReadDomainAge;
  checkMentions?: CheckMentions;
  fetchMention?: FetchMention;
}): Promise<{ continue: boolean; lock?: string }> {
  const job = await getPartnerJob(args.admin, args.jobId);
  if (!job || job.status === "ready" || job.status === "failed" || job.status === "no_results") {
    return { continue: false };
  }
  const payload = readGeminiPayload(job.payload);
  if (!payload) return { continue: false };
  if (!canRun(payload, args.lock)) return { continue: false };
  const lock = randomUUID();
  payload.lock = lock;
  payload.lockAt = new Date().toISOString();
  let publicResult = isShortlistResult(job.public_result) ? job.public_result : null;
  await savePartnerJob(args.admin, {
    id: job.id,
    status: "running",
    payload: { ...payload },
    publicResult,
  });
  const saveNoResults = async (): Promise<void> => {
    payload.stage = "done";
    payload.lock = undefined;
    payload.lockAt = undefined;
    await savePartnerJob(args.admin, {
      id: job.id,
      status: "no_results",
      payload: { ...payload },
      publicResult: HhhPublicShortlistSchema.parse({ fromCache: false, companies: [] }),
    });
  };
  try {
    if (!payload.startedAt) payload.startedAt = new Date().toISOString();
    if (payload.stage !== "store" && payload.stage !== "done" && searchExpired(payload)) {
      if (publicResult && publicResult.companies.length > 0) {
        note(payload, "The search reached three minutes. Returning the companies already found.");
        await commitSearchResult(args, payload, publicResult, payload.found.length > 0);
        return { continue: false };
      }
      note(payload, "The search ran for three minutes without a company to return.");
      await saveNoResults();
      return { continue: false };
    }
    const findCompanies = args.findCompanies ?? findLocalCompanies;
    const screenSites = args.screenSites ?? screenCandidateSites;
    const reviewCompanies = args.reviewCompanies ?? reviewGeminiCompanies;
    const readAge = args.readDomainAge ?? readDomainAge;
    const checkMentions = args.checkMentions ?? checkLocalMentions;
    const fetchMention = args.fetchMention ?? fetchPage;
    let outcome: "continue" | "ready" | "no_results" = "continue";
    const siteStage =
      payload.stage === "check" ||
      payload.stage === "sources" ||
      payload.stage === "candidateEvidence" ||
      payload.stage === "sourceCandidates";
    if (payload.stage === "lookup") {
      outcome = await lookup(args.store, payload, (next) => {
        publicResult = next;
      });
    } else if (payload.stage === "find" || (payload.stage === "sources" && payload.candidates.length === 0)) {
      const finished = await findOnly(payload, findCompanies);
      if (finished) {
        const settled = await finishWithoutNewFirms(args.store, payload);
        publicResult = settled.result;
        outcome = settled.outcome;
      }
    } else if (siteStage) {
      const finished = await checkSites(payload, screenSites);
      if (finished || (await gateCandidates(payload, readAge))) {
        const settled = await finishWithoutNewFirms(args.store, payload);
        publicResult = settled.result;
        outcome = settled.outcome;
      } else {
        publicResult = provisionalList(payload, await rememberedCards(args.store, payload));
        payload.stage = "review";
        note(payload, `Publishing ${publicResult.companies.length} companies before review.`);
      }
    } else if (payload.stage === "review") {
      if (payload.found.length === 0 && payload.candidates.length > 0) {
        const empty = await gateCandidates(payload, readAge);
        if (!empty) {
          publicResult = provisionalList(payload, await rememberedCards(args.store, payload));
        }
      }
      if (payload.found.length === 0) {
        const settled = await finishWithoutNewFirms(args.store, payload);
        publicResult = settled.result;
        outcome = settled.outcome;
      } else {
        await review(payload, reviewCompanies);
      }
    } else if (payload.stage === "mentions") {
      await mention(payload, checkMentions, fetchMention);
      publicResult = provisionalList(payload, await rememberedCards(args.store, payload));
    } else if (payload.stage === "store") {
      publicResult = publishHeld(payload);
      outcome = "ready";
    } else outcome = "ready";
    if (outcome === "no_results") {
      await saveNoResults();
      return { continue: false };
    }
    if (outcome === "ready") {
      if (!publicResult || publicResult.companies.length === 0) {
        const settled = await finishWithoutNewFirms(args.store, payload);
        if (settled.outcome === "no_results") {
          await saveNoResults();
          return { continue: false };
        }
        publicResult = settled.result;
      }
      await commitSearchResult(args, payload, publicResult, payload.found.length > 0);
      return { continue: false };
    }
    payload.lock = undefined;
    payload.lockAt = undefined;
    await savePartnerJob(args.admin, {
      id: job.id,
      status: "running",
      payload: { ...payload },
      publicResult,
    });
    return { continue: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Shortlist step failed";
    console.error("[hhh-gemini]", message);
    payload.lock = undefined;
    payload.lastError = message;
    note(payload, message);
    if (publicResult && publicResult.companies.length > 0) {
      payload.stage = "done";
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
      status: "failed",
      payload: { ...payload },
      publicResult: null,
    });
    return { continue: false };
  }
}
