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
