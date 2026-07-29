import { z } from "zod";
import { AccessBarrierSchema } from "./access-barriers";
import {
  SourceFieldKeySchema,
  RichnessSchema,
  ExtractionGuideSchema,
  ProbeStatusSchema,
} from "./source-richness";

/** Who performed this step — golden rule on every writable object. */
export const ProducerSchema = z.enum([
  "Human",
  "OmegaClaw",
  "ExternalAI",
  "ImportedDataset",
]);
export type Producer = z.infer<typeof ProducerSchema>;

export const IsoDateSchema = z.string().datetime({ offset: true }).or(z.string().min(1));

const baseMeta = {
  id: z.string().uuid(),
  missionId: z.string().uuid(),
  producer: ProducerSchema,
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  v: z.number().int().positive().default(1),
};

export const MissionPhaseSchema = z.enum([
  "observation",
  "hypothesis",
  "evidence",
  "cara",
  "patterns",
  "companies",
  "deep_check",
]);
export type MissionPhase = z.infer<typeof MissionPhaseSchema>;

/** How we approach this region × sector — Fase 0 thought process. */
export const DiscoveryBriefSchema = z.object({
  approach: z.string().default(""),
  candidateListTypes: z.array(z.string()).default([]),
  successCriteria: z.string().default(""),
  notes: z.string().optional(),
  producer: ProducerSchema.optional(),
  updatedAt: IsoDateSchema.optional(),
});
export type DiscoveryBrief = z.infer<typeof DiscoveryBriefSchema>;

