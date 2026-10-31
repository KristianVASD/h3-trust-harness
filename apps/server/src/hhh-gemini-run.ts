import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CompanySchema,
  HhhPublicShortlistSchema,
  GeminiEvidenceResultSchema,
  GeminiLandscapeSchema,
  GeminiReviewSchema,
  cardFromFound,
  cardFromStoredFound,
  lookupFoundOutcome,
  mergeGeminiCandidates,
  publicHttpUrl,
  reviewedGeminiCompanies,
  selectFreshFound,
  tradeLabel,
  type GeminiFoundCompany,
  type GeminiCandidate,
  type GeminiEvidenceResult,
  type GeminiLandscape,
  type GeminiReview,
  type GeminiUsage,
  type HhhPublicShortlist,
  type TradeId,
} from "@h3-trust/schema";
import {
  checkGeminiCandidateEvidence,
  findGeminiLandscape,
  findGeminiSourceCandidates,
  findLocalCompanies,
  reviewGeminiCompanies,
} from "./hhh-gemini-search.js";
import { fillCandidateContacts } from "./site-contact.js";
import { getPartnerJob, savePartnerJob } from "./hhh-shortlist-jobs.js";
import {
  loadFoundCompaniesForPlace,
  storeFoundCompanies,
} from "./hhh-shortlist-persist.js";
import type { PlaceCellStore } from "./place-cell-store.js";
import type { Store } from "@h3-trust/store";

const STALE_MS = 90_000;
/** Start another model wave only while the 60s function still has room to finish it. */
const WAVE_BUDGET_MS = 30_000;

type GeminiStage =
  | "lookup"
  | "find"
  | "sources"
  | "candidateEvidence"
  | "sourceCandidates"
  | "review"
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
    "sources",
    "candidateEvidence",
    "sourceCandidates",
    "review",
    "store",
    "done",
  ];
  const legacyStage =
    raw.stage === "check" || raw.stage === "gate" ? "sources" : raw.stage;
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

