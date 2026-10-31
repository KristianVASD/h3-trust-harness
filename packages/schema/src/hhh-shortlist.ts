import { z } from "zod";
import { matchPageToTrades } from "./address-search";
import { foldTradeLabel, tradeLabel, TradeIdSchema, type TradeId } from "./trades";

/** How long a stored check may be reused before the website is read again. */
export const PARTNER_FACT_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const SHORTLIST_SEARCH_COUNT = 6;
/** Firms found on a nearby OV or sport site, added on top of the search six. */
export const LOCAL_EXTRA_COUNT = 2;
export const SHORTLIST_POOL_COUNT = SHORTLIST_SEARCH_COUNT + LOCAL_EXTRA_COUNT;
export const SHORTLIST_RETURN_COUNT = 3;
export const SPORT_PICK_COUNT = 3;

export const PartnerTrustStatusSchema = z.enum([
  "gevonden",
  "geverifieerd",
  "lokaal_verbonden",
  "aanbevolen_door_klant",
]);
export type PartnerTrustStatus = z.infer<typeof PartnerTrustStatusSchema>;

export const CategorySignalSchema = z.enum([
  "in_category",
  "other_category",
  "not_listed",
]);
export type CategorySignal = z.infer<typeof CategorySignalSchema>;

export const PartnerFactSchema = z.object({
  kind: z.enum([
    "website",
    "list_mention",
    "search",
    "ov",
    "sport",
    "festivity",
    "professional",
  ]),
  sourceUrl: z.string().min(1),
  observedAt: z.string().min(1),
  expiresAt: z.string().min(1),
  sourceName: z.string().optional(),
});
export type PartnerFact = z.infer<typeof PartnerFactSchema>;

export const PartnerTrustSchema = z.object({
  status: PartnerTrustStatusSchema,
  tradeId: z.string().min(1),
  postcode4: z.string().optional(),
  gemeente: z.string().optional(),
  woonplaats: z.string().optional(),
  score: z.number().min(0).max(100),
  matchNote: z.string().optional(),
  elementCodes: z.array(z.string()).default([]),
  categorySignal: CategorySignalSchema.optional(),
  facts: z.array(PartnerFactSchema).default([]),
});
export type PartnerTrust = z.infer<typeof PartnerTrustSchema>;

export const HhhShortlistRequestSchema = z
  .object({
    requestId: z.string().trim().min(1).max(120),
    postcode4: z
      .string()
      .trim()
      .regex(/^\d{4}$/)
      .optional(),
    gemeente: z.string().trim().min(2).max(80).optional(),
    tradeId: TradeIdSchema,
    elementCodes: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
    jobText: z.string().trim().max(400).optional(),
  })
  .refine((value) => Boolean(value.postcode4 || value.gemeente), {
    message: "postcode4 or gemeente is required",
  });
export type HhhShortlistRequest = z.infer<typeof HhhShortlistRequestSchema>;

export const HhhShortlistEvidenceSchema = z.object({
  kind: z.string().min(1),
  sourceName: z.string().optional(),
  url: z.string().min(1),
  observedAt: z.string().min(1),
});

export const HhhShortlistCompanySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  place: z.string().min(1),
  website: z.string().default(""),
  phone: z.string().optional(),
  email: z.string().optional(),
  /** Company contact page, present when no public email was found. */
  contactUrl: z.string().optional(),
  tradeId: TradeIdSchema,
  tradeLabel: z.string().min(1).optional(),
  status: z.enum(["gevonden", "geverifieerd", "lokaal_verbonden"]),
  badges: z
    .array(
      z.enum([
        "gevonden",
        "klus_passend",
        "vestiging_gecontroleerd",
        "lokaal_verbonden",
        "professioneel_aangesloten",
        "beperkt_bewijs",
        "risicosignaal",
      ]),
    )
    .max(7)
    .default([]),
  /** Gemini route: number of unique local sources, capped at 4. */
  sourceCount: z.number().int().min(1).max(4).optional(),
  score: z.number().min(0).max(100),
  matchNote: z.string().min(1),
  evidence: z.array(HhhShortlistEvidenceSchema).default([]),
});
export type HhhShortlistCompany = z.infer<typeof HhhShortlistCompanySchema>;

/** HandyHouseHelp receives at most the three strongest companies. */
export const PUBLIC_SHORTLIST_MAX = 3;

export const HhhPublicShortlistSchema = z.object({
  fromCache: z.boolean(),
  companies: z.array(HhhShortlistCompanySchema).max(PUBLIC_SHORTLIST_MAX),
});
export type HhhPublicShortlist = z.infer<typeof HhhPublicShortlistSchema>;

