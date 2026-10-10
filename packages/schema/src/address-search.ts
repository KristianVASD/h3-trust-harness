import { z } from "zod";
import { evidenceScoreFromWeights } from "./list-coverage";
import { collectMatchedElementCodes } from "./masterlist";
import type { NationLandscape, NationProposedSource } from "./nation-landscape";
import {
  HOME_MAINTENANCE_SECTOR,
  TRADE_IDS,
  TRADES,
  TradeIdSchema,
  foldTradeLabel,
  type TradeId,
} from "./trades";

/** One mission per place cell. Not a trade door and not a national pack. */
export const PLACE_CELL_SUBSECTOR = "local-network";

export const ADDRESS_SEARCH_STAGES = [
  "geocode",
  "ecology_ov",
  "ecology_sport",
  "ecology_festivity",
  "trade_search",
  "harvest_match",
  "local_authenticity",
  "country_corroboration",
  "score",
] as const;
export type AddressSearchStage = (typeof ADDRESS_SEARCH_STAGES)[number];

export const CELL_RADIUS_KM = 15;
export const OV_RADIUS_KM = 25;
export const OV_PICK_COUNT = 3;
export const MAX_COMPANIES_PER_DOOR = 15;
export const CELL_STALE_MS = 30 * 24 * 60 * 60 * 1000;

export const LocalAuthenticityVerdictSchema = z.enum([
  "real_local",
  "thin_local",
  "fake_local",
  "unknown",
]);
export type LocalAuthenticityVerdict = z.infer<
  typeof LocalAuthenticityVerdictSchema
>;

export const CountryCheckOutcomeSchema = z.enum([
  "listed",
  "not_listed",
  "blocked",
  "country_map_missing",
]);
export type CountryCheckOutcome = z.infer<typeof CountryCheckOutcomeSchema>;

export const AudienceModeSchema = z.enum(["b2c", "b2b", "both"]);
export type AudienceMode = z.infer<typeof AudienceModeSchema>;

const SERVICE_CONTEXT_IDS = [
  "private",
  "hoa",
  "municipal",
  "commercial",
  "industrial",
] as const;
export type AddressServiceContext = (typeof SERVICE_CONTEXT_IDS)[number];

export const LocalAuthenticitySchema = z.object({
  verdict: LocalAuthenticityVerdictSchema,
  reasons: z.array(z.string()).default([]),
  checkedAt: z.string().min(1),
});
export type LocalAuthenticity = z.infer<typeof LocalAuthenticitySchema>;

export const CountryCheckSchema = z.object({
  sourceName: z.string().min(1),
  category: z.string().min(1),
  outcome: CountryCheckOutcomeSchema,
  url: z.string().optional(),
  weight: z.number().min(0).max(100).optional(),
  payToPlay: z.boolean().optional(),
});
export type CountryCheck = z.infer<typeof CountryCheckSchema>;

export const TrustProposalSchema = z.object({
  score: z.number().min(0).max(100),
  band: z.string().min(1),
  evidence: z.array(z.string()).default([]),
  provisional: z.literal(true),
  producer: z.literal("ExternalAI"),
  localAuthenticity: LocalAuthenticityVerdictSchema,
  countryChecks: z.array(CountryCheckSchema).default([]),
});
export type TrustProposal = z.infer<typeof TrustProposalSchema>;

