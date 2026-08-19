import { z } from "zod";
import {
  SourceTypeSchema,
  SourceCategorySchema,
  SourceScopeSchema,
  SourceEvidenceSchema,
  ServiceContextSchema,
  KvkGateSchema,
  SampleCompanySchema,
} from "./index";
import { AccessBarrierSchema } from "./access-barriers";
import {
  SourceFieldKeySchema,
  RichnessSchema,
  ExtractionGuideSchema,
  ListRenderTypeSchema,
  SourceDepthSchema,
} from "./source-richness";

/**
 * The five OmegaClaw jobs. Prompt BODIES live in OmegaClaw.md; these
 * schemas are the contract AROUND the prompt — what the harness sends and
 * what it accepts back. Frozen on purpose: when the API key lands, only the
 * adapter's internals change, never these shapes.
 *
 * Exposed via `@h3-trust/schema/omega` — not re-exported from index.
 */
export const OmegaCommandSchema = z.enum([
  "discover",
  "probe",
  "extract",
  "harvest",
  "refresh",
  "classify",
]);
export type OmegaCommand = z.infer<typeof OmegaCommandSchema>;
export const OmegaProducerSchema = z.literal("OmegaClaw");

const MissionContextSchema = z.object({
  country: z.string(),
  location: z.string(),
  sector: z.string(),
  subsector: z.string(),
  goal: z.string(),
});

/* ----------------------------- discover (Job 1) ---------------------------- */
export const DiscoverGapSchema = z.object({
  layer: SourceScopeSchema,
  category: SourceCategorySchema,
  nuance_rule: z.string().optional(),
});
export type DiscoverGap = z.infer<typeof DiscoverGapSchema>;
/** Aligns with ReviewAction — "dissent" in Bouwplan = disagree. */
export const RecentFeedbackSchema = z.object({
  decision: z.enum(["agree", "adjust", "disagree"]),
  reason: z.string().optional(),
});
export const DiscoverInputSchema = z.object({
  missionId: z.string().uuid(),
  gap: DiscoverGapSchema,
  context: MissionContextSchema,
  existingSourceNames: z.array(z.string()).default([]),
  recentFeedback: z.array(RecentFeedbackSchema).default([]),
});
export type DiscoverInput = z.infer<typeof DiscoverInputSchema>;

export const DiscoverCandidateSchema = z.object({
  found: z.boolean(),
  name: z.string().optional(),
  type: SourceTypeSchema.optional(),
  category: SourceCategorySchema.optional(),
  scope: SourceScopeSchema.optional(),
  region: z.string().optional(),
  url: z.string().optional(),
  /** Concrete list/search URL — required for list_ready depth. */
  listUrl: z.string().optional(),
  discoveredVia: z.string().optional(),
  listRenderType: ListRenderTypeSchema.optional(),
  filterHints: z.string().optional(),
  depth: SourceDepthSchema.optional(),
  memberListPublic: z.boolean().optional(),
  reason: z.string().optional(),
  suggestedWeight: z.number().min(0).max(100).optional(),
  suggestedConfidence: z.number().min(0).max(100).optional(),
  confidence_in_existence: z.enum(["high", "medium", "low"]).optional(),
});
export type DiscoverCandidate = z.infer<typeof DiscoverCandidateSchema>;
export const DiscoverOutputSchema = z.object({
  producer: OmegaProducerSchema,
  missionId: z.string().uuid(),
  candidates: z.array(DiscoverCandidateSchema).default([]),
});
export type DiscoverOutput = z.infer<typeof DiscoverOutputSchema>;

/* ------------------------------ probe (Job 2) ------------------------------ */
export const ProbeInputSchema = z.object({
  missionId: z.string().uuid(),
  sourceId: z.string().uuid(),
  url: z.string().optional(),
  category: SourceCategorySchema,
  nuance_rule: z.string().optional(),
  context: MissionContextSchema,
  fieldUniverse: z.array(SourceFieldKeySchema),
});
export type ProbeInput = z.infer<typeof ProbeInputSchema>;
export const ProbeOutputSchema = z.object({
  producer: OmegaProducerSchema,
  missionId: z.string().uuid(),
  sourceId: z.string().uuid(),
  sourceFields: z.array(SourceFieldKeySchema).default([]),
  richness: RichnessSchema,
  extractionGuide: ExtractionGuideSchema,
  suggestedConfidence: z.number().min(0).max(100).optional(),
  evidence: SourceEvidenceSchema,
  /**
   * 1–3 real company names proving the list is extractable.
   * Prefer this or a blocks-extract accessBarrier — not essay-only success.
   */
  sampleCompanies: z.array(SampleCompanySchema).optional(),
  /** Ω raises this when the list needs a human to unlock. Harness stores it on the Source. */
  accessBarrier: AccessBarrierSchema.optional(),
});
export type ProbeOutput = z.infer<typeof ProbeOutputSchema>;