const BLOCKED_HOST =
  /^(?:www\.)?(?:google\.|facebook\.|instagram\.|linkedin\.|wikipedia\.|duckduckgo\.|bing\.|openrouter\.)/i;

export function factExpiry(observedAt: string, now = Date.parse(observedAt)): string {
  const start = Number.isFinite(now) ? now : Date.now();
  return new Date(start + PARTNER_FACT_TTL_MS).toISOString();
}

export function evidenceFresh(facts: readonly PartnerFact[], now = Date.now()): boolean {
  return facts.some((fact) => {
    const expires = Date.parse(fact.expiresAt);
    return Number.isFinite(expires) && expires > now;
  });
}

export function websiteHost(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

export function canonicalWebsite(raw: string): string | null {
  const host = websiteHost(raw);
  if (!host || BLOCKED_HOST.test(host)) return null;
  try {
    const url = new URL(
      raw.trim().includes("://") ? raw.trim() : `https://${raw.trim()}`,
    );
    url.hash = "";
    const path = url.pathname.replace(/\/$/, "");
    return `${url.protocol}//${url.hostname.replace(/^www\./i, "").toLowerCase()}${path}${url.search}`;
  } catch {
    return null;
  }
}

/** Keep a proposed firm only when its site showed up in the browser-search hits. */
export function filterHitsToSearch(
  proposed: readonly { name: string; website: string }[],
  searchUrls: readonly string[],
): { name: string; website: string }[] {
  const allowed = new Set(
    searchUrls
      .map((url) => websiteHost(url))
      .filter((host): host is string => Boolean(host)),
  );
  const kept: { name: string; website: string }[] = [];
  const seen = new Set<string>();
  for (const row of proposed) {
    const name = row.name.trim();
    const website = canonicalWebsite(row.website);
    const host = website ? websiteHost(website) : null;
    if (!name || !website || !host || !allowed.has(host) || seen.has(host)) continue;
    seen.add(host);
    kept.push({ name, website });
    if (kept.length >= SHORTLIST_SEARCH_COUNT) break;
  }
  return kept;
}

export function signalOnPage(
  text: string,
  companyName: string,
  tradeId: TradeId,
): CategorySignal {
  const hay = foldTradeLabel(text);
  const name = foldTradeLabel(companyName);
  if (name.length < 4) return "not_listed";
  const at = hay.indexOf(name);
  if (at < 0) return "not_listed";
  const window = hay.slice(Math.max(0, at - 180), at + name.length + 180);
  const match = matchPageToTrades(window);
  if (match.tradeIds.includes(tradeId)) return "in_category";
  if (match.tradeIds.length > 0) return "other_category";
  return "not_listed";
}

export function mergeCategorySignals(signals: readonly CategorySignal[]): CategorySignal {
  if (signals.includes("in_category")) return "in_category";
  if (signals.includes("other_category")) return "other_category";
  return "not_listed";
}

export type VisitHit = {
  name: string;
  website: string;
  signal: "in_category" | "not_listed";
  sourceUrl?: string;
  sourceName?: string;
};

/**
 * Local pages can add at most two firms that are not already in the search six.
 * Same name order every time. A firm already found by search is not counted again.
 */
export function pickLocalExtras<T extends { name: string; website: string }>(
  found: readonly T[],
  already: readonly { name: string; website: string }[],
): T[] {
  const hosts = new Set(
    already
      .map((row) => websiteHost(row.website))
      .filter((host): host is string => Boolean(host)),
  );
  const names = new Set(
    already.map((row) => foldTradeLabel(row.name)).filter((name) => name.length >= 4),
  );
  const sorted = [...found].sort(
    (a, b) => a.name.localeCompare(b.name) || a.website.localeCompare(b.website),
  );
  const out: T[] = [];
  const seen = new Set<string>();
  for (const row of sorted) {
    const website = canonicalWebsite(row.website);
    const host = website ? websiteHost(website) : null;
    const name = foldTradeLabel(row.name);
    if (!website || !host || hosts.has(host) || seen.has(host)) continue;
    if (name.length >= 4 && names.has(name)) continue;
    seen.add(host);
    out.push({ ...row, website });
    if (out.length >= LOCAL_EXTRA_COUNT) break;
  }
  return out;
}

/** The six search hits, plus up to two local extras. Every one of these is visited. */
export function buildVisitList(
  aiHits: readonly {
    name: string;
    website: string;
    signal?: "in_category" | "not_listed";
    sourceUrl?: string;
    sourceName?: string;
  }[],
  localExtras: readonly {
    name: string;
    website: string;
    sourceUrl?: string;
    sourceName?: string;
  }[],
): VisitHit[] {
  const byHost = new Map<string, (typeof localExtras)[number]>();
  const byName = new Map<string, (typeof localExtras)[number]>();
  for (const extra of localExtras) {
    const host = websiteHost(extra.website);
    const name = foldTradeLabel(extra.name);
    if (host && !byHost.has(host)) byHost.set(host, extra);
    if (name.length >= 4 && !byName.has(name)) byName.set(name, extra);
  }
  const ai: VisitHit[] = aiHits.slice(0, SHORTLIST_SEARCH_COUNT).map((hit) => {
    const host = websiteHost(hit.website);
    const name = foldTradeLabel(hit.name);
    const doubled =
      (host ? byHost.get(host) : undefined) ??
      (name.length >= 4 ? byName.get(name) : undefined);
    const gold = hit.signal === "in_category" || Boolean(doubled);
    return {
      name: hit.name,
      website: hit.website,
      signal: gold ? "in_category" : "not_listed",
      sourceUrl: gold ? (hit.sourceUrl ?? doubled?.sourceUrl) : undefined,
      sourceName: gold ? (hit.sourceName ?? doubled?.sourceName) : undefined,
    };
  });
  const extras: VisitHit[] = pickLocalExtras(localExtras, ai).map((row) => ({
    name: row.name,
    website: row.website,
    signal: "in_category",
    sourceUrl: row.sourceUrl,
    sourceName: row.sourceName,
  }));
  return [...ai, ...extras].slice(0, SHORTLIST_POOL_COUNT);
}

export function elementOverlap(
  wanted: readonly string[],
  found: readonly string[],
): number {
  const have = new Set(found.map((code) => code.trim().toUpperCase()).filter(Boolean));
  return wanted.filter((code) => have.has(code.trim().toUpperCase())).length;
}

/** How many job words show up in the firm's own focus (specialty, not the whole category). */
export function jobTermHits(jobText: string, focusText: string): number {
  const focus = foldTradeLabel(focusText);
  if (!focus) return 0;
  const terms = [
    ...new Set(
      foldTradeLabel(jobText)
        .split(" ")
        .filter((term) => term.length >= 4),
    ),
  ];
  return terms.filter((term) => focus.includes(term)).length;
}

/**
 * A firm named on a local list in this trade always ranks above a search-only firm.
 * Specialty orders the firms inside that group. The hoped-for case is a double:
 * the search found them, and a local list names them too.
 */
export function jobFitScore(args: {
  signal: "in_category" | "not_listed";
  elementOverlap: number;
  jobTermHits: number;
}): number {
  const specialty = Math.min(
    49,
    Math.max(0, args.elementOverlap) * 10 + Math.max(0, args.jobTermHits) * 8,
  );
  return args.signal === "in_category" ? 50 + specialty : specialty;
}

export function shortlistScore(
  signal: "in_category" | "not_listed",
  overlap: number,
  termHits = 0,
): number {
  return jobFitScore({ signal, elementOverlap: overlap, jobTermHits: termHits });
}

export function orderPassers<
  T extends {
    signal: "in_category" | "not_listed";
    elementOverlap: number;
    jobTermHits: number;
    name: string;
    website: string;
  },
>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const byScore =
      jobFitScore({
        signal: b.signal,
        elementOverlap: b.elementOverlap,
        jobTermHits: b.jobTermHits,
      }) -
      jobFitScore({
        signal: a.signal,
        elementOverlap: a.elementOverlap,
        jobTermHits: a.jobTermHits,
      });
    if (byScore !== 0) return byScore;
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) return byName;
    return a.website.localeCompare(b.website);
  });
}

