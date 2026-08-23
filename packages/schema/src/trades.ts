import { z } from "zod";
import rawTrades from "./trades.v1.json";

/**
 * HHH specialty doors = H3TH national packs.
 * Gevel / VvE-common spaces are not doors. Audience is For, never a pack.
 */

export const TradeIdSchema = z.enum([
  "paint",
  "electro",
  "hvac",
  "bath",
  "drain",
  "roof",
  "glazing",
  "garden",
  "security",
  "solar",
  "pest",
  "handyman",
]);
export type TradeId = z.infer<typeof TradeIdSchema>;

export const TRADE_IDS: readonly TradeId[] = TradeIdSchema.options;

export const AudienceIdSchema = z.enum([
  "private",
  "hoa",
  "municipal",
  "commercial",
  "industrial",
]);
export type AudienceId = z.infer<typeof AudienceIdSchema>;

export const TradeSpecialisationSchema = z.object({
  id: z.string().min(1),
  aliases: z.array(z.string()).default([]),
});
export type TradeSpecialisation = z.infer<typeof TradeSpecialisationSchema>;

export const TradeDoorSchema = z.object({
  id: TradeIdSchema,
  label: z.string().min(1),
  label_en: z.string().min(1),
  aliases: z.array(z.string()),
  packAliases: z.array(z.string()),
  specialisations: z.array(TradeSpecialisationSchema).default([]),
});
export type TradeDoor = z.infer<typeof TradeDoorSchema>;

export const AudienceDoorSchema = z.object({
  id: AudienceIdSchema,
  aliases: z.array(z.string()),
});

export const TradesDocumentSchema = z.object({
  version: z.string().min(1),
  sector: z.string().min(1),
  audiences: z.array(AudienceDoorSchema),
  trades: z.array(TradeDoorSchema).length(12),
});
export type TradesDocument = z.infer<typeof TradesDocumentSchema>;

export const TRADES: TradesDocument = TradesDocumentSchema.parse(rawTrades);

export const HOME_MAINTENANCE_SECTOR = TRADES.sector;

export function foldTradeLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function aliasHitsHay(hay: string, alias: string): boolean {
  const a = foldTradeLabel(alias);
  if (!a) return false;
  if (a.length <= 2) {
    return hay.split(" ").includes(a);
  }
  return hay.includes(a);
}

export function tradeById(id: string): TradeDoor | undefined {
  return TRADES.trades.find((t) => t.id === id);
}

export function tradeLabel(id: string): string {
  return tradeById(id)?.label ?? id;
}

/** Every trade id this pack subsector (or free-text) belongs to. */
export function tradeIdsForPackLabel(subsector: string): TradeId[] {
  const folded = foldTradeLabel(subsector);
  if (!folded) return [];
  const hits: TradeId[] = [];
  for (const trade of TRADES.trades) {
    if (trade.id === folded) {
      hits.push(trade.id);
      continue;
    }
    const names = [trade.id, trade.label, trade.label_en, ...trade.packAliases];
    if (names.some((n) => foldTradeLabel(n) === folded)) {
      hits.push(trade.id);
    }
  }
  return hits;
}

export function packMatchesTrade(subsector: string, tradeId: string): boolean {
  return tradeIdsForPackLabel(subsector).includes(tradeId as TradeId);
}

/** First canonical id for a pack label (paint, not electro+hvac+bath). */
export function primaryTradeId(subsector: string): TradeId | undefined {
  const ids = tradeIdsForPackLabel(subsector);
  if (ids.length === 1) return ids[0];
  const folded = foldTradeLabel(subsector);
  if (TradeIdSchema.safeParse(folded).success) return folded as TradeId;
  return ids[0];
}

export type CapabilityFilter = {
  id: string;
  aliases: string[];
};

export type ResolvedSearchQuery = {
  tradeId?: TradeId;
  capabilityFilter?: CapabilityFilter;
  location?: string;
  context?: AudienceId;
};

function longestFirst(items: Array<{ alias: string; len: number }>): void {
  items.sort((a, b) => b.len - a.len || a.alias.localeCompare(b.alias));
}

export function resolveSearchQuery(
  raw: string,
  placeCandidates: readonly string[] = [],
): ResolvedSearchQuery {
  const hay = foldTradeLabel(raw);
  if (!hay) return {};

  let location: string | undefined;
  const places = [...new Set(placeCandidates.filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
  for (const loc of places) {
    const n = foldTradeLabel(loc);
    if (n && hay.includes(n)) {
      location = loc;
      break;
    }
  }

  let context: AudienceId | undefined;
  const audienceHits: Array<{ alias: string; id: AudienceId; len: number }> = [];
  for (const aud of TRADES.audiences) {
    for (const alias of aud.aliases) {
      audienceHits.push({
        alias,
        id: aud.id,
        len: foldTradeLabel(alias).length,
      });
    }
  }
  longestFirst(audienceHits);
  for (const hit of audienceHits) {
    if (aliasHitsHay(hay, hit.alias)) {
      context = hit.id;
      break;
    }
  }

  const specHits: Array<{
    alias: string;
    tradeId: TradeId;
    spec: TradeSpecialisation;
    len: number;
  }> = [];
  for (const trade of TRADES.trades) {
    for (const spec of trade.specialisations) {
      for (const alias of [spec.id, ...spec.aliases]) {
        specHits.push({
          alias,
          tradeId: trade.id,
          spec,
          len: foldTradeLabel(alias).length,
        });
      }
    }
  }
  longestFirst(specHits);

  for (const hit of specHits) {
    if (hit.len < 4) continue;
    if (!aliasHitsHay(hay, hit.alias)) continue;
    return {
      tradeId: hit.tradeId,
      capabilityFilter: {
        id: hit.spec.id,
        aliases: [hit.spec.id, ...hit.spec.aliases],
      },
      location,
      context,
    };
  }

  const tradeHits: Array<{ alias: string; tradeId: TradeId; len: number }> = [];
  for (const trade of TRADES.trades) {
    for (const alias of [trade.id, trade.label, trade.label_en, ...trade.aliases]) {
      tradeHits.push({
        alias,
        tradeId: trade.id,
        len: foldTradeLabel(alias).length,
      });
    }
  }
  longestFirst(tradeHits);
  for (const hit of tradeHits) {
    if (hit.len < 2) continue;
    if (!aliasHitsHay(hay, hit.alias)) continue;
    return { tradeId: hit.tradeId, location, context };
  }

  return { location, context };
}

export function capabilitiesMatchFilter(
  capabilities: readonly string[] | undefined,
  filter: CapabilityFilter | undefined,
): boolean {
  if (!filter) return false;
  const needles = new Set(filter.aliases.map(foldTradeLabel));
  needles.add(foldTradeLabel(filter.id));
  for (const cap of capabilities ?? []) {
    const folded = foldTradeLabel(cap);
    if (!folded) continue;
    if (needles.has(folded)) return true;
    for (const needle of needles) {
      if (needle.length >= 4 && (folded.includes(needle) || needle.includes(folded))) {
        return true;
      }
    }
  }
  return false;
}

export const CAN_MATCH_BOOST = 10;
