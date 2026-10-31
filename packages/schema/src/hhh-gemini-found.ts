import { z } from "zod";
import { publicHttpUrl } from "./site-email";
import { foldTradeLabel, tradeLabel, TradeIdSchema, type TradeId } from "./trades";
import {
  HhhShortlistCompanySchema,
  evidenceFresh,
  factExpiry,
  canonicalWebsite,
  placeMatchesTrust,
  websiteHost,
  type HhhShortlistCompany,
  type PartnerCompanyView,
  type PartnerFact,
  type PartnerTrust,
} from "./hhh-shortlist";

/** How many fresh local finds skip a new Gemini pair. */
export const FOUND_LOOKUP_COUNT = 3;
/** First-step firms considered by the local proof check. */
export const FOUND_CANDIDATE_COUNT = 10;
/** Locally proven companies returned to HandyHouseHelp. */
export const FOUND_RETURN_COUNT = 3;
/** Quality band. A fifth source stays in the evidence list and does not raise this. */
export const FOUND_SOURCE_CAP = 4;

const LOCAL_KIND: Record<string, "ov" | "sport" | "festivity"> = {
  ov: "ov",
  sport: "sport",
  sports_club: "sport",
  football_club: "sport",
  sponsor: "sport",
  festivity: "festivity",
};

const LOCAL_CATEGORY: Record<
  string,
  "local_business_association" | "sponsorship" | "local_festivity"
> = {
  local_business_association: "local_business_association",
  sponsorship: "sponsorship",
  sports_club: "sponsorship",
  football_club: "sponsorship",
  festivity: "local_festivity",
};

/**
 * National phone books and SBI registers name every firm in a trade.
 * They are not one of the accepted local organizations.
 */
const DIRECTORY_HOSTS = [
  "telefoonboek.nl",
  "detelefoongids.nl",
  "telefoongids.nl",
  "goudengids.nl",
  "bedrijvenregister.nl",
  "kvk.nl",
  "openkvk.nl",
  "openingstijden.nl",
  "openingstijden.com",
  "drimble.nl",
  "companyinfo.nl",
  "webwiki.nl",
  "cylex.nl",
  "cylex.com",
  "hotfrog.nl",
  "kompass.com",
  "infobel.com",
  "yelp.com",
  "yelp.nl",
  "trustpilot.com",
  "google.com",
  "google.nl",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "wikipedia.org",
];

const DIRECTORY_CATEGORY = new Set([
  "directory",
  "phone_book",
  "phonebook",
  "business_register",
  "national_directory",
  "sbi",
]);

const DIRECTORY_WORD =
  /sbi[-\s]?code|telefoongids|telefoonboek|gouden gids|bedrijvenregister\.nl|kvk\.nl/i;

export function nationalDirectoryHost(host: string): boolean {
  const name = host.replace(/^www\./i, "").toLowerCase();
  return DIRECTORY_HOSTS.some((item) => name === item || name.endsWith(`.${item}`));
}

export function directoryHostsIn(check: GeminiCheck): string[] {
  const hosts = new Set<string>();
  for (const source of check.sources) {
    const host = websiteHost(source.url);
    if (host && nationalDirectoryHost(host)) hosts.add(host);
  }
  return [...hosts];
}

const PASS_OUTCOME = new Set(["member", "sponsor", "mentioned"]);

export const GeminiSourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  url: z.string().min(1),
  category: z.string().min(1),
  scope: z.string().default("local"),
  place: z.string().optional(),
  description: z.string().optional(),
  list_public: z.boolean().optional(),
});
export type GeminiSource = z.infer<typeof GeminiSourceSchema>;

export const GeminiClaimSchema = z.object({
  kind: z.string().min(1),
  outcome: z.string().min(1),
  about: z.string().default("company"),
  org_name: z.string().default(""),
  relation: z.string().default(""),
  observed_name: z.string().optional(),
  source_ids: z.array(z.string()).default([]),
  pages_checked: z.array(z.string()).default([]),
  note: z.string().nullable().optional(),
});
export type GeminiClaim = z.infer<typeof GeminiClaimSchema>;