export function choosePublicPassers<
  T extends {
    pass: boolean;
    signal: "in_category" | "not_listed";
    elementOverlap: number;
    jobTermHits: number;
    name: string;
    website: string;
  },
>(rows: readonly T[]): T[] {
  return orderPassers(rows.filter((row) => row.pass)).slice(0, SHORTLIST_RETURN_COUNT);
}

export function matchNote(
  name: string,
  tradeLabelText: string,
  focus: readonly string[],
): string {
  const labels = focus.map((item) => item.trim()).filter(Boolean);
  if (labels.length > 0) {
    return `${name} focuses on ${labels.join(", ")} for this ${tradeLabelText} job.`;
  }
  return `${name} matches this ${tradeLabelText} job.`;
}

export function passerStatus(
  signal: "in_category" | "not_listed",
): "geverifieerd" | "lokaal_verbonden" {
  return signal === "in_category" ? "lokaal_verbonden" : "geverifieerd";
}

export function decideAssessment(args: {
  siteLoaded: boolean;
  pageMatchesTrade: boolean;
  verdict: "real_local" | "thin_local" | "fake_local" | "unknown";
}): { pass: boolean; withholdReason?: string } {
  if (!args.siteLoaded) return { pass: false, withholdReason: "site_unreachable" };
  if (args.verdict === "fake_local") return { pass: false, withholdReason: "fake_local" };
  if (!args.pageMatchesTrade) return { pass: false, withholdReason: "trade_mismatch" };
  return { pass: true };
}

