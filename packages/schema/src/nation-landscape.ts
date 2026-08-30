import { z } from "zod";
import { canonicalCountry, foldCountryLabel } from "./country-aliases";

const ProducerSchema = z.enum([
  "Human",
  "OmegaClaw",
  "ExternalAI",
  "ImportedDataset",
]);
const IsoDateSchema = z.string().datetime({ offset: true }).or(z.string().min(1));

/** 12 discovery channels — nation playbook, not the 12 trade doors. */
export const DISCOVERY_CHANNELS = [
  {
    layer: "national",
    category: "registry",
    title: "Chamber of commerce",
    shortLabel: "Registry",
  },
  {
    layer: "national",
    category: "sector_qualification",
    title: "Sector qualifications",
    shortLabel: "Qualification",
  },
  {
    layer: "national",
    category: "quality_mark",
    title: "Quality marks",
    shortLabel: "Keurmerk",
  },
  {
    layer: "national",
    category: "branch_association",
    title: "Trade associations",
    shortLabel: "Branche",
  },
  {
    layer: "national",
    category: "labor_market_presence",
    title: "Traineeships (national)",
    shortLabel: "Stage",
  },
  {
    layer: "regional",
    category: "labor_market_presence",
    title: "Traineeships (regional)",
    shortLabel: "Regional jobs",
  },
  {
    layer: "regional",
    category: "local_media",
    title: "Regional media",
    shortLabel: "Media",
  },
  {
    layer: "local",
    category: "local_business_association",
    title: "Local business clubs",
    shortLabel: "OV",
  },
  {
    layer: "local",
    category: "sponsorship",
    title: "Sport clubs & sponsors",
    shortLabel: "Sport",
  },
  {
    layer: "local",
    category: "networking_group",
    title: "Networking groups",
    shortLabel: "BNI",
  },
  {
    layer: "local",
    category: "municipal_initiative",
    title: "Municipal lists",
    shortLabel: "Gemeente",
  },
  {
    layer: "local",
    category: "trade_fair",
    title: "Yearly festivities",
    shortLabel: "Festivities",
  },
] as const;

export type DiscoveryChannelDef = (typeof DISCOVERY_CHANNELS)[number];

export const NationChannelCoverageSchema = z.enum([
  "empty",
  "proposed",
  "accepted",
]);
export type NationChannelCoverage = z.infer<typeof NationChannelCoverageSchema>;

export const NationLandscapeStatusSchema = z.enum([
  "empty",
  "mapping",
  "ready",
]);
export type NationLandscapeStatus = z.infer<typeof NationLandscapeStatusSchema>;

export const NationPlatformSchema = z.object({
  name: z.string().min(1),
  url: z.string().optional(),
  unlockNote: z.string().optional(),
});
export type NationPlatform = z.infer<typeof NationPlatformSchema>;

export const NationProposedSourceSchema = z.object({
  name: z.string().min(1),
  url: z.string().optional(),
  listUrl: z.string().optional(),
});
export type NationProposedSource = z.infer<typeof NationProposedSourceSchema>;

export const NationChannelSchema = z.object({
  layer: z.enum(["national", "regional", "local"]),
  category: z.string().min(1),
  title: z.string().min(1),
  howToFind: z.string().default(""),
  platforms: z.array(NationPlatformSchema).default([]),
  proposedSources: z.array(NationProposedSourceSchema).default([]),
  coverage: NationChannelCoverageSchema.default("empty"),
});
export type NationChannel = z.infer<typeof NationChannelSchema>;

export const NationLandscapeSchema = z.object({
  country: z.string().min(1),
  countrySlug: z.string().min(1),
  status: NationLandscapeStatusSchema.default("empty"),
  overview: z.string().default(""),
  channels: z.array(NationChannelSchema).min(1),
  producer: ProducerSchema.optional(),
  updatedAt: IsoDateSchema,
  v: z.number().int().positive().default(1),
});
export type NationLandscape = z.infer<typeof NationLandscapeSchema>;

const COUNTRY_DISPLAY: Record<string, string> = {
  netherlands: "Netherlands",
  belgium: "Belgium",
  italy: "Italy",
};