export const EcologySeedSchema = z.object({
  name: z.string().min(1),
  place: z.string().optional(),
  website: z.string().optional(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  distanceKm: z.number().optional(),
  kind: z.enum(["ov", "sport", "festivity"]),
});
export type EcologySeed = z.infer<typeof EcologySeedSchema>;

export const AddressCandidateSchema = z.object({
  name: z.string().min(1),
  website: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  from: z.enum(["ov", "sport", "festivity", "trade_search"]),
  sourceName: z.string().optional(),
  tradeId: TradeIdSchema.optional(),
});
export type AddressCandidate = z.infer<typeof AddressCandidateSchema>;

export const PlaceCellSchema = z.object({
  id: z.string().uuid(),
  country: z.string().min(1),
  countrySlug: z.string().min(1),
  label: z.string().min(1),
  address: z.string().default(""),
  postcode4: z.string().optional(),
  gemeente: z.string().optional(),
  woonplaats: z.string().optional(),
  lat: z.number(),
  lon: z.number(),
  radiusKm: z.number().positive().default(CELL_RADIUS_KM),
  missionId: z.string().uuid(),
  finishedStages: z.array(z.enum(ADDRESS_SEARCH_STAGES)).default([]),
  ecology: z
    .object({
      ov: z.array(EcologySeedSchema).default([]),
      sport: z.array(EcologySeedSchema).default([]),
      festivity: z.array(EcologySeedSchema).default([]),
    })
    .default({ ov: [], sport: [], festivity: [] }),
  candidates: z.array(AddressCandidateSchema).default([]),
  notes: z.array(z.string()).default([]),
  updatedAt: z.string().min(1),
});
export type PlaceCell = z.infer<typeof PlaceCellSchema>;

export const COUNTRY_CHECK_CATEGORIES = [
  "sector_qualification",
  "quality_mark",
  "branch_association",
] as const;

export function isPlaceCellMission(mission: { subsector?: string }): boolean {
  return (mission.subsector ?? "").trim().toLowerCase() === PLACE_CELL_SUBSECTOR;
}

export function placeCellSector(): string {
  return HOME_MAINTENANCE_SECTOR;
}

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const r = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function cellIsFresh(updatedAt: string, now = Date.now()): boolean {
  const t = Date.parse(updatedAt);
  if (!Number.isFinite(t)) return false;
  return now - t < CELL_STALE_MS;
}

export function cellCoversPoint(
  cell: { lat: number; lon: number; radiusKm?: number },
  lat: number,
  lon: number,
): boolean {
  return haversineKm(cell.lat, cell.lon, lat, lon) <= (cell.radiusKm || CELL_RADIUS_KM);
}

export function pickNearest<T extends { lat?: number; lon?: number }>(
  origin: { lat: number; lon: number },
  items: T[],
  count: number,
  maxKm: number,
): Array<T & { distanceKm: number }> {
  const ranked = items
    .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon))
    .map((item) => ({
      ...item,
      distanceKm: haversineKm(origin.lat, origin.lon, item.lat as number, item.lon as number),
    }))
    .filter((item) => item.distanceKm <= maxKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
  return ranked.slice(0, count);
}

const B2C = new Set(["private", "hoa"]);
const B2B = new Set(["commercial", "industrial"]);

export function deriveAudienceMode(
  contexts: readonly string[],
): AudienceMode | undefined {
  const hasB2c = contexts.some((c) => B2C.has(c));
  const hasB2b = contexts.some((c) => B2B.has(c));
  if (hasB2c && hasB2b) return "both";
  if (hasB2c) return "b2c";
  if (hasB2b) return "b2b";
  return undefined;
}

function haystack(text: string): string {
  return foldTradeLabel(text);
}

function aliasHit(hay: string, alias: string): boolean {
  const needle = foldTradeLabel(alias);
  if (needle.length < 3) return false;
  if (needle.length < 4) {
    return new RegExp(`(?:^| )${needle}(?: |$)`).test(hay);
  }
  return hay.includes(needle);
}

export type PageMatch = {
  tradeIds: TradeId[];
  primaryTradeId?: TradeId;
  capabilities: string[];
  serviceContexts: AddressServiceContext[];
  audienceMode?: AudienceMode;
  specialism?: string;
  servicedElementCodes: string[];
};

export function matchPageToTrades(text: string): PageMatch {
  const hay = haystack(text);
  const tradeHits = new Map<TradeId, number>();
  const capabilities: string[] = [];
  const elementTerms: string[] = [];

  for (const trade of TRADES.trades) {
    let hits = 0;
    for (const alias of [trade.label, trade.label_en, ...trade.aliases]) {
      if (aliasHit(hay, alias)) hits += 1;
    }
    for (const spec of trade.specialisations) {
      const specHit = [spec.id, ...spec.aliases].some((alias) => aliasHit(hay, alias));
      if (!specHit) continue;
      hits += 2;
      if (!capabilities.includes(spec.id)) capabilities.push(spec.id);
      elementTerms.push(spec.id, ...spec.aliases);
    }
    if (hits > 0) tradeHits.set(trade.id, hits);
  }

  const tradeIds = [...tradeHits.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id]) => id);

  const serviceContexts: AddressServiceContext[] = [];
  for (const audience of TRADES.audiences) {
    if (audience.aliases.some((alias) => aliasHit(hay, alias))) {
      serviceContexts.push(audience.id);
    }
  }
  if (aliasHit(hay, "b2c") && !serviceContexts.includes("private")) {
    serviceContexts.push("private");
  }
  if (aliasHit(hay, "b2b") && !serviceContexts.includes("commercial")) {
    serviceContexts.push("commercial");
  }

  const primary = tradeIds[0];
  const primaryTrade = TRADES.trades.find((t) => t.id === primary);
  const specialism = capabilities[0]
    ? primaryTrade?.specialisations.find((s) => s.id === capabilities[0])?.id
    : primaryTrade?.label;

  return {
    tradeIds,
    primaryTradeId: primary,
    capabilities,
    serviceContexts,
    audienceMode: deriveAudienceMode(serviceContexts),
    specialism,
    servicedElementCodes: collectMatchedElementCodes(elementTerms),
  };
}