export const GeminiCheckCompanySchema = z.object({
  name: z.string().min(1),
  place: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  claims: z.array(GeminiClaimSchema).default([]),
});
export type GeminiCheckCompany = z.infer<typeof GeminiCheckCompanySchema>;

export const GeminiCheckSchema = z.object({
  place: z.string().optional(),
  trade: z.string().optional(),
  checked_on: z.string().optional(),
  sources: z.array(GeminiSourceSchema).default([]),
  companies: z.array(GeminiCheckCompanySchema).default([]),
});
export type GeminiCheck = z.infer<typeof GeminiCheckSchema>;

export type GeminiCandidate = {
  name: string;
  website: string;
  address: string;
  phone: string;
  email: string;
  /** Set when the company site had no public email. */
  contactUrl?: string;
  candidateBasis?: string[];
  riskFlags?: string[];
};

export const GeminiLandscapeSourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  url: z.string().url(),
  kind: z.string().min(1),
  scope: z.enum(["local", "regional", "national"]),
  place: z.string().default(""),
  listing_type: z.enum(["members", "sponsors", "partners", "register", "search"]),
  why_relevant: z.string().default(""),
  observed_on: z.string().default(""),
});
export type GeminiLandscapeSource = z.infer<typeof GeminiLandscapeSourceSchema>;

export const GeminiLandscapeSchema = z.object({
  sources: z.array(GeminiLandscapeSourceSchema).max(20).default([]),
});
export type GeminiLandscape = z.infer<typeof GeminiLandscapeSchema>;

export const GeminiEvidenceClaimSchema = z.object({
  observed_name: z.string().min(1),
  claim_type: z.enum([
    "local_connection",
    "professional_connection",
    "identity",
    "job_fit",
    "conflict",
  ]),
  outcome: z.enum(["confirmed", "conflict"]),
  source_url: z.string().url(),
  source_name: z.string().min(1),
  note: z.string().default(""),
});
export type GeminiEvidenceClaim = z.infer<typeof GeminiEvidenceClaimSchema>;

export const GeminiEvidenceCompanySchema = z.object({
  name: z.string().min(1),
  claims: z.array(GeminiEvidenceClaimSchema).max(12).default([]),
});

export const GeminiEvidenceResultSchema = z.object({
  companies: z.array(GeminiEvidenceCompanySchema).max(15).default([]),
});
export type GeminiEvidenceResult = z.infer<typeof GeminiEvidenceResultSchema>;

export const GeminiSourceCandidatesSchema = z.object({
  companies: z
    .array(
      z.object({
        name: z.string().min(1),
        website: z.string().default(""),
        address: z.string().default(""),
        phone: z.string().default(""),
        email: z.string().default(""),
        candidate_basis: z.array(z.string()).max(4).default([]),
        risk_flags: z.array(z.string()).max(4).default([]),
        observed_name: z.string().min(1),
        source_url: z.string().url(),
        source_name: z.string().min(1),
        source_scope: z.enum(["local", "regional", "national"]),
        source_kind: z.string().min(1),
      }),
    )
    .max(5)
    .default([]),
});
export type GeminiSourceCandidates = z.infer<typeof GeminiSourceCandidatesSchema>;

export const GeminiReviewSchema = z.object({
  companies: z
    .array(
      z.object({
        name: z.string().min(1),
        job_fit: z.boolean(),
        location_checked: z.boolean(),
        serves_private: z.boolean(),
        keep: z.boolean(),
        evidence_level: z.enum(["strong", "moderate", "limited"]),
        risk_flags: z.array(z.string()).max(6).default([]),
        hard_reject_reason: z.string().nullable().default(null),
        summary: z.string().min(1),
        source_urls: z.array(z.string().url()).max(6).default([]),
      }),
    )
    .max(12)
    .default([]),
});
export type GeminiReview = z.infer<typeof GeminiReviewSchema>;

export type GeminiUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

const LEAD_HOST = /(?:^|\.)(?:werkspot|trustoo|zoofy|vergelijk)\.nl$/i;

