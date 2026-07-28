import { z } from "zod";

/**
 * The closed vocabulary of company-data fields a trust source can hold.
 * Drives the richness score (what a source HAS) and the extraction guide
 * (what the scraper should PULL). Keep this enum stable — OmegaClaw reports
 * against it and the scraper consumes it.
 */
export const SourceFieldKeySchema = z.enum([
  "name", // 1 — company name (baseline; no names => not extractable)
  "website", // 2
  "address", // 3
  "phone", // 4
  "email", // 5
  "image", // 6 — logo / thumbnail
  "kvk", // chamber-of-commerce number (drives the hard kvk gate)
  "specialism", // extra output value the list row carries
  "tier", // quality label the list assigns (gold/silver/certified)
]);
export type SourceFieldKey = z.infer<typeof SourceFieldKeySchema>;
export const SOURCE_FIELD_KEYS = SourceFieldKeySchema.options;

/**
 * default.v1 weights — sum to exactly 100, so a fully-rich source scores 100.
 * Explainable by construction: richness = sum of weights of present fields.
 */
export const RICHNESS_WEIGHTS: Record<SourceFieldKey, number> = {
  name: 15,
  website: 15,
  address: 10,
  phone: 10,
  email: 10,
  image: 5,
  kvk: 20,
  specialism: 10,
  tier: 5,
};
export const RICHNESS_FORMULA = "default.v1" as const;

export const RichnessSchema = z.object({
  score: z.number().min(0).max(100),
  present: z.array(SourceFieldKeySchema),
  formula: z.literal(RICHNESS_FORMULA),
});
export type Richness = z.infer<typeof RichnessSchema>;

/** Deterministic, explainable richness from a set of present fields. */
export function computeRichness(present: SourceFieldKey[]): Richness {
  const uniq = Array.from(new Set(present)).filter((f) => f in RICHNESS_WEIGHTS);
  const score = Math.min(
    100,
    uniq.reduce((sum, f) => sum + RICHNESS_WEIGHTS[f], 0),
  );
  return { score, present: uniq, formula: RICHNESS_FORMULA };
}

/** How a source page is laid out — tells the scraper what to expect. */
export const ListPatternSchema = z.enum([
  "table",
  "cards",
  "directory",
  "map",
  "json-api",
  "search-form",
  "unknown",
]);
export type ListPattern = z.infer<typeof ListPatternSchema>;

/**
 * Extraction guide — written by PROBE (Job 2), consumed by EXTRACT (Job 3).
 * `fields` MUST be a subset of the source's `sourceFields` (you can only
 * extract what the source holds). The harness enforces this invariant.
 */
export const ExtractionGuideSchema = z.object({
  listPattern: ListPatternSchema.default("unknown"),
  fields: z.array(SourceFieldKeySchema).default([]),
  /** Optional CSS/XPath hints per field, if the probe could read them. */
  selectors: z.record(SourceFieldKeySchema, z.string()).optional(),
  pagination: z.boolean().default(false),
  /** How the page scopes to the mission location (postcode box, dropdown…). */
  regionFilter: z.string().optional(),
  notes: z.string().optional(),
});
export type ExtractionGuide = z.infer<typeof ExtractionGuideSchema>;

export const ProbeStatusSchema = z.enum(["unprobed", "probed", "probe-failed"]);
export type ProbeStatus = z.infer<typeof ProbeStatusSchema>;

/** Guard: extractionGuide.fields ⊆ sourceFields. Throws otherwise. */
export function assertGuideSubsetOfFields(
  guideFields: SourceFieldKey[],
  sourceFields: SourceFieldKey[],
): void {
  const have = new Set(sourceFields);
  const extra = guideFields.filter((f) => !have.has(f));
  if (extra.length > 0) {
    throw new Error(
      `extractionGuide.fields not a subset of sourceFields: ${extra.join(", ")}`,
    );
  }
}