export type PartnerCompanyView = {
  id: string;
  name: string;
  website_url?: string;
  region?: string;
  partnerTrust?: PartnerTrust;
};

export function placeMatchesTrust(
  trust: PartnerTrust,
  query: { postcode4?: string; gemeente?: string },
): boolean {
  if (query.postcode4 && trust.postcode4 === query.postcode4) return true;
  if (
    !query.postcode4 &&
    query.gemeente &&
    trust.gemeente &&
    foldTradeLabel(trust.gemeente) === foldTradeLabel(query.gemeente)
  ) {
    return true;
  }
  return false;
}

function qualifies(
  trust: PartnerTrust | undefined,
  tradeId: string,
): trust is PartnerTrust {
  return Boolean(
    trust &&
    trust.tradeId === tradeId &&
    (trust.status === "geverifieerd" || trust.status === "lokaal_verbonden"),
  );
}

export function selectFreshPartners(
  companies: readonly PartnerCompanyView[],
  query: { tradeId: string; postcode4?: string; gemeente?: string },
  now = Date.now(),
): PartnerCompanyView[] {
  return companies
    .filter((company) => {
      const trust = company.partnerTrust;
      if (!qualifies(trust, query.tradeId)) return false;
      if (!placeMatchesTrust(trust, query)) return false;
      return evidenceFresh(trust.facts, now);
    })
    .sort((a, b) => {
      const score = (b.partnerTrust?.score ?? 0) - (a.partnerTrust?.score ?? 0);
      if (score !== 0) return score;
      return a.name.localeCompare(b.name);
    });
}

export function selectStalePartners(
  companies: readonly PartnerCompanyView[],
  query: { tradeId: string; postcode4?: string; gemeente?: string },
  now = Date.now(),
): PartnerCompanyView[] {
  const freshIds = new Set(
    selectFreshPartners(companies, query, now).map((company) => company.id),
  );
  return companies
    .filter((company) => {
      const trust = company.partnerTrust;
      if (!qualifies(trust, query.tradeId) || freshIds.has(company.id)) return false;
      if (!placeMatchesTrust(trust, query)) return false;
      return Boolean(company.website_url);
    })
    .sort(
      (a, b) =>
        (b.partnerTrust?.score ?? 0) - (a.partnerTrust?.score ?? 0) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, SHORTLIST_SEARCH_COUNT);
}

/** Three fresh stored matches means the browser search can be skipped. */
export function lookupOutcome(
  freshCount: number,
  staleCount: number,
): "ready" | "recheck" | "search" {
  if (freshCount >= SHORTLIST_RETURN_COUNT) return "ready";
  if (staleCount > 0) return "recheck";
  return "search";
}

export function reuseJobId(
  jobs: readonly { id: string; requestId: string }[],
  requestId: string,
): string | null {
  const wanted = requestId.trim();
  if (!wanted) return null;
  return jobs.find((job) => job.requestId === wanted)?.id ?? null;
}

export function toPublicPartner(
  company: PartnerCompanyView,
  place: string,
): HhhShortlistCompany | null {
  const trust = company.partnerTrust;
  const website = company.website_url?.trim();
  if (!trust || !website) return null;
  if (trust.status !== "geverifieerd" && trust.status !== "lokaal_verbonden") return null;
  const trade = TradeIdSchema.safeParse(trust.tradeId);
  if (!trade.success) return null;
  const note =
    trust.matchNote?.trim() || matchNote(company.name, trade.data, trust.elementCodes);
  return {
    id: company.id,
    name: company.name,
    place: place || trust.woonplaats || trust.gemeente || trust.postcode4 || "NL",
    website,
    tradeId: trade.data,
    tradeLabel: tradeLabel(trade.data),
    status: trust.status,
    badges:
      trust.status === "lokaal_verbonden"
        ? ["gevonden", "lokaal_verbonden"]
        : ["gevonden"],
    score: trust.score,
    matchNote: note,
    evidence: trust.facts.map((fact) => ({
      kind: fact.kind,
      sourceName: fact.sourceName,
      url: fact.sourceUrl,
      observedAt: fact.observedAt,
    })),
  };
}

export function publicFromFresh(
  companies: readonly PartnerCompanyView[],
  place: string,
): HhhShortlistCompany[] {
  const out: HhhShortlistCompany[] = [];
  for (const company of companies) {
    const card = toPublicPartner(company, place);
    if (card) out.push(card);
    if (out.length >= SHORTLIST_RETURN_COUNT) break;
  }
  return out;
}