/* ----------------------------- extract (Job 3) ----------------------------- */
export const ExtractSourceRefSchema = z.object({
  id: z.string().uuid(),
  url: z.string().optional(),
  sourceFields: z.array(SourceFieldKeySchema).default([]),
  extractionGuide: ExtractionGuideSchema,
});
export const ExtractInputSchema = z.object({
  missionId: z.string().uuid(),
  sources: z.array(ExtractSourceRefSchema),
  context: MissionContextSchema,
  existingCompanyNames: z.array(z.string()).default([]),
  kvkFormat: z.string().optional(),
});
export type ExtractInput = z.infer<typeof ExtractInputSchema>;
export const ExtractCompanySchema = z.object({
  name: z.string(),
  address: z.string().optional(),
  region: z.string().optional(),
  kvk_number: z.string().optional(),
  kvk_gate: KvkGateSchema.default("unchecked"),
  source_ids: z.array(z.string().uuid()).default([]),
  list_membership: z.array(z.string()).default([]),
  fieldsExtracted: z.array(SourceFieldKeySchema).default([]),
  specialism: z.string().optional(),
  website_url: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  tier: z.string().optional(),
  image: z.string().optional(),
});
export type ExtractCompany = z.infer<typeof ExtractCompanySchema>;
export const ExtractOutputSchema = z.object({
  producer: OmegaProducerSchema,
  missionId: z.string().uuid(),
  companies: z.array(ExtractCompanySchema).default([]),
  discoveryNotes: z.string().optional(),
});
export type ExtractOutput = z.infer<typeof ExtractOutputSchema>;

/* ----------------------------- harvest (Job 4) ----------------------------- */
export const HarvestInputSchema = z.object({
  missionId: z.string().uuid(),
  companyId: z.string().uuid(),
  name: z.string(),
  website_url: z.string().optional(),
  capability_aliases: z.record(z.string(), z.array(z.string())).default({}),
  service_contexts_allowed: z.array(ServiceContextSchema).default([]),
});
export type HarvestInput = z.infer<typeof HarvestInputSchema>;
/** Optional traditional webpage trust probe — a SIGNAL, not a gate. */
export const WebpageTrustProbeSchema = z.object({
  domain_age: z.string().optional(),
  has_real_address: z.boolean().optional(),
  has_contact: z.boolean().optional(),
  notes: z.string().optional(),
});
export const HarvestOutputSchema = z.object({
  producer: OmegaProducerSchema,
  missionId: z.string().uuid(),
  companyId: z.string().uuid(),
  capabilities: z.array(z.string()).default([]),
  serviceContexts: z.array(ServiceContextSchema).default([]),
  differentiators: z.array(z.string()).default([]),
  profileSnippet: z.string(),
  harvest_confidence: z.enum(["high", "medium", "low"]).optional(),
  webpageTrustProbe: WebpageTrustProbeSchema.optional(),
});
export type HarvestOutput = z.infer<typeof HarvestOutputSchema>;

/* ----------------------------- refresh (Job 5) ----------------------------- */
export const RefreshInputSchema = z.object({
  missionId: z.string().uuid(),
  check_type: z.enum(["full_mission", "single_company"]).default("full_mission"),
  context: MissionContextSchema,
  last_full_check: z.string().optional(),
});
export type RefreshInput = z.infer<typeof RefreshInputSchema>;
export const RefreshOutputSchema = z.object({
  producer: OmegaProducerSchema,
  missionId: z.string().uuid(),
  checked_at: z.string(),
  companies_added: z.array(ExtractCompanySchema).default([]),
  companies_removed: z.array(z.string()).default([]),
  source_changes: z.array(z.string()).default([]),
  overall_status: z
    .enum(["no_changes", "minor_changes", "major_changes"])
    .default("no_changes"),
});
export type RefreshOutput = z.infer<typeof RefreshOutputSchema>;

/* ----------------------------- classify (Job 6) ---------------------------- */
export const ClassifyVerdictSchema = z.enum([
  "home_service",
  "not_service",
  "unknown",
]);
export const ClassifyRowSchema = z.object({
  companyId: z.string().uuid().optional(),
  name: z.string().min(1),
  verdict: ClassifyVerdictSchema,
  suggestedSubsector: z.string().optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
  websiteChecked: z.boolean().optional(),
  notes: z.string().optional(),
});
export type ClassifyRow = z.infer<typeof ClassifyRowSchema>;
export const ClassifyInputSchema = z.object({
  missionId: z.string().uuid(),
  sourceId: z.string().uuid().optional(),
  companies: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      website_url: z.string().optional(),
      address: z.string().optional(),
      region: z.string().optional(),
    }),
  ),
});
export type ClassifyInput = z.infer<typeof ClassifyInputSchema>;
export const ClassifyOutputSchema = z.object({
  producer: OmegaProducerSchema,
  missionId: z.string().uuid(),
  sourceId: z.string().uuid().optional(),
  verdicts: z.array(ClassifyRowSchema).default([]),
});
export type ClassifyOutput = z.infer<typeof ClassifyOutputSchema>;

/** Command → {input, output} schema pair. The adapter validates against these. */
export const OMEGA_CONTRACTS = {
  discover: { input: DiscoverInputSchema, output: DiscoverOutputSchema },
  probe: { input: ProbeInputSchema, output: ProbeOutputSchema },
  extract: { input: ExtractInputSchema, output: ExtractOutputSchema },
  harvest: { input: HarvestInputSchema, output: HarvestOutputSchema },
  refresh: { input: RefreshInputSchema, output: RefreshOutputSchema },
  classify: { input: ClassifyInputSchema, output: ClassifyOutputSchema },
} as const;