const LEAD_GEN = [
  /wij bemiddelen/i,
  /\bbemiddel/i,
  /offertes? vergelijken/i,
  /vergelijk\w* offertes/i,
  /landelijk netwerk/i,
  /heel nederland/i,
  /lokale partner/i,
  /vakspecialisten in/i,
  /lead ?gen/i,
  /geen eigen vakmensen/i,
];

const BIG_PLACES = [
  "amsterdam",
  "rotterdam",
  "utrecht",
  "den haag",
  "eindhoven",
  "groningen",
  "tilburg",
  "almere",
  "breda",
  "nijmegen",
  "haarlem",
  "arnhem",
  "zwolle",
  "maastricht",
  "leiden",
  "dordrecht",
  "zoetermeer",
  "enschede",
];

export function classifyLocalAuthenticity(args: {
  text: string;
  woonplaats?: string;
  postcode4?: string;
  mentionedInEcology: boolean;
  hasCraft: boolean;
}): { verdict: LocalAuthenticityVerdict; reasons: string[] } {
  const text = args.text ?? "";
  const lower = text.toLowerCase();
  const reasons: string[] = [];
  const leadHits = LEAD_GEN.filter((re) => re.test(text)).length;
  const placeHit = Boolean(
    (args.postcode4 && text.includes(args.postcode4)) ||
      (args.woonplaats && lower.includes(args.woonplaats.toLowerCase())),
  );
  const cities = BIG_PLACES.filter((city) => lower.includes(city)).length;

  if (leadHits > 0) reasons.push("Page reads as lead-gen or a national switchboard");
  if (cities >= 6) reasons.push("Page lists many cities");
  if (placeHit) reasons.push("Page names this place or postcode");
  if (args.hasCraft) reasons.push("Page describes a craft");
  if (args.mentionedInEcology) reasons.push("Name also appears in local ecology");

  if (leadHits >= 2 || (leadHits >= 1 && cities >= 6 && !placeHit)) {
    return { verdict: "fake_local", reasons };
  }
  if (cities >= 8 && !placeHit) {
    return { verdict: "fake_local", reasons };
  }
  if (leadHits >= 1 && !placeHit && !args.mentionedInEcology) {
    return { verdict: "fake_local", reasons };
  }
  if (placeHit && args.hasCraft && args.mentionedInEcology && leadHits === 0) {
    return { verdict: "real_local", reasons };
  }
  if (args.hasCraft && (placeHit || args.mentionedInEcology)) {
    return { verdict: "thin_local", reasons };
  }
  return { verdict: "unknown", reasons };
}

export type MappedFinder = {
  name: string;
  url?: string;
  category: string;
  weight: number;
  payToPlay: boolean;
};

function sourceMentionsTrade(text: string, tradeId: TradeId): boolean {
  const trade = TRADES.trades.find((t) => t.id === tradeId);
  if (!trade) return false;
  const hay = haystack(text);
  return [trade.id, trade.label, trade.label_en, ...trade.aliases].some((alias) =>
    aliasHit(hay, alias),
  );
}

function sourceMentionsOtherTrade(text: string, tradeId: TradeId): boolean {
  return TRADE_IDS.some((id) => id !== tradeId && sourceMentionsTrade(text, id));
}

function weightForCategory(category: string): number {
  if (category === "quality_mark" || category === "sector_qualification") return 75;
  if (category === "branch_association") return 70;
  return 55;
}

function readTrades(source: NationProposedSource): string[] {
  return Array.isArray(source.trades) ? source.trades.map((t) => String(t)) : [];
}