/** First-step firms. A lead site is dropped. A missing website is not, when a phone or address is present. */
export function reviewFoundFirms(proposed: readonly GeminiCandidate[]): {
  kept: GeminiCandidate[];
  skipped: string[];
} {
  const kept: GeminiCandidate[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  for (const row of proposed) {
    const name = row.name.trim();
    const website = canonicalWebsite(row.website);
    const host = website ? websiteHost(website) : null;
    const phone = row.phone.trim();
    const address = row.address.trim();
    if (!name) {
      skipped.push("A row had no name.");
      continue;
    }
    if (host && LEAD_HOST.test(host)) {
      skipped.push(`${name}: lead site`);
      continue;
    }
    if (host && seen.has(host)) {
      skipped.push(`${name}: duplicate website`);
      continue;
    }
    if (!host && !phone && !address) {
      skipped.push(`${name}: no website, phone, or address`);
      continue;
    }
    if (host) seen.add(host);
    kept.push({
      name,
      website: website ?? "",
      address,
      phone,
      email: row.email.trim(),
      candidateBasis: row.candidateBasis ?? [],
      riskFlags: row.riskFlags ?? [],
    });
    if (kept.length >= FOUND_CANDIDATE_COUNT) break;
  }
  return { kept, skipped };
}

export function selectFoundFirms(
  proposed: readonly GeminiCandidate[],
): GeminiCandidate[] {
  return reviewFoundFirms(proposed).kept;
}

export type LocalHit = {
  kind: "ov" | "sport" | "festivity" | "professional" | "website" | "search";
  sourceName: string;
  url: string;
  relation: string;
  host: string;
};

export type GeminiFoundCompany = GeminiCandidate & {
  sourceCount: number;
  matchNote: string;
  hits: LocalHit[];
  jobFit?: boolean;
  locationChecked?: boolean;
  professionalConnection?: boolean;
  evidenceLevel?: "strong" | "moderate" | "limited";
  hardRejectReason?: string;
};

function text(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function httpsUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function namesMatch(left: string, right: string): boolean {
  const a = foldTradeLabel(left);
  const b = foldTradeLabel(right);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 8 && b.length >= 8 && (a.includes(b) || b.includes(a))) return true;
  return false;
}

/** Combine both AI candidate streams without letting aliases create duplicate firms. */
export function mergeGeminiCandidates(
  primary: readonly GeminiCandidate[],
  extra: readonly GeminiCandidate[],
  limit = 12,
): GeminiCandidate[] {
  const out: GeminiCandidate[] = [];
  const hosts = new Set<string>();
  for (const row of [...primary, ...extra]) {
    const host = websiteHost(row.website);
    const duplicate = out.some((current) => namesMatch(current.name, row.name));
    if (duplicate || (host && hosts.has(host))) continue;
    if (host) hosts.add(host);
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

function evidenceFor(
  candidate: GeminiCandidate,
  evidence: GeminiEvidenceResult,
): GeminiEvidenceClaim[] {
  return evidence.companies
    .filter((company) => namesMatch(company.name, candidate.name))
    .flatMap((company) => company.claims)
    .filter((claim) => namesMatch(claim.observed_name, candidate.name));
}

function reviewFor(candidate: GeminiCandidate, review: GeminiReview) {
  return review.companies.find((company) => namesMatch(company.name, candidate.name));
}

/** Convert the separate evidence dimensions into publishable, ranked firms. */
export function reviewedGeminiCompanies(
  candidates: readonly GeminiCandidate[],
  evidence: GeminiEvidenceResult,
  review: GeminiReview,
): GeminiFoundCompany[] {
  const rows: GeminiFoundCompany[] = [];
  for (const candidate of candidates) {
    const verdict = reviewFor(candidate, review);
    if (
      !verdict ||
      !verdict.keep ||
      !verdict.job_fit ||
      !verdict.location_checked ||
      !verdict.serves_private ||
      verdict.hard_reject_reason
    ) {
      continue;
    }
    const claims = evidenceFor(candidate, evidence).filter(
      (claim) => claim.outcome === "confirmed",
    );
    const hitsByUrl = new Map<string, LocalHit>();
    for (const claim of claims) {
      const url = httpsUrl(claim.source_url);
      const host = url ? websiteHost(url) : null;
      if (!url || !host || hitsByUrl.has(url)) continue;
      const kind: LocalHit["kind"] =
        claim.claim_type === "local_connection"
          ? "ov"
          : claim.claim_type === "professional_connection"
            ? "professional"
            : "website";
      hitsByUrl.set(url, {
        kind,
        sourceName: claim.source_name,
        url,
        relation: claim.note || claim.source_name,
        host,
      });
    }
    for (const sourceUrl of verdict.source_urls) {
      const url = httpsUrl(sourceUrl);
      const host = url ? websiteHost(url) : null;
      if (!url || !host || hitsByUrl.has(url)) continue;
      hitsByUrl.set(url, {
        kind: "website",
        sourceName: host,
        url,
        relation: "Gebruikt voor de bedrijfs- en kluscontrole.",
        host,
      });
    }
    const hits = [...hitsByUrl.values()];
    const localConnection = hits.some(
      (hit) => hit.kind === "ov" || hit.kind === "sport" || hit.kind === "festivity",
    );
    const professionalConnection = hits.some((hit) => hit.kind === "professional");
    const sourceCount = Math.min(
      FOUND_SOURCE_CAP,
      new Set(hits.map((hit) => hit.host)).size,
    );
    rows.push({
      ...candidate,
      riskFlags: [...new Set([...(candidate.riskFlags ?? []), ...verdict.risk_flags])],
      sourceCount,
      matchNote: verdict.summary.slice(0, 400),
      hits,
      jobFit: true,
      locationChecked: true,
      professionalConnection,
      evidenceLevel:
        localConnection || professionalConnection ? verdict.evidence_level : "limited",
    });
  }
  return rankFound(rows);
}

function localHits(
  companyWebsite: string,
  claims: readonly GeminiClaim[],
  sources: readonly GeminiSource[],
): LocalHit[] {
  const byId = new Map(sources.map((source) => [source.id, source]));
  const ownHost = websiteHost(companyWebsite);
  const seen = new Map<string, LocalHit>();
  for (const claim of claims) {
    if (claim.about.trim().toLowerCase() !== "company") continue;
    if (!PASS_OUTCOME.has(claim.outcome.trim().toLowerCase())) continue;
    const kind = LOCAL_KIND[claim.kind.trim().toLowerCase()];
    if (!kind) continue;
    for (const sourceId of claim.source_ids) {
      const source = byId.get(sourceId);
      if (!source) continue;
      if (source.scope.trim().toLowerCase() !== "local") continue;
      if (DIRECTORY_CATEGORY.has(source.category.trim().toLowerCase())) continue;
      const category = LOCAL_CATEGORY[source.category.trim().toLowerCase()];
      if (!category) continue;
      const url = httpsUrl(source.url);
      const host = url ? websiteHost(url) : null;
      if (!url || !host || (ownHost && host === ownHost) || seen.has(host)) continue;
      const orgName = text(claim.org_name);
      const relation = text(claim.relation) || orgName || source.name;
      if (
        nationalDirectoryHost(host) ||
        DIRECTORY_WORD.test(`${relation}\n${source.name}\n${orgName}`)
      )
        continue;
      seen.set(host, {
        kind,
        sourceName: source.name,
        url,
        relation,
        host,
      });
    }
  }
  return [...seen.values()];
}

/** Keep find-step firms that the check named, and only when a local page names the company. */
export function companiesWithLocalMention(
  candidates: readonly GeminiCandidate[],
  check: GeminiCheck,
): GeminiFoundCompany[] {
  const found: GeminiFoundCompany[] = [];
  for (const candidate of candidates) {
    const checked = check.companies.find((company) =>
      namesMatch(company.name, candidate.name),
    );
    if (!checked) continue;
    const website = candidate.website || text(checked.website);
    const hits = localHits(website, checked.claims, check.sources);
    if (hits.length === 0) continue;
    const relations = hits.map((hit) => hit.relation).filter(Boolean);
    found.push({
      name: candidate.name,
      website,
      address: candidate.address,
      phone: text(checked.phone) || candidate.phone,
      email: text(checked.email) || candidate.email,
      sourceCount: Math.min(FOUND_SOURCE_CAP, hits.length),
      matchNote: (relations.join(" · ") || "Gevonden via een lokale vermelding.").slice(
        0,
        400,
      ),
      hits,
    });
  }
  return rankFound(found);
}

export function rankFound<
  T extends {
    name: string;
    sourceCount: number;
    website?: string;
    address?: string;
    phone?: string;
    email?: string;
    matchNote?: string;
    hits?: readonly { kind: string }[];
  },
>(rows: readonly T[]): T[] {
  const local = (row: T) =>
    row.hits?.some(
      (hit) => hit.kind === "ov" || hit.kind === "sport" || hit.kind === "festivity",
    )
      ? 1
      : 0;
  const professional = (row: T) =>
    row.hits?.some((hit) => hit.kind === "professional") ? 1 : 0;
  const specificity = (row: T) =>
    /organis|bestuur|opricht|sponsor|lid van|member/i.test(row.matchNote ?? "") ? 1 : 0;
  const completeness = (row: T) =>
    [row.website, row.address, row.phone, row.email].filter((value) =>
      Boolean(value?.trim()),
    ).length;
  return [...rows]
    .sort(
      (a, b) =>
        local(b) - local(a) ||
        professional(b) - professional(a) ||
        b.sourceCount - a.sourceCount ||
        specificity(b) - specificity(a) ||
        completeness(b) - completeness(a) ||
        a.name.localeCompare(b.name, "nl"),
    )
    .slice(0, FOUND_RETURN_COUNT);
}

export function lookupFoundOutcome(freshCount: number): "ready" | "find" {
  return freshCount >= FOUND_LOOKUP_COUNT ? "ready" : "find";
}

type FoundView = PartnerCompanyView & {
  phone?: string;
  email?: string;
  localAuthenticity?: { verdict?: string } | null;
};

function directoryFact(fact: PartnerFact): boolean {
  const host = websiteHost(fact.sourceUrl);
  if (host && nationalDirectoryHost(host)) return true;
  return DIRECTORY_WORD.test(`${fact.sourceName ?? ""}\n${fact.sourceUrl}`);
}

/** Club, festivity, and association pages. A phone book or an SBI sentence is not local proof. */
function localFacts(trust: PartnerTrust | undefined): PartnerFact[] {
  return (trust?.facts ?? []).filter(
    (fact) =>
      (fact.kind === "ov" || fact.kind === "sport" || fact.kind === "festivity") &&
      !directoryFact(fact),
  );
}

function reviewedFacts(trust: PartnerTrust | undefined): PartnerFact[] {
  const acceptedLocal = new Set(localFacts(trust));
  return (trust?.facts ?? []).filter(
    (fact) =>
      fact.kind === "website" ||
      (fact.kind === "professional" && !directoryFact(fact)) ||
      acceptedLocal.has(fact),
  );
}

function storedMatchNote(trust: PartnerTrust, facts: readonly PartnerFact[]): string {
  const note = trust.matchNote?.trim() ?? "";
  if (note && !DIRECTORY_WORD.test(note)) return note;
  const names = facts
    .map((fact) => fact.sourceName?.trim())
    .filter((name): name is string => Boolean(name));
  return names.join(" · ") || "Gevonden via een lokale vermelding.";
}

export function selectFreshFound(
  companies: readonly FoundView[],
  query: { tradeId: string; postcode4?: string; gemeente?: string },
  now = Date.now(),
): FoundView[] {
  return companies
    .filter((company) => {
      const trust = company.partnerTrust;
      if (!trust || trust.status !== "gevonden" || trust.tradeId !== query.tradeId)
        return false;
      if (trust.score < 1) return false;
      if (company.localAuthenticity?.verdict === "fake_local") return false;
      if (!placeMatchesTrust(trust, query)) return false;
      return evidenceFresh(reviewedFacts(trust), now);
    })
    .sort(
      (a, b) =>
        (b.partnerTrust?.score ?? 0) - (a.partnerTrust?.score ?? 0) ||
        a.name.localeCompare(b.name, "nl"),
    );
}

export function cardFromFound(args: {
  id: string;
  row: GeminiFoundCompany;
  place: string;
  tradeId: TradeId;
  observedAt: string;
}): HhhShortlistCompany {
  const localConnection = args.row.hits.some(
    (hit) => hit.kind === "ov" || hit.kind === "sport" || hit.kind === "festivity",
  );
  const professionalConnection = args.row.hits.some((hit) => hit.kind === "professional");
  const badges: HhhShortlistCompany["badges"] = ["gevonden"];
  if (args.row.jobFit) badges.push("klus_passend");
  if (args.row.locationChecked) badges.push("vestiging_gecontroleerd");
  if (localConnection) badges.push("lokaal_verbonden");
  if (professionalConnection) badges.push("professioneel_aangesloten");
  if (args.row.evidenceLevel === "limited") badges.push("beperkt_bewijs");
  if ((args.row.riskFlags?.length ?? 0) > 0) badges.push("risicosignaal");
  return HhhShortlistCompanySchema.parse({
    id: args.id,
    name: args.row.name,
    place: args.place,
    website: args.row.website,
    phone: args.row.phone || undefined,
    email: args.row.email || undefined,
    contactUrl: args.row.email?.trim()
      ? undefined
      : publicHttpUrl(args.row.contactUrl) ?? publicHttpUrl(args.row.website),
    tradeId: args.tradeId,
    tradeLabel: tradeLabel(args.tradeId),
    status: localConnection ? "lokaal_verbonden" : "geverifieerd",
    badges,
    sourceCount: args.row.sourceCount > 0 ? args.row.sourceCount : undefined,
    score: Math.max(1, args.row.sourceCount),
    matchNote: args.row.matchNote,
    evidence: args.row.hits.map((hit) => ({
      kind: hit.kind,
      sourceName: hit.sourceName,
      url: hit.url,
      observedAt: args.observedAt,
    })),
  });
}

export function cardFromStoredFound(
  company: FoundView,
  place: string,
): HhhShortlistCompany | null {
  const trust = company.partnerTrust;
  if (!trust || trust.status !== "gevonden") return null;
  if (company.localAuthenticity?.verdict === "fake_local") return null;
  const trade = TradeIdSchema.safeParse(trust.tradeId);
  if (!trade.success) return null;
  const facts = reviewedFacts(trust);
  if (facts.length === 0) return null;
  const local = localFacts(trust);
  const professional = facts.filter((fact) => fact.kind === "professional");
  const sourceCount = Math.min(FOUND_SOURCE_CAP, facts.length);
  const badges: HhhShortlistCompany["badges"] = [
    "gevonden",
    "klus_passend",
    "vestiging_gecontroleerd",
  ];
  if (local.length > 0) badges.push("lokaal_verbonden");
  if (professional.length > 0) badges.push("professioneel_aangesloten");
  if (local.length === 0 && professional.length === 0) badges.push("beperkt_bewijs");
  return HhhShortlistCompanySchema.parse({
    id: company.id,
    name: company.name,
    place: place || trust.woonplaats || trust.gemeente || trust.postcode4 || "NL",
    website: company.website_url ?? "",
    phone: company.phone || undefined,
    email: company.email || undefined,
    contactUrl: company.email?.trim() ? undefined : publicHttpUrl(company.website_url),
    tradeId: trade.data,
    tradeLabel: tradeLabel(trade.data),
    status: local.length > 0 ? "lokaal_verbonden" : "geverifieerd",
    badges,
    sourceCount,
    score: sourceCount,
    matchNote: storedMatchNote(trust, facts),
    evidence: facts.map((fact) => ({
      kind: fact.kind,
      sourceName: fact.sourceName,
      url: fact.sourceUrl,
      observedAt: fact.observedAt,
    })),
  });
}

export function foundFacts(row: GeminiFoundCompany, observedAt: string): PartnerFact[] {
  return row.hits.map((hit) => ({
    kind: hit.kind === "search" ? "search" : hit.kind,
    sourceUrl: hit.url,
    sourceName: hit.sourceName,
    observedAt,
    expiresAt: factExpiry(observedAt),
  }));
}
