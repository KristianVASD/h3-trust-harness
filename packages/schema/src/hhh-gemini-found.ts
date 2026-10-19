import { z } from "zod";
import { foldTradeLabel, TradeIdSchema, type TradeId } from "./trades";
import {
  HhhShortlistCompanySchema,
  evidenceFresh,
  factExpiry,
  placeMatchesTrust,
  websiteHost,
  type HhhShortlistCompany,
  type PartnerCompanyView,
  type PartnerFact,
  type PartnerTrust,
} from "./hhh-shortlist";

/** How many fresh local finds skip a new Gemini pair. */
export const FOUND_LOOKUP_COUNT = 3;
/** Companies returned to HandyHouseHelp. */
export const FOUND_RETURN_COUNT = 5;
/** Quality band. A fifth source stays in the evidence list and does not raise this. */
export const FOUND_SOURCE_CAP = 4;

const LOCAL_KIND: Record<string, "ov" | "sport" | "festivity"> = {
  ov: "ov",
  sport: "sport",
  sports_club: "sport",
  festivity: "festivity",
};

const LOCAL_CATEGORY: Record<string, "local_business_association" | "sponsorship" | "municipal_initiative"> = {
  local_business_association: "local_business_association",
  sponsorship: "sponsorship",
  municipal_initiative: "municipal_initiative",
  sports_club: "sponsorship",
  festivity: "municipal_initiative",
};

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
};

export type LocalHit = {
  kind: "ov" | "sport" | "festivity";
  sourceName: string;
  url: string;
  relation: string;
  host: string;
};

export type GeminiFoundCompany = GeminiCandidate & {
  sourceCount: number;
  matchNote: string;
  hits: LocalHit[];
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

function localHits(companyWebsite: string, claims: readonly GeminiClaim[], sources: readonly GeminiSource[]): LocalHit[] {
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
      const category = LOCAL_CATEGORY[source.category.trim().toLowerCase()];
      if (!category) continue;
      const url = httpsUrl(source.url);
      const host = url ? websiteHost(url) : null;
      if (!url || !host || (ownHost && host === ownHost) || seen.has(host)) continue;
      const relation = text(claim.relation) || text(claim.org_name) || source.name;
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
    const checked = check.companies.find((company) => namesMatch(company.name, candidate.name));
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
      matchNote: (relations.join(" · ") || "Gevonden via een lokale vermelding.").slice(0, 400),
      hits,
    });
  }
  return rankFound(found);
}

export function rankFound<T extends { name: string; sourceCount: number }>(rows: readonly T[]): T[] {
  return [...rows]
    .sort((a, b) => b.sourceCount - a.sourceCount || a.name.localeCompare(b.name, "nl"))
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

function localFacts(trust: PartnerTrust | undefined): PartnerFact[] {
  return (trust?.facts ?? []).filter((fact) => fact.kind === "ov" || fact.kind === "sport" || fact.kind === "festivity");
}

export function selectFreshFound(
  companies: readonly FoundView[],
  query: { tradeId: string; postcode4?: string; gemeente?: string },
  now = Date.now(),
): FoundView[] {
  return companies
    .filter((company) => {
      const trust = company.partnerTrust;
      if (!trust || trust.status !== "gevonden" || trust.tradeId !== query.tradeId) return false;
      if (trust.score < 1) return false;
      if (company.localAuthenticity?.verdict === "fake_local") return false;
      if (!placeMatchesTrust(trust, query)) return false;
      return evidenceFresh(localFacts(trust), now);
    })
    .sort((a, b) => (b.partnerTrust?.score ?? 0) - (a.partnerTrust?.score ?? 0) || a.name.localeCompare(b.name, "nl"));
}

export function cardFromFound(args: {
  id: string;
  row: GeminiFoundCompany;
  place: string;
  tradeId: TradeId;
  observedAt: string;
}): HhhShortlistCompany {
  return HhhShortlistCompanySchema.parse({
    id: args.id,
    name: args.row.name,
    place: args.place,
    website: args.row.website,
    phone: args.row.phone || undefined,
    email: args.row.email || undefined,
    tradeId: args.tradeId,
    status: "gevonden",
    sourceCount: args.row.sourceCount,
    score: args.row.sourceCount,
    matchNote: args.row.matchNote,
    evidence: args.row.hits.map((hit) => ({
      kind: hit.kind,
      sourceName: hit.sourceName,
      url: hit.url,
      observedAt: args.observedAt,
    })),
  });
}

export function cardFromStoredFound(company: FoundView, place: string): HhhShortlistCompany | null {
  const trust = company.partnerTrust;
  if (!trust || trust.status !== "gevonden") return null;
  if (company.localAuthenticity?.verdict === "fake_local") return null;
  const trade = TradeIdSchema.safeParse(trust.tradeId);
  if (!trade.success) return null;
  const facts = localFacts(trust);
  if (facts.length === 0) return null;
  const sourceCount = Math.min(FOUND_SOURCE_CAP, Math.max(1, Math.round(trust.score)));
  return HhhShortlistCompanySchema.parse({
    id: company.id,
    name: company.name,
    place: place || trust.woonplaats || trust.gemeente || trust.postcode4 || "NL",
    website: company.website_url ?? "",
    phone: company.phone || undefined,
    email: company.email || undefined,
    tradeId: trade.data,
    status: "gevonden",
    sourceCount,
    score: sourceCount,
    matchNote: trust.matchNote?.trim() || "Gevonden via een lokale vermelding.",
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
    kind: hit.kind,
    sourceUrl: hit.url,
    sourceName: hit.sourceName,
    observedAt,
    expiresAt: factExpiry(observedAt),
  }));
}