export const MissionSchema = z.object({
  id: z.string().uuid(),
  location: z.string().min(1),
  country: z.string().min(1),
  sector: z.string().min(1),
  subsector: z.string().min(1),
  goal: z.string().min(1),
  notes: z.string().optional(),
  /**
   * Which shared search plan this mission uses (stem, e.g. "default.v1").
   * Lives outside writable/ so plans can evolve independently of missions.
   */
  search_plan_version: z.string().min(1).default("default.v1"),
  discoveryBrief: DiscoveryBriefSchema.default({
    approach: "",
    candidateListTypes: [],
    successCriteria: "",
  }),
  phases: z.array(
    z.object({
      key: MissionPhaseSchema,
      status: z.enum(["waiting", "active", "done"]),
    }),
  ),
  producer: ProducerSchema,
  /** How this mission entered the catalogue. */
  origin: z.enum(["human", "search_demand"]).optional(),
  /** Worldwide Single Search hits for this place × trade. */
  demandCount: z.number().int().nonnegative().optional(),
  lastSearchedAt: IsoDateSchema.optional(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  v: z.number().int().positive().default(1),
});
export type Mission = z.infer<typeof MissionSchema>;

export const JournalEntrySchema = z.object({
  ...baseMeta,
  kind: z.enum(["note", "task", "journal"]),
  title: z.string().min(1),
  body: z.string(),
  done: z.boolean().optional(),
});
export type JournalEntry = z.infer<typeof JournalEntrySchema>;

export const ObservationSchema = z.object({
  ...baseMeta,
  statement: z.string().min(1),
  evidenceUrls: z.array(z.string()).default([]),
  evidenceIds: z.array(z.string().uuid()).default([]),
  tags: z.array(z.string()).default([]),
  /** Facts only — no score, no verdict. */
});
export type Observation = z.infer<typeof ObservationSchema>;

export const HypothesisStatusSchema = z.enum([
  "Draft",
  "Testing",
  "Validated",
  "Rejected",
  "Archived",
]);
export type HypothesisStatus = z.infer<typeof HypothesisStatusSchema>;

export const HypothesisSchema = z.object({
  ...baseMeta,
  statement: z.string().min(1),
  status: HypothesisStatusSchema,
  observationIds: z.array(z.string().uuid()).default([]),
  rationale: z.string().optional(),
});
export type Hypothesis = z.infer<typeof HypothesisSchema>;

export const SourceTypeSchema = z.enum([
  "registry",
  "association",
  "directory",
  "website",
  "municipality",
  "news",
  "other",
]);
export type SourceType = z.infer<typeof SourceTypeSchema>;

export const SourceStatusSchema = z.enum([
  /** Proposed by OmegaClaw or human — triage before evidence/CARA. */
  "candidate",
  "draft",
  "pending_review",
  "accepted",
  "adjusted",
  "rejected",
]);
export type SourceStatus = z.infer<typeof SourceStatusSchema>;

/** Geographic reuse scope — required for warm-start coverage matching. */
export const SourceScopeSchema = z.enum(["national", "regional", "local"]);
export type SourceScope = z.infer<typeof SourceScopeSchema>;

/** Trust-source taxonomy for discovery lists (separate from legacy Source.type). */
export const SourceCategorySchema = z.enum([
  "registry",
  "branch_association",
  "quality_mark",
  "local_business_association",
  "internship_market",
  "labor_market_presence",
  "sector_qualification",
  "trade_fair",
  "sponsorship",
  "local_media",
  "peer_referral",
  "digital_presence",
  "networking_group",
  "municipal_initiative",
]);
export type SourceCategory = z.infer<typeof SourceCategorySchema>;

export const SOURCE_CATEGORIES = SourceCategorySchema.options;

/** Membership barrier for quality orgs / associations / networking groups. */
export const MembershipThresholdSchema = z.preprocess((raw) => {
  if (typeof raw !== "string") return raw;
  const legacy: Record<string, string> = {
    laag: "low",
    midden: "medium",
    hoog: "high",
    onbekend: "unknown",
  };
  return legacy[raw] ?? raw;
}, z.enum(["low", "medium", "high", "unknown"]));
export type MembershipThreshold = z.infer<typeof MembershipThresholdSchema>;

export const RealWorldPresenceSchema = z.object({
  events: z.boolean().optional(),
  news: z.boolean().optional(),
  linkedin: z.boolean().optional(),
  facebook: z.boolean().optional(),
  notes: z.string().optional(),
});
export type RealWorldPresence = z.infer<typeof RealWorldPresenceSchema>;

/**
 * Structured evidence on a Source — what CARA (sources) reacts to.
 * Distinct from the mission-scoped Evidence collection (observation snippets).
 */
export const SourceEvidenceSchema = z.object({
  checked_at: IsoDateSchema.optional(),
  url: z.string().optional(),
  domain_age: z.string().optional(),
  org_age: z.string().optional(),
  host_info: z.string().optional(),
  membership_threshold: MembershipThresholdSchema.optional(),
  content_consistency: z
    .object({
      ok: z.boolean(),
      note: z.string().optional(),
    })
    .optional(),
  real_world_presence: RealWorldPresenceSchema.optional(),
  summary_reasons: z.array(z.string()).default([]),
});
export type SourceEvidence = z.infer<typeof SourceEvidenceSchema>;

const sourceObjectSchema = z.object({
  id: z.string().uuid(),
  producer: ProducerSchema,
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  v: z.number().int().positive().default(1),
  /** Mission where this list was first catalogued (not ownership). */
  first_seen_mission: z.string().uuid(),
  /** Other missions that linked this source (excludes first_seen_mission). */
  reused_in_missions: z.array(z.string().uuid()).default([]),
  name: z.string().min(1),
  type: SourceTypeSchema,
  /** Migrates missing values to digital_presence on parse. */
  category: SourceCategorySchema.default("digital_presence"),
  /**
   * Reuse scope. Required on create; missing legacy rows default to regional
   * so they never silently match as national coverage.
   */
  scope: SourceScopeSchema.default("regional"),
  /** Region label for regional/local sources; ignored when scope is national. */
  region: z.string().default(""),
  url: z.string().optional(),
  reason: z.string().optional(),
  suggestedWeight: z.number().min(0).max(100).optional(),
  suggestedConfidence: z.number().min(0).max(100).optional(),
  signalIds: z.array(z.string().uuid()).default([]),
  evidenceIds: z.array(z.string().uuid()).default([]),
  /** Structured proof OmegaClaw/human fills after triage — CARA reacts to this. */
  evidence: SourceEvidenceSchema.optional(),
  /** New proposals start as candidate; kept ones move to draft → CARA. */
  status: SourceStatusSchema.default("candidate"),
  notes: z.string().optional(),
  /** What company-data fields this source holds (probe, Job 2). Drives richness. */
  sourceFields: z.array(SourceFieldKeySchema).default([]),
  /** Explainable richness derived from sourceFields (default.v1). */
  richness: RichnessSchema.optional(),
  /** How to scrape this source — written by probe (Job 2), read by extract (Job 3). */
  extractionGuide: ExtractionGuideSchema.optional(),
  /** Probe lifecycle. New proposals are unprobed until Job 2 runs. */
  probeStatus: ProbeStatusSchema.default("unprobed"),
  /** Active access barrier Ω raised on this source (probe). Human resolves it. */
  accessBarrier: AccessBarrierSchema.optional(),
  /** Legacy owner field — stripped after migrate. */
  missionId: z.string().uuid().optional(),
});

/** Source is a reusable catalogue entity; missions link via MissionSource. */
export const SourceSchema = z.preprocess((raw) => {
  if (!raw || typeof raw !== "object") return raw;
  const o = { ...(raw as Record<string, unknown>) };
  if (
    (o.first_seen_mission == null || o.first_seen_mission === "") &&
    typeof o.missionId === "string"
  ) {
    o.first_seen_mission = o.missionId;
  }
  if (!Array.isArray(o.reused_in_missions)) {
    o.reused_in_missions = [];
  }
  if (o.scope == null || o.scope === "") {
    o.scope = "regional";
  }
  if (typeof o.region !== "string") {
    o.region = "";
  }
  return o;
}, sourceObjectSchema.transform(({ missionId: _legacy, ...rest }) => rest));
export type Source = z.infer<typeof SourceSchema>;

/** Join: which missions use which catalogue Source. */
export const MissionSourceSchema = z.object({
  id: z.string().uuid(),
  mission_id: z.string().uuid(),
  source_id: z.string().uuid(),
  added_at: IsoDateSchema,
  producer: ProducerSchema,
  updatedAt: IsoDateSchema.optional(),
  v: z.number().int().positive().default(1),
});
export type MissionSource = z.infer<typeof MissionSourceSchema>;

export const KvkGateSchema = z.enum(["pass", "fail", "unchecked"]);
export type KvkGate = z.infer<typeof KvkGateSchema>;

export const CompanyStatusSchema = z.enum(["candidate", "target", "staged"]);
export type CompanyStatus = z.infer<typeof CompanyStatusSchema>;

/**
 * Who the company serves — short universal enum, same set for every sector.
 * Separate from company.category (navigation door) and capabilities (what they do).
 * Legacy Dutch values are migrated on parse.
 */
export const ServiceContextSchema = z.preprocess((raw) => {
  if (typeof raw !== "string") return raw;
  const legacy: Record<string, string> = {
    particulier: "private",
    vve: "hoa",
    gemeente: "municipal",
    commercieel: "commercial",
    industrieel: "industrial",
  };
  return legacy[raw] ?? raw;
}, z.enum(["private", "hoa", "municipal", "commercial", "industrial"]));
export type ServiceContext = z.infer<typeof ServiceContextSchema>;
export const SERVICE_CONTEXTS: readonly ServiceContext[] = [
  "private",
  "hoa",
  "municipal",
  "commercial",
  "industrial",
];

export const CompanySchema = z.object({
  ...baseMeta,
  name: z.string().min(1),
  address: z.string().default(""),
  region: z.string().default(""),
  sector: z.string().default(""),
  /**
   * Navigation door for the UI (e.g. "painting"). Not a trust signal.
   * Distinct from mission/company `sector` and from Source.category.
   */
  category: z.string().default(""),
  kvk_number: z.string().optional(),
  /** Hard gate — not a weighted score. */
  kvk_gate: KvkGateSchema.default("unchecked"),
  /**
   * Per-company KvK single-lookup: Ω can suggest it, a human (or the free API later) runs it.
   * Modelled KvK-specific — not a generic per-company barrier engine.
   */
  kvk_manual_check: z
    .object({
      requested: z.boolean().default(false),
      suggested_by: z.literal("OmegaClaw").optional(),
      checked_by: z.string().optional(),
      result: z.enum(["pass", "fail", "unknown"]).optional(),
      checked_at: z.string().datetime().optional(),
    })
    .optional(),
  /** Extra list-row value (specialism / trade focus). */
  specialism: z.string().optional(),
  source_ids: z.array(z.string().uuid()).default([]),
  list_membership: z.array(z.string()).default([]),
  /** Empty = no hard exclusion. */
  blacklist_flags: z.array(z.string()).default([]),
  status: CompanyStatusSchema.default("candidate"),
  /**
   * What the company can do — free strings, sector-specific.
   * e.g. ["interior painting", "exterior painting", "spray painting"]
   */
  capabilities: z.array(z.string()).default([]),
  /** Who they work for — universal enum. */
  serviceContexts: z.array(ServiceContextSchema).default([]),
  /**
   * What stands out — free strings.
   * e.g. ["heritage experience", "colour advice"]
   */
  differentiators: z.array(z.string()).default([]),
  /** Company website — harvest input; optional until discovered. */
  website_url: z.string().optional(),
  /** Short website summary (harvested or manual). Descriptive, not trust. */
  profileSnippet: z.string().optional(),
  profileSourceUrl: z.string().optional(),
  profileHarvestedAt: IsoDateSchema.optional(),
  profileProducer: ProducerSchema.optional(),
});
export type Company = z.infer<typeof CompanySchema>;

export const EvidenceSchema = z.object({
  ...baseMeta,
  title: z.string().min(1),
  url: z.string().optional(),
  snippet: z.string().optional(),
  observationIds: z.array(z.string().uuid()).default([]),
  sourceIds: z.array(z.string().uuid()).default([]),
  capturedAt: IsoDateSchema.optional(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const SignalKeySchema = z.enum([
  "registry",
  "longevity",
  "association",
  "infra",
  "locality",
  "certification",
  "other",
]);
export type SignalKey = z.infer<typeof SignalKeySchema>;

export const SignalSchema = z.object({
  ...baseMeta,
  key: SignalKeySchema,
  label: z.string().min(1),
  delta: z.number(),
  note: z.string().optional(),
  evidenceIds: z.array(z.string().uuid()).default([]),
  observationIds: z.array(z.string().uuid()).default([]),
  sourceId: z.string().uuid().optional(),
});
export type Signal = z.infer<typeof SignalSchema>;

export const ConfidenceProposalSchema = z.object({
  ...baseMeta,
  targetType: z.enum(["source", "hypothesis", "investigation"]),
  targetId: z.string().uuid(),
  suggested: z.number().min(0).max(100),
  explanation: z.string().min(1),
  signalIds: z.array(z.string().uuid()).default([]),
});
export type ConfidenceProposal = z.infer<typeof ConfidenceProposalSchema>;

export const ReviewActionSchema = z.enum(["agree", "disagree", "adjust"]);
export type ReviewAction = z.infer<typeof ReviewActionSchema>;

export const ReviewSchema = z.object({
  ...baseMeta,
  producer: z.literal("Human"),
  targetType: z.enum([
    "source",
    "company",
    "hypothesis",
    "confidence",
    "finding",
  ]),
  targetId: z.string().uuid(),
  action: ReviewActionSchema,
  originalScore: z.number().min(0).max(100).optional(),
  humanScore: z.number().min(0).max(100).optional(),
  reason: z.string().optional(),
  valueTags: z.array(z.string()).default([]),
  observationIds: z.array(z.string().uuid()).default([]),
  hypothesisIds: z.array(z.string().uuid()).default([]),
  evidenceIds: z.array(z.string().uuid()).default([]),
  version: z.number().int().positive().default(1),
  /** When set, this review is reacting to an OmegaClaw provisional proposal. */
  reactsToProducer: z.literal("OmegaClaw").optional(),
  /** Flipped when the next Ω run consumes this feedback. */
  fedBackToOmega: z.boolean().default(false),
});
export type Review = z.infer<typeof ReviewSchema>;

export const FindingStatusSchema = z.enum([
  "Validated",
  "Rejected",
  "NeedsMoreEvidence",
]);
export type FindingStatus = z.infer<typeof FindingStatusSchema>;

export const FindingSchema = z.object({
  ...baseMeta,
  producer: z.literal("Human"),
  summary: z.string().min(1),
  status: FindingStatusSchema,
  confidence: z.number().min(0).max(100).optional(),
  reviewIds: z.array(z.string().uuid()).default([]),
  observationIds: z.array(z.string().uuid()).default([]),
  hypothesisIds: z.array(z.string().uuid()).default([]),
  evidenceIds: z.array(z.string().uuid()).default([]),
  sourceIds: z.array(z.string().uuid()).default([]),
  companyIds: z.array(z.string().uuid()).default([]),
});
export type Finding = z.infer<typeof FindingSchema>;

export const InvestigationStatusSchema = z.enum([
  "Validated",
  "Rejected",
  "NeedsMoreEvidence",
  "InProgress",
]);
export type InvestigationStatus = z.infer<typeof InvestigationStatusSchema>;

export const InvestigationSchema = z.object({
  ...baseMeta,
  title: z.string().min(1),
  observationIds: z.array(z.string().uuid()).default([]),
  hypothesisIds: z.array(z.string().uuid()).default([]),
  evidenceIds: z.array(z.string().uuid()).default([]),
  sourceIds: z.array(z.string().uuid()).default([]),
  reviewIds: z.array(z.string().uuid()).default([]),
  findingIds: z.array(z.string().uuid()).default([]),
  outcome: z.string().optional(),
  confidence: z.number().min(0).max(100).optional(),
  status: InvestigationStatusSchema.default("InProgress"),
});
export type Investigation = z.infer<typeof InvestigationSchema>;

export const PatternSchema = z.object({
  id: z.string().uuid(),
  category: z.string().min(1),
  insight: z.string().min(1),
  investigationIds: z.array(z.string().uuid()).min(1),
  confidence: z.number().min(0).max(100).optional(),
  producer: ProducerSchema,
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  v: z.number().int().positive().default(1),
});
export type Pattern = z.infer<typeof PatternSchema>;

/** Minimum validated investigations required before promoting a pattern. */
export const PATTERN_MIN_INVESTIGATIONS = 5;

export const ExportBundleSchema = z.object({
  exportedAt: IsoDateSchema,
  mission: MissionSchema,
  investigations: z.array(InvestigationSchema),
  observations: z.array(ObservationSchema),
  evidence: z.array(EvidenceSchema),
  hypotheses: z.array(HypothesisSchema),
  sources: z.array(SourceSchema),
  missionSources: z.array(MissionSourceSchema).default([]),
  companies: z.array(CompanySchema),
  signals: z.array(SignalSchema),
  confidenceProposals: z.array(ConfidenceProposalSchema),
  reviews: z.array(ReviewSchema),
  findings: z.array(FindingSchema),
  patterns: z.array(PatternSchema),
  journal: z.array(JournalEntrySchema),
});
export type ExportBundle = z.infer<typeof ExportBundleSchema>;

export const CollectionNameSchema = z.enum([
  "missions",
  "journal",
  "observations",
  "hypotheses",
  "sources",
  "missionSources",
  "companies",
  "evidence",
  "signals",
  "confidenceProposals",
  "reviews",
  "findings",
  "investigations",
  "patterns",
]);
export type CollectionName = z.infer<typeof CollectionNameSchema>;

export * from "./agent-contracts";
export * from "./list-coverage";
export * from "./resolve-source-gaps";
export * from "./search-plan";
export * from "./capability-aliases";
export * from "./source-richness";
export * from "./coverage";
export * from "./access-barriers";