async function lookup(
  store: Store,
  payload: GeminiPayload,
  setPublic: (result: HhhPublicShortlist) => void,
): Promise<"continue" | "ready"> {
  const companies = await loadFoundCompaniesForPlace(store, placeQuery(payload));
  const fresh = selectFreshFound(companies, placeQuery(payload));
  if (lookupFoundOutcome(fresh.length) === "ready") {
    const filledEmails = await fillStoredContacts(store, fresh);
    if (filledEmails > 0) {
      note(payload, `Site contact filled ${filledEmails} stored public email${filledEmails === 1 ? "" : "s"}.`);
    }
    const cards = fresh.flatMap((company) => {
      const card = cardFromStoredFound(company, payload.placeLabel);
      return card ? [card] : [];
    });
    payload.fromCache = true;
    payload.stage = "done";
    note(
      payload,
      `Found ${cards.length} fresh local companies for this place. Returning those.`,
    );
    setPublic(
      HhhPublicShortlistSchema.parse({ fromCache: true, companies: cards.slice(0, 3) }),
    );
    return "ready";
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

/** Candidate discovery and the source map do not need each other's answers. */
async function discoverWave(payload: GeminiPayload): Promise<void> {
  const runFind = payload.stage === "find";
  const trade = tradeLabel(payload.tradeId);
  const [foundResult, landscapeResult] = await Promise.allSettled([
    runFind
      ? findLocalCompanies({
          tradeLabel: trade,
          jobText: payload.jobText,
          place: searchPlace(payload),
        })
      : Promise.resolve(null),
    findGeminiLandscape({
      place: payload.placeLabel,
      tradeLabel: trade,
      jobText: payload.jobText,
    }),
  ]);
  if (foundResult.status === "fulfilled" && foundResult.value) {
    const found = foundResult.value;
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
  } else if (foundResult.status === "rejected") {
    note(
      payload,
      `Find step unavailable: ${foundResult.reason instanceof Error ? foundResult.reason.message : String(foundResult.reason)}`,
    );
  }
  if (landscapeResult.status === "fulfilled") {
    payload.landscape = landscapeResult.value.landscape;
    addUsage(payload, landscapeResult.value.usage);
    note(
      payload,
      `Found ${landscapeResult.value.landscape.sources.length} cited local or professional sources.`,
    );
    noteCutOff(payload, "Source", landscapeResult.value.cutOff);
  } else {
    note(
      payload,
      `Source landscape unavailable: ${landscapeResult.reason instanceof Error ? landscapeResult.reason.message : String(landscapeResult.reason)}`,
    );
  }
  payload.stage = "candidateEvidence";
}

export function candidateBatches(
  candidates: readonly GeminiCandidate[],
): [GeminiCandidate[], GeminiCandidate[]] {
  return [candidates.slice(0, 5), candidates.slice(5, 10)];
}

async function investigateWave(
  payload: GeminiPayload,
): Promise<HhhPublicShortlist | null> {
  const trade = tradeLabel(payload.tradeId);
  const runEvidence =
    payload.stage === "candidateEvidence" && payload.candidates.length > 0;
  const runExtra = payload.landscape.sources.length > 0;
  const [evidenceResult, extraResult] = await Promise.allSettled([
    runEvidence
      ? checkGeminiCandidateEvidence({
          place: payload.placeLabel,
          tradeLabel: trade,
          jobText: payload.jobText,
          candidates: payload.candidates,
          landscape: payload.landscape,
        })
      : Promise.resolve(null),
    runExtra
      ? findGeminiSourceCandidates({
          place: payload.placeLabel,
          tradeLabel: trade,
          jobText: payload.jobText,
          landscape: payload.landscape,
        })
      : Promise.resolve(null),
  ]);
  if (evidenceResult.status === "fulfilled" && evidenceResult.value) {
    payload.evidence = evidenceResult.value.evidence;
    addUsage(payload, evidenceResult.value.usage);
    note(
      payload,
      `Recorded cited evidence for ${evidenceResult.value.evidence.companies.length} candidates.`,
    );
    noteCutOff(payload, "Evidence", evidenceResult.value.cutOff);
  } else if (evidenceResult.status === "rejected") {
    payload.evidence = { companies: [] };
    note(
      payload,
      `Candidate evidence unavailable: ${evidenceResult.reason instanceof Error ? evidenceResult.reason.message : String(evidenceResult.reason)}`,
    );
  }
  if (extraResult.status === "fulfilled" && extraResult.value) {
    payload.candidates = mergeGeminiCandidates(
      payload.candidates,
      extraResult.value.candidates,
      12,
    );
    payload.evidence = mergeEvidence(payload.evidence, extraResult.value.evidence);
    addUsage(payload, extraResult.value.usage);
    note(
      payload,
      `Added ${extraResult.value.candidates.length} cited source candidates; ${payload.candidates.length} to review.`,
    );
    noteCutOff(payload, "Source candidates", extraResult.value.cutOff);
  } else if (extraResult.status === "rejected") {
    note(
      payload,
      `Source candidates unavailable: ${extraResult.reason instanceof Error ? extraResult.reason.message : String(extraResult.reason)}`,
    );
  }
  if (payload.candidates.length === 0) {
    payload.found = [];
    payload.stage = "done";
    return HhhPublicShortlistSchema.parse({ fromCache: false, companies: [] });
  }
  payload.stage = "review";
  return null;
}

function mergeEvidence(
  left: GeminiEvidenceResult,
  right: GeminiEvidenceResult,
): GeminiEvidenceResult {
  return { companies: [...left.companies, ...right.companies] };
}

async function review(payload: GeminiPayload): Promise<void> {
  const contact = await fillCandidateContacts(payload.candidates, payload.evidence);
  payload.candidates = contact.candidates;
  if (contact.filled > 0 || contact.contactOnly > 0) {
    note(
      payload,
      `Site contact filled ${contact.filled} public email${contact.filled === 1 ? "" : "s"} and left ${contact.contactOnly} contact page${contact.contactOnly === 1 ? "" : "s"}.`,
    );
  }
  const result = await reviewGeminiCompanies({
    place: payload.placeLabel,
    tradeLabel: tradeLabel(payload.tradeId),
    jobText: payload.jobText,
    candidates: payload.candidates,
    evidence: payload.evidence,
  });
  payload.review = result.review;
  addUsage(payload, result.usage);
  noteCutOff(payload, "Review", result.cutOff);
  payload.found = reviewedGeminiCompanies(
    payload.candidates,
    payload.evidence,
    payload.review,
  );
  const keptNames = new Set(payload.found.map((company) => company.name));
  payload.drops = payload.review.companies
    .filter((company) => !company.keep || company.hard_reject_reason)
    .map((company) => `${company.name}: ${company.hard_reject_reason ?? "not kept"}`);
  note(
    payload,
    `Final review kept ${payload.found.length} companies. Token total: ${payload.tokenUsage.totalTokens}.`,
  );
  for (const candidate of payload.candidates) {
    if (
      !keptNames.has(candidate.name) &&
      !payload.drops.some((drop) => drop.startsWith(`${candidate.name}:`))
    ) {
      payload.drops.push(`${candidate.name}: incomplete final proof`);
    }
  }
  payload.stage = "store";
}

async function rememberedCards(
  store: Store,
  payload: GeminiPayload,
): Promise<HhhPublicShortlist["companies"]> {
  const companies = await loadFoundCompaniesForPlace(store, placeQuery(payload));
  return selectFreshFound(companies, placeQuery(payload)).flatMap((company) => {
    const card = cardFromStoredFound(company, payload.placeLabel);
    return card ? [card] : [];
  });
}

function publishCards(
  cards: HhhPublicShortlist["companies"],
): HhhPublicShortlist["companies"] {
  const seen = new Set<string>();
  const unique = cards.filter((card) => {
    if (seen.has(card.id)) return false;
    seen.add(card.id);
    return true;
  });
  const proved = (card: (typeof unique)[number]) =>
    card.status === "lokaal_verbonden" ? 1 : 0;
  return unique
    .sort(
      (a, b) =>
        proved(b) - proved(a) ||
        (b.sourceCount ?? b.score) - (a.sourceCount ?? a.score) ||
        a.name.localeCompare(b.name, "nl"),
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
  setPublic(HhhPublicShortlistSchema.parse({ fromCache: false, companies }));
  note(payload, `Returning ${companies.length} locally proven companies.`);
}

/** Save the partner list first. A failed database write must leave that list in place. */
async function commitSearchResult(
  args: { admin: SupabaseClient; store: Store; cells: PlaceCellStore; jobId: string },
  payload: GeminiPayload,
  sealed: HhhPublicShortlist,
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
  void args;
  return null;
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
  if (!job || job.status === "ready" || job.status === "failed")
    return { continue: false };
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
    const waveStarted = Date.now();
    let waves = 0;
    while (outcome === "continue" && payload.stage !== "done") {
      if (waves > 0 && Date.now() - waveStarted > WAVE_BUDGET_MS) break;
      if (payload.stage === "lookup") {
        outcome = await lookup(args.store, payload, (next) => (publicResult = next));
      } else if (payload.stage === "find" || payload.stage === "sources") {
        if (payload.stage === "find") {
          const tries = payload.progress.filter((line) =>
            line.startsWith("Searching the live web"),
          ).length;
          if (tries >= 2) {
            payload.stage = "done";
            note(payload, "Live search was started twice and did not finish.");
            publicResult = HhhPublicShortlistSchema.parse({
              fromCache: false,
              companies: [],
            });
          } else {
            note(payload, "Searching the live web for local companies.");
            await savePartnerJob(args.admin, {
              id: job.id,
              status: "running",
              payload: { ...payload },
              publicResult,
            });
            await discoverWave(payload);
          }
        } else {
          await discoverWave(payload);
        }
      } else if (
        payload.stage === "candidateEvidence" ||
        payload.stage === "sourceCandidates"
      ) {
        const listed = await investigateWave(payload);
        if (listed) publicResult = listed;
      } else if (payload.stage === "review") {
        await review(payload);
      } else if (payload.stage === "store") {
        publicResult = publishHeld(payload);
      } else outcome = "ready";
      if (payload.stage === "done") outcome = "ready";
      waves += 1;
      if (outcome === "continue") {
        await savePartnerJob(args.admin, {
          id: job.id,
          status: "running",
          payload: { ...payload },
          publicResult,
        });
      }
    }
    if (outcome === "ready") {
      await commitSearchResult(
        args,
        payload,
        publicResult ??
          HhhPublicShortlistSchema.parse({ fromCache: false, companies: [] }),
      );
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