export function countrySlug(value: string): string {
  return canonicalCountry(value) || foldCountryLabel(value) || "unknown";
}

export function displayCountry(value: string): string {
  const slug = countrySlug(value);
  if (COUNTRY_DISPLAY[slug]) return COUNTRY_DISPLAY[slug];
  const raw = value.trim();
  if (!raw) return slug;
  return raw.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function channelKey(
  layer: string,
  category: string,
): string {
  return `${layer}|${category}`;
}

export function discoveryTitle(
  layer: string,
  category: string,
): string {
  const hit = DISCOVERY_CHANNELS.find(
    (c) => c.layer === layer && c.category === category,
  );
  return hit?.title ?? `${layer} · ${category}`;
}

export function emptyNationLandscape(country: string): NationLandscape {
  const slug = countrySlug(country);
  return {
    country: displayCountry(country),
    countrySlug: slug,
    status: "empty",
    overview: "",
    channels: DISCOVERY_CHANNELS.map((c) => ({
      layer: c.layer,
      category: c.category,
      title: c.title,
      howToFind: "",
      platforms: [],
      proposedSources: [],
      coverage: "empty",
    })),
    producer: "Human",
    updatedAt: new Date().toISOString(),
    v: 1,
  };
}

export function stripJsonFences(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] ?? raw).trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function coercePlatforms(raw: unknown): NationPlatform[] {
  if (!Array.isArray(raw)) return [];
  const out: NationPlatform[] = [];
  for (const item of raw) {
    if (typeof item === "string" && item.trim()) {
      out.push({ name: item.trim() });
      continue;
    }
    const rec = asRecord(item);
    if (!rec) continue;
    const name = String(rec.name ?? rec.title ?? rec.platform ?? "").trim();
    if (!name) continue;
    const url = String(rec.url ?? rec.href ?? "").trim() || undefined;
    const unlockNote = String(
      rec.unlockNote ?? rec.unlock_note ?? rec.note ?? rec.how ?? "",
    ).trim() || undefined;
    out.push({ name, url, unlockNote });
  }
  return out;
}

function coerceProposed(raw: unknown): NationProposedSource[] {
  if (!Array.isArray(raw)) return [];
  const out: NationProposedSource[] = [];
  for (const item of raw) {
    if (typeof item === "string" && item.trim()) {
      out.push({ name: item.trim() });
      continue;
    }
    const rec = asRecord(item);
    if (!rec) continue;
    const name = String(rec.name ?? rec.title ?? "").trim();
    if (!name) continue;
    out.push({
      name,
      url: String(rec.url ?? "").trim() || undefined,
      listUrl: String(rec.listUrl ?? rec.list_url ?? "").trim() || undefined,
    });
  }
  return out;
}

function coerceChannel(raw: unknown): Partial<NationChannel> | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const layerRaw = String(rec.layer ?? rec.scope ?? "").trim();
  const layer =
    layerRaw === "national" || layerRaw === "regional" || layerRaw === "local"
      ? layerRaw
      : undefined;
  const category = String(rec.category ?? rec.type ?? "").trim() || undefined;
  const title = String(rec.title ?? rec.name ?? rec.label ?? "").trim() || undefined;
  const howToFind = String(
    rec.howToFind ?? rec.how_to_find ?? rec.guide ?? rec.text ?? rec.body ?? rec.notes ?? "",
  );
  const coverageRaw = String(rec.coverage ?? "").trim();
  const coverage =
    coverageRaw === "accepted" || coverageRaw === "proposed" || coverageRaw === "empty"
      ? coverageRaw
      : undefined;
  return {
    layer,
    category,
    title,
    howToFind,
    platforms: coercePlatforms(rec.platforms ?? rec.sources),
    proposedSources: coerceProposed(rec.proposedSources ?? rec.proposed_sources ?? rec.lists),
    coverage,
  };
}