export function findersForTrade(
  landscape: NationLandscape | null | undefined,
  tradeId: TradeId,
): MappedFinder[] {
  if (!landscape) return [];
  const out: MappedFinder[] = [];
  const seen = new Set<string>();
  for (const channel of landscape.channels) {
    if (
      !COUNTRY_CHECK_CATEGORIES.includes(
        channel.category as (typeof COUNTRY_CHECK_CATEGORIES)[number],
      )
    ) {
      continue;
    }
    const blobs = [
      ...channel.proposedSources.map((s) => ({
        name: s.name,
        url: s.listUrl || s.url,
        trades: readTrades(s),
      })),
      ...channel.platforms.map((p) => ({
        name: p.name,
        url: p.url,
        trades: [] as string[],
      })),
    ];
    for (const blob of blobs) {
      const key = `${channel.category}|${blob.name.toLowerCase()}`;
      if (seen.has(key)) continue;
      const blobText = `${blob.name} ${blob.url ?? ""}`;
      const explicit = blob.trades.filter(Boolean);
      const matchesExplicit = explicit.some(
        (t) => t === tradeId || sourceMentionsTrade(t, tradeId),
      );
      const nameMatch = sourceMentionsTrade(blobText, tradeId);
      const otherOnly =
        explicit.length === 0 &&
        sourceMentionsOtherTrade(blobText, tradeId) &&
        !nameMatch;
      const general = explicit.length === 0 && !sourceMentionsOtherTrade(blobText, tradeId);
      if (!matchesExplicit && !nameMatch && !general) continue;
      if (otherOnly) continue;
      seen.add(key);
      const payToPlay = /pay-to-play|leadgen|lead-gen|vergelijk/i.test(blobText);
      out.push({
        name: blob.name,
        url: blob.url,
        category: channel.category,
        weight: weightForCategory(channel.category),
        payToPlay,
      });
    }
  }
  return out.slice(0, 8);
}

export function buildTrustProposal(args: {
  authenticity: LocalAuthenticityVerdict;
  localEvidence: { kind: "ov" | "sport" | "festivity"; label: string }[];
  countryChecks: CountryCheck[];
  kvkPass: boolean;
}): TrustProposal {
  const weights: number[] = [];
  const evidence: string[] = [];
  if (args.authenticity !== "fake_local") {
    for (const item of args.localEvidence) {
      if (item.kind === "ov") {
        weights.push(65);
        evidence.push(`Named on ${item.label}`);
      } else if (item.kind === "sport") {
        weights.push(50);
        evidence.push(`Sponsor on ${item.label}`);
      } else {
        weights.push(60);
        evidence.push(`Named at ${item.label}`);
      }
    }
    for (const check of args.countryChecks) {
      if (check.outcome !== "listed" || check.payToPlay) continue;
      weights.push(check.weight ?? weightForCategory(check.category));
      evidence.push(`Listed at ${check.sourceName}`);
    }
  } else {
    evidence.push("Local boost withheld: site does not support a local craft claim");
  }
  if (args.kvkPass) {
    weights.push(30);
    evidence.push("Identity check only");
  }
  const hasLocal = evidence.some((e) => /Named on|Sponsor on|Named at/.test(e));
  const hasCountry = args.countryChecks.some((c) => c.outcome === "listed" && !c.payToPlay);
  let band = "none";
  if (args.authenticity === "fake_local") band = "withheld";
  else if (hasLocal && hasCountry) band = "mixed";
  else if (hasCountry) band = "country";
  else if (hasLocal) band = "local";
  else if (args.kvkPass) band = "identity";

  return {
    score: evidenceScoreFromWeights(weights),
    band,
    evidence,
    provisional: true,
    producer: "ExternalAI",
    localAuthenticity: args.authenticity,
    countryChecks: args.countryChecks,
  };
}

/** Public search rank. Fake-local firms stay in the mission and out of the trusted list. */
export function addressSearchRank(company: {
  localAuthenticity?: { verdict?: string } | null;
  trustProposal?: { score?: number; evidence?: string[] } | null;
}): { include: boolean; score: number; why: string } {
  if (company.localAuthenticity?.verdict === "fake_local") {
    return { include: false, score: 0, why: "" };
  }
  const score = company.trustProposal?.score ?? 0;
  const why = (company.trustProposal?.evidence ?? []).filter(Boolean).join(" · ");
  return { include: true, score, why };
}