function foldLabel(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function matchChannelIndex(partial: Partial<NationChannel>): number {
  if (partial.layer && partial.category) {
    const exact = DISCOVERY_CHANNELS.findIndex(
      (c) => c.layer === partial.layer && c.category === partial.category,
    );
    if (exact >= 0) return exact;
  }
  const title = foldLabel(partial.title ?? "");
  if (title) {
    const byTitle = DISCOVERY_CHANNELS.findIndex((c) => {
      const t = foldLabel(c.title);
      const s = foldLabel(c.shortLabel);
      return t === title || s === title || t.includes(title) || title.includes(t);
    });
    if (byTitle >= 0) return byTitle;
  }
  return -1;
}

function landscapeStatusFromChannels(
  channels: NationChannel[],
  overview: string,
): NationLandscape["status"] {
  const filled = channels.filter((c) => c.howToFind.trim() || c.platforms.length).length;
  if (filled >= DISCOVERY_CHANNELS.length) return "ready";
  if (filled > 0 || overview.trim()) return "mapping";
  return "empty";
}

/**
 * Accept paste from Qwen / Cursor: fenced JSON, { landscape }, channel arrays,
 * or plain overview prose. Always returns the 12 canonical channels.
 */
export function coerceLandscapeInput(
  raw: unknown,
  country: string,
  existing?: NationLandscape | null,
): NationLandscape {
  const base = mergeLandscapeChannels(existing ?? emptyNationLandscape(country));
  let doc: unknown = raw;
  if (typeof raw === "string") {
    const text = stripJsonFences(raw);
    if (!text) return base;
    try {
      doc = JSON.parse(text);
    } catch {
      const next = {
        ...base,
        overview: text,
        status: "mapping" as const,
        producer: "Human" as const,
        updatedAt: new Date().toISOString(),
      };
      return next;
    }
  }

  const rec = asRecord(doc);
  if (rec?.landscape) return coerceLandscapeInput(rec.landscape, country, base);
  if (rec?.data && !rec.channels && !rec.overview) {
    return coerceLandscapeInput(rec.data, country, base);
  }

  const overview = String(rec?.overview ?? rec?.intro ?? rec?.summary ?? base.overview);
  const channelRaw = rec?.channels ?? rec?.chapters ?? rec?.entries ?? rec?.items;
  const incoming = Array.isArray(channelRaw)
    ? channelRaw
    : Array.isArray(doc)
      ? doc
      : [];

  const channels = base.channels.map((ch) => ({ ...ch }));
  incoming.forEach((item, i) => {
    const partial = coerceChannel(item);
    if (!partial) return;
    let idx = matchChannelIndex(partial);
    if (idx < 0 && i < channels.length) idx = i;
    if (idx < 0) return;
    const current = channels[idx]!;
    const howToFind = partial.howToFind?.trim() || current.howToFind;
    const platforms = partial.platforms?.length ? partial.platforms : current.platforms;
    const proposedSources = partial.proposedSources?.length
      ? partial.proposedSources
      : current.proposedSources;
    const coverage =
      partial.coverage ??
      (howToFind.trim() || platforms.length ? "proposed" : current.coverage);
    channels[idx] = {
      ...current,
      howToFind,
      platforms,
      proposedSources,
      coverage,
    };
  });

  return {
    ...base,
    country: displayCountry(country),
    countrySlug: countrySlug(country),
    overview: overview || base.overview,
    channels,
    status: landscapeStatusFromChannels(channels, overview || base.overview),
    producer: "Human",
    updatedAt: new Date().toISOString(),
  };
}

export function mergeLandscapeChannels(
  landscape: NationLandscape,
): NationLandscape {
  const byKey = new Map(
    landscape.channels.map((ch) => [channelKey(ch.layer, ch.category), ch]),
  );
  const channels = DISCOVERY_CHANNELS.map((def) => {
    const existing = byKey.get(channelKey(def.layer, def.category));
    if (existing) {
      return { ...existing, title: existing.title || def.title };
    }
    return {
      layer: def.layer,
      category: def.category,
      title: def.title,
      howToFind: "",
      platforms: [],
      proposedSources: [],
      coverage: "empty" as const,
    };
  });
  return { ...landscape, channels };
}
