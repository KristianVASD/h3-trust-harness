// scripts/vercel-api-entry.ts
import path5 from "node:path";
import { Hono as Hono2 } from "hono";

// packages/store/src/file-store.ts
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

// packages/schema/src/index.ts
import { z as z6 } from "zod";

// packages/schema/src/access-barriers.ts
import { z } from "zod";
var BarrierKindSchema = z.enum([
  "api-key-application",
  // apply via form/email to obtain a key
  "email-request",
  // email the org for the list / CSV
  "manual-lookup",
  // human looks up one item at a time (KvK single check)
  "login-wall",
  // member login required to see the list
  "captcha",
  // bot protection Ω must not solve
  "paid-tier",
  // data behind a paywall
  "pdf-download",
  // list is a PDF the human must fetch
  "rate-limited",
  // Ω hit a limit; human paces the calls
  "unknown"
]);
var BarrierSeveritySchema = z.enum([
  "blocks-extract",
  "partial",
  "soft"
]);
var BarrierScopeSchema = z.enum(["source", "company"]);
var BarrierStatusSchema = z.enum([
  "raised",
  "human-acknowledged",
  "human-fulfilled",
  "human-declined",
  "omega-retried"
]);
var BarrierFulfillmentSchema = z.object({
  kind: z.enum(["api-key", "manual-rows", "file-path", "note"]),
  api_key_ref: z.string().optional(),
  // a secrets-store ref, NOT the secret
  /** Human-originated company rows (e.g. names the human already knows). */
  manual_companies: z.array(
    z.object({
      name: z.string(),
      kvk_number: z.string().optional(),
      address: z.string().optional(),
      specialism: z.string().optional()
    })
  ).optional(),
  file_path: z.string().optional(),
  note: z.string().optional(),
  by: z.string()
  // the curator (provenance)
});
var AccessBarrierSchema = z.object({
  id: z.string().uuid(),
  scope: BarrierScopeSchema.default("source"),
  kind: BarrierKindSchema,
  severity: BarrierSeveritySchema,
  what_omega_needs: z.string(),
  // Ω's ask, plain language (dual-label: Ω)
  what_human_does: z.string(),
  // the concrete action for the human
  free_tier_available: z.boolean().default(false),
  estimated_effort: z.enum(["trivial", "minutes", "hours", "days"]).optional(),
  status: BarrierStatusSchema.default("raised"),
  raised_at: z.string().datetime(),
  fulfilled_at: z.string().datetime().optional(),
  fulfillment: BarrierFulfillmentSchema.optional()
});
function isBlockingBarrier(b) {
  return b.severity === "blocks-extract" && b.status !== "human-fulfilled" && b.status !== "human-declined";
}

// packages/schema/src/source-richness.ts
import { z as z2 } from "zod";
var SourceFieldKeySchema = z2.enum([
  "name",
  // 1 — company name (baseline; no names => not extractable)
  "website",
  // 2
  "address",
  // 3
  "phone",
  // 4
  "email",
  // 5
  "image",
  // 6 — logo / thumbnail
  "kvk",
  // chamber-of-commerce number (drives the hard kvk gate)
  "specialism",
  // extra output value the list row carries
  "tier"
  // quality label the list assigns (gold/silver/certified)
]);
var SOURCE_FIELD_KEYS = SourceFieldKeySchema.options;
var RICHNESS_WEIGHTS = {
  name: 15,
  website: 15,
  address: 10,
  phone: 10,
  email: 10,
  image: 5,
  kvk: 20,
  specialism: 10,
  tier: 5
};
var RICHNESS_FORMULA = "default.v1";
var RichnessSchema = z2.object({
  score: z2.number().min(0).max(100),
  present: z2.array(SourceFieldKeySchema),
  formula: z2.literal(RICHNESS_FORMULA)
});
function computeRichness(present) {
  const uniq = Array.from(new Set(present)).filter((f) => f in RICHNESS_WEIGHTS);
  const score = Math.min(
    100,
    uniq.reduce((sum, f) => sum + RICHNESS_WEIGHTS[f], 0)
  );
  return { score, present: uniq, formula: RICHNESS_FORMULA };
}
var ListPatternSchema = z2.enum([
  "table",
  "cards",
  "directory",
  "map",
  "json-api",
  "search-form",
  "unknown"
]);
var ExtractionGuideSchema = z2.object({
  listPattern: ListPatternSchema.default("unknown"),
  fields: z2.array(SourceFieldKeySchema).default([]),
  /** Optional CSS/XPath hints per field, if the probe could read them. */
  selectors: z2.record(SourceFieldKeySchema, z2.string()).optional(),
  pagination: z2.boolean().default(false),
  /** How the page scopes to the mission location (postcode box, dropdown…). */
  regionFilter: z2.string().optional(),
  notes: z2.string().optional()
});
var ProbeStatusSchema = z2.enum(["unprobed", "probed", "probe-failed"]);
function assertGuideSubsetOfFields(guideFields, sourceFields) {
  const have = new Set(sourceFields);
  const extra = guideFields.filter((f) => !have.has(f));
  if (extra.length > 0) {
    throw new Error(
      `extractionGuide.fields not a subset of sourceFields: ${extra.join(", ")}`
    );
  }
}

// packages/schema/src/search-plan.ts
import { z as z3 } from "zod";
var SearchPlanLayerSchema = z3.enum(["national", "regional", "local"]);
var SearchPlanEntrySchema = z3.object({
  layer: SearchPlanLayerSchema,
  /** Must match a Source.category value. */
  category: z3.string().min(1),
  /** Human-editable guidance for judging a source in this category × layer. */
  nuance_rule: z3.string().optional()
});
var SearchPlanSchema = z3.object({
  version: z3.string().min(1),
  label: z3.string().optional(),
  entries: z3.array(SearchPlanEntrySchema).min(1)
});
var DEFAULT_SEARCH_PLAN_VERSION = "default.v1";

// packages/schema/src/capability-aliases.ts
import { z as z4 } from "zod";
var CapabilityAliasesSchema = z4.object({
  version: z4.string().min(1),
  /** canonical → list of synonyms (case-insensitive match). */
  aliases: z4.record(z4.string(), z4.array(z4.string()))
});

// packages/schema/src/coverage.ts
import { z as z5 } from "zod";
var TARGET_COMPANIES = 5;
var READY_MIN_SCORE = 60;
var READY_MIN_SOURCES = 2;
var READY_MIN_COMPANIES = 3;
var COVERAGE_WEIGHTS = {
  planCoverage: 0.3,
  sourceDepth: 0.2,
  companyBreadth: 0.25,
  profileCompleteness: 0.15,
  kvkQuality: 0.1
};
var MissionCoverageSchema = z5.object({
  searchPlanCellsTotal: z5.number().int().min(0),
  searchPlanCellsFilled: z5.number().int().min(0),
  sourcesAccepted: z5.number().int().min(0),
  sourcesProbed: z5.number().int().min(0),
  sourcesWithGuide: z5.number().int().min(0),
  /** Accepted sources still blocked by an unfulfilled access barrier. */
  sourcesBlockedByBarrier: z5.number().int().min(0),
  companiesExtracted: z5.number().int().min(0),
  companiesWithProfile: z5.number().int().min(0),
  kvkPassRate: z5.number().min(0).max(1),
  completenessScore: z5.number().int().min(0).max(100),
  readyForSearch: z5.boolean(),
  readyReason: z5.string(),
  /** Per-component contribution — the "why" behind the score. */
  breakdown: z5.record(z5.string(), z5.number()).optional()
});
var ACCEPTED = /* @__PURE__ */ new Set(["accepted", "adjusted"]);
function computeMissionCoverage(args) {
  const { sources, companies, planEntries } = args;
  const accepted = sources.filter((s) => ACCEPTED.has(s.status));
  const planCells = new Set(planEntries.map((e) => `${e.layer}::${e.category}`));
  const filledCells = new Set(accepted.map((s) => `${s.scope}::${s.category}`));
  const searchPlanCellsTotal = planCells.size;
  let searchPlanCellsFilled = 0;
  for (const cell of filledCells) {
    if (planCells.has(cell)) searchPlanCellsFilled++;
  }
  const sourcesAccepted = accepted.length;
  const sourcesProbed = sources.filter((s) => s.probeStatus === "probed").length;
  const sourcesWithGuide = sources.filter((s) => s.extractionGuide != null).length;
  const sourcesBlockedByBarrier = accepted.filter(
    (s) => s.accessBarrier && isBlockingBarrier(s.accessBarrier)
  ).length;
  const companiesExtracted = companies.length;
  const companiesWithProfile = companies.filter(
    (c) => c.capabilities.length > 0 || (c.profileSnippet ?? "").length > 0
  ).length;
  const kvkPassRate = companiesExtracted === 0 ? 0 : companies.filter((c) => c.kvk_gate === "pass").length / companiesExtracted;
  const planCoverage = searchPlanCellsTotal === 0 ? 0 : searchPlanCellsFilled / searchPlanCellsTotal;
  const sourceDepth = sourcesAccepted === 0 ? 0 : sourcesWithGuide / sourcesAccepted;
  const companyBreadth = Math.min(companiesExtracted / TARGET_COMPANIES, 1);
  const profileCompleteness = companiesExtracted === 0 ? 0 : companiesWithProfile / companiesExtracted;
  const breakdown = {
    planCoverage: Math.round(100 * COVERAGE_WEIGHTS.planCoverage * planCoverage),
    sourceDepth: Math.round(100 * COVERAGE_WEIGHTS.sourceDepth * sourceDepth),
    companyBreadth: Math.round(
      100 * COVERAGE_WEIGHTS.companyBreadth * companyBreadth
    ),
    profileCompleteness: Math.round(
      100 * COVERAGE_WEIGHTS.profileCompleteness * profileCompleteness
    ),
    kvkQuality: Math.round(100 * COVERAGE_WEIGHTS.kvkQuality * kvkPassRate)
  };
  const completenessScore = Math.min(
    100,
    Object.values(breakdown).reduce((a, b) => a + b, 0)
  );
  const unmet = [];
  if (completenessScore < READY_MIN_SCORE) {
    unmet.push(`completeness ${completenessScore}<${READY_MIN_SCORE}`);
  }
  if (sourcesAccepted < READY_MIN_SOURCES) {
    unmet.push(
      `need \u2265${READY_MIN_SOURCES} accepted sources (have ${sourcesAccepted})`
    );
  }
  if (companiesExtracted < READY_MIN_COMPANIES) {
    unmet.push(
      `need \u2265${READY_MIN_COMPANIES} companies (have ${companiesExtracted})`
    );
  }
  if (sourcesBlockedByBarrier > 0) {
    unmet.push(
      `${sourcesBlockedByBarrier} accepted source(s) blocked by unfulfilled barrier`
    );
  }
  const readyForSearch = unmet.length === 0;
  return {
    searchPlanCellsTotal,
    searchPlanCellsFilled,
    sourcesAccepted,
    sourcesProbed,
    sourcesWithGuide,
    sourcesBlockedByBarrier,
    companiesExtracted,
    companiesWithProfile,
    kvkPassRate: Number(kvkPassRate.toFixed(3)),
    completenessScore,
    readyForSearch,
    readyReason: readyForSearch ? "ready" : unmet.join("; "),
    breakdown
  };
}

// packages/schema/src/index.ts
var ProducerSchema = z6.enum([
  "Human",
  "OmegaClaw",
  "ExternalAI",
  "ImportedDataset"
]);
var IsoDateSchema = z6.string().datetime({ offset: true }).or(z6.string().min(1));
var baseMeta = {
  id: z6.string().uuid(),
  missionId: z6.string().uuid(),
  producer: ProducerSchema,
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  v: z6.number().int().positive().default(1)
};
var MissionPhaseSchema = z6.enum([
  "observation",
  "hypothesis",
  "evidence",
  "cara",
  "patterns",
  "companies",
  "deep_check"
]);
var DiscoveryBriefSchema = z6.object({
  approach: z6.string().default(""),
  candidateListTypes: z6.array(z6.string()).default([]),
  successCriteria: z6.string().default(""),
  notes: z6.string().optional(),
  producer: ProducerSchema.optional(),
  updatedAt: IsoDateSchema.optional()
});
var MissionSchema = z6.object({
  id: z6.string().uuid(),
  location: z6.string().min(1),
  country: z6.string().min(1),
  sector: z6.string().min(1),
  subsector: z6.string().min(1),
  goal: z6.string().min(1),
  notes: z6.string().optional(),
  /**
   * Which shared search plan this mission uses (stem, e.g. "default.v1").
   * Lives outside writable/ so plans can evolve independently of missions.
   */
  search_plan_version: z6.string().min(1).default("default.v1"),
  discoveryBrief: DiscoveryBriefSchema.default({
    approach: "",
    candidateListTypes: [],
    successCriteria: ""
  }),
  phases: z6.array(
    z6.object({
      key: MissionPhaseSchema,
      status: z6.enum(["waiting", "active", "done"])
    })
  ),
  producer: ProducerSchema,
  /** How this mission entered the catalogue. */
  origin: z6.enum(["human", "search_demand"]).optional(),
  /** Worldwide Single Search hits for this place × trade. */
  demandCount: z6.number().int().nonnegative().optional(),
  lastSearchedAt: IsoDateSchema.optional(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  v: z6.number().int().positive().default(1)
});
var JournalEntrySchema = z6.object({
  ...baseMeta,
  kind: z6.enum(["note", "task", "journal"]),
  title: z6.string().min(1),
  body: z6.string(),
  done: z6.boolean().optional()
});
var ObservationSchema = z6.object({
  ...baseMeta,
  statement: z6.string().min(1),
  evidenceUrls: z6.array(z6.string()).default([]),
  evidenceIds: z6.array(z6.string().uuid()).default([]),
  tags: z6.array(z6.string()).default([])
  /** Facts only — no score, no verdict. */
});
var HypothesisStatusSchema = z6.enum([
  "Draft",
  "Testing",
  "Validated",
  "Rejected",
  "Archived"
]);
var HypothesisSchema = z6.object({
  ...baseMeta,
  statement: z6.string().min(1),
  status: HypothesisStatusSchema,
  observationIds: z6.array(z6.string().uuid()).default([]),
  rationale: z6.string().optional()
});
var SourceTypeSchema = z6.enum([
  "registry",
  "association",
  "directory",
  "website",
  "municipality",
  "news",
  "other"
]);
var SourceStatusSchema = z6.enum([
  /** Proposed by OmegaClaw or human — triage before evidence/CARA. */
  "candidate",
  "draft",
  "pending_review",
  "accepted",
  "adjusted",
  "rejected"
]);
var SourceScopeSchema = z6.enum(["national", "regional", "local"]);
var SourceCategorySchema = z6.enum([
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
  "municipal_initiative"
]);
var SOURCE_CATEGORIES = SourceCategorySchema.options;
var MembershipThresholdSchema = z6.preprocess((raw) => {
  if (typeof raw !== "string") return raw;
  const legacy = {
    laag: "low",
    midden: "medium",
    hoog: "high",
    onbekend: "unknown"
  };
  return legacy[raw] ?? raw;
}, z6.enum(["low", "medium", "high", "unknown"]));
var RealWorldPresenceSchema = z6.object({
  events: z6.boolean().optional(),
  news: z6.boolean().optional(),
  linkedin: z6.boolean().optional(),
  facebook: z6.boolean().optional(),
  notes: z6.string().optional()
});
var SourceEvidenceSchema = z6.object({
  checked_at: IsoDateSchema.optional(),
  url: z6.string().optional(),
  domain_age: z6.string().optional(),
  org_age: z6.string().optional(),
  host_info: z6.string().optional(),
  membership_threshold: MembershipThresholdSchema.optional(),
  content_consistency: z6.object({
    ok: z6.boolean(),
    note: z6.string().optional()
  }).optional(),
  real_world_presence: RealWorldPresenceSchema.optional(),
  summary_reasons: z6.array(z6.string()).default([])
});
var sourceObjectSchema = z6.object({
  id: z6.string().uuid(),
  producer: ProducerSchema,
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  v: z6.number().int().positive().default(1),
  /** Mission where this list was first catalogued (not ownership). */
  first_seen_mission: z6.string().uuid(),
  /** Other missions that linked this source (excludes first_seen_mission). */
  reused_in_missions: z6.array(z6.string().uuid()).default([]),
  name: z6.string().min(1),
  type: SourceTypeSchema,
  /** Migrates missing values to digital_presence on parse. */
  category: SourceCategorySchema.default("digital_presence"),
  /**
   * Reuse scope. Required on create; missing legacy rows default to regional
   * so they never silently match as national coverage.
   */
  scope: SourceScopeSchema.default("regional"),
  /** Region label for regional/local sources; ignored when scope is national. */
  region: z6.string().default(""),
  url: z6.string().optional(),
  reason: z6.string().optional(),
  suggestedWeight: z6.number().min(0).max(100).optional(),
  suggestedConfidence: z6.number().min(0).max(100).optional(),
  signalIds: z6.array(z6.string().uuid()).default([]),
  evidenceIds: z6.array(z6.string().uuid()).default([]),
  /** Structured proof OmegaClaw/human fills after triage — CARA reacts to this. */
  evidence: SourceEvidenceSchema.optional(),
  /** New proposals start as candidate; kept ones move to draft → CARA. */
  status: SourceStatusSchema.default("candidate"),
  notes: z6.string().optional(),
  /** What company-data fields this source holds (probe, Job 2). Drives richness. */
  sourceFields: z6.array(SourceFieldKeySchema).default([]),
  /** Explainable richness derived from sourceFields (default.v1). */
  richness: RichnessSchema.optional(),
  /** How to scrape this source — written by probe (Job 2), read by extract (Job 3). */
  extractionGuide: ExtractionGuideSchema.optional(),
  /** Probe lifecycle. New proposals are unprobed until Job 2 runs. */
  probeStatus: ProbeStatusSchema.default("unprobed"),
  /** Active access barrier Ω raised on this source (probe). Human resolves it. */
  accessBarrier: AccessBarrierSchema.optional(),
  /** Legacy owner field — stripped after migrate. */
  missionId: z6.string().uuid().optional()
});
var SourceSchema = z6.preprocess((raw) => {
  if (!raw || typeof raw !== "object") return raw;
  const o = { ...raw };
  if ((o.first_seen_mission == null || o.first_seen_mission === "") && typeof o.missionId === "string") {
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
var MissionSourceSchema = z6.object({
  id: z6.string().uuid(),
  mission_id: z6.string().uuid(),
  source_id: z6.string().uuid(),
  added_at: IsoDateSchema,
  producer: ProducerSchema,
  updatedAt: IsoDateSchema.optional(),
  v: z6.number().int().positive().default(1)
});
var KvkGateSchema = z6.enum(["pass", "fail", "unchecked"]);
var CompanyStatusSchema = z6.enum(["candidate", "target", "staged"]);
var ServiceContextSchema = z6.preprocess((raw) => {
  if (typeof raw !== "string") return raw;
  const legacy = {
    particulier: "private",
    vve: "hoa",
    gemeente: "municipal",
    commercieel: "commercial",
    industrieel: "industrial"
  };
  return legacy[raw] ?? raw;
}, z6.enum(["private", "hoa", "municipal", "commercial", "industrial"]));
var SERVICE_CONTEXTS = [
  "private",
  "hoa",
  "municipal",
  "commercial",
  "industrial"
];
var CompanySchema = z6.object({
  ...baseMeta,
  name: z6.string().min(1),
  address: z6.string().default(""),
  region: z6.string().default(""),
  sector: z6.string().default(""),
  /**
   * Navigation door for the UI (e.g. "painting"). Not a trust signal.
   * Distinct from mission/company `sector` and from Source.category.
   */
  category: z6.string().default(""),
  kvk_number: z6.string().optional(),
  /** Hard gate — not a weighted score. */
  kvk_gate: KvkGateSchema.default("unchecked"),
  /**
   * Per-company KvK single-lookup: Ω can suggest it, a human (or the free API later) runs it.
   * Modelled KvK-specific — not a generic per-company barrier engine.
   */
  kvk_manual_check: z6.object({
    requested: z6.boolean().default(false),
    suggested_by: z6.literal("OmegaClaw").optional(),
    checked_by: z6.string().optional(),
    result: z6.enum(["pass", "fail", "unknown"]).optional(),
    checked_at: z6.string().datetime().optional()
  }).optional(),
  /** Extra list-row value (specialism / trade focus). */
  specialism: z6.string().optional(),
  source_ids: z6.array(z6.string().uuid()).default([]),
  list_membership: z6.array(z6.string()).default([]),
  /** Empty = no hard exclusion. */
  blacklist_flags: z6.array(z6.string()).default([]),
  status: CompanyStatusSchema.default("candidate"),
  /**
   * What the company can do — free strings, sector-specific.
   * e.g. ["interior painting", "exterior painting", "spray painting"]
   */
  capabilities: z6.array(z6.string()).default([]),
  /** Who they work for — universal enum. */
  serviceContexts: z6.array(ServiceContextSchema).default([]),
  /**
   * What stands out — free strings.
   * e.g. ["heritage experience", "colour advice"]
   */
  differentiators: z6.array(z6.string()).default([]),
  /** Company website — harvest input; optional until discovered. */
  website_url: z6.string().optional(),
  /** Short website summary (harvested or manual). Descriptive, not trust. */
  profileSnippet: z6.string().optional(),
  profileSourceUrl: z6.string().optional(),
  profileHarvestedAt: IsoDateSchema.optional(),
  profileProducer: ProducerSchema.optional()
});
var EvidenceSchema = z6.object({
  ...baseMeta,
  title: z6.string().min(1),
  url: z6.string().optional(),
  snippet: z6.string().optional(),
  observationIds: z6.array(z6.string().uuid()).default([]),
  sourceIds: z6.array(z6.string().uuid()).default([]),
  capturedAt: IsoDateSchema.optional()
});
var SignalKeySchema = z6.enum([
  "registry",
  "longevity",
  "association",
  "infra",
  "locality",
  "certification",
  "other"
]);
var SignalSchema = z6.object({
  ...baseMeta,
  key: SignalKeySchema,
  label: z6.string().min(1),
  delta: z6.number(),
  note: z6.string().optional(),
  evidenceIds: z6.array(z6.string().uuid()).default([]),
  observationIds: z6.array(z6.string().uuid()).default([]),
  sourceId: z6.string().uuid().optional()
});
var ConfidenceProposalSchema = z6.object({
  ...baseMeta,
  targetType: z6.enum(["source", "hypothesis", "investigation"]),
  targetId: z6.string().uuid(),
  suggested: z6.number().min(0).max(100),
  explanation: z6.string().min(1),
  signalIds: z6.array(z6.string().uuid()).default([])
});
var ReviewActionSchema = z6.enum(["agree", "disagree", "adjust"]);
var ReviewSchema = z6.object({
  ...baseMeta,
  producer: z6.literal("Human"),
  targetType: z6.enum([
    "source",
    "company",
    "hypothesis",
    "confidence",
    "finding"
  ]),
  targetId: z6.string().uuid(),
  action: ReviewActionSchema,
  originalScore: z6.number().min(0).max(100).optional(),
  humanScore: z6.number().min(0).max(100).optional(),
  reason: z6.string().optional(),
  valueTags: z6.array(z6.string()).default([]),
  observationIds: z6.array(z6.string().uuid()).default([]),
  hypothesisIds: z6.array(z6.string().uuid()).default([]),
  evidenceIds: z6.array(z6.string().uuid()).default([]),
  version: z6.number().int().positive().default(1),
  /** When set, this review is reacting to an OmegaClaw provisional proposal. */
  reactsToProducer: z6.literal("OmegaClaw").optional(),
  /** Flipped when the next Ω run consumes this feedback. */
  fedBackToOmega: z6.boolean().default(false)
});
var FindingStatusSchema = z6.enum([
  "Validated",
  "Rejected",
  "NeedsMoreEvidence"
]);
var FindingSchema = z6.object({
  ...baseMeta,
  producer: z6.literal("Human"),
  summary: z6.string().min(1),
  status: FindingStatusSchema,
  confidence: z6.number().min(0).max(100).optional(),
  reviewIds: z6.array(z6.string().uuid()).default([]),
  observationIds: z6.array(z6.string().uuid()).default([]),
  hypothesisIds: z6.array(z6.string().uuid()).default([]),
  evidenceIds: z6.array(z6.string().uuid()).default([]),
  sourceIds: z6.array(z6.string().uuid()).default([]),
  companyIds: z6.array(z6.string().uuid()).default([])
});
var InvestigationStatusSchema = z6.enum([
  "Validated",
  "Rejected",
  "NeedsMoreEvidence",
  "InProgress"
]);
var InvestigationSchema = z6.object({
  ...baseMeta,
  title: z6.string().min(1),
  observationIds: z6.array(z6.string().uuid()).default([]),
  hypothesisIds: z6.array(z6.string().uuid()).default([]),
  evidenceIds: z6.array(z6.string().uuid()).default([]),
  sourceIds: z6.array(z6.string().uuid()).default([]),
  reviewIds: z6.array(z6.string().uuid()).default([]),
  findingIds: z6.array(z6.string().uuid()).default([]),
  outcome: z6.string().optional(),
  confidence: z6.number().min(0).max(100).optional(),
  status: InvestigationStatusSchema.default("InProgress")
});
var PatternSchema = z6.object({
  id: z6.string().uuid(),
  category: z6.string().min(1),
  insight: z6.string().min(1),
  investigationIds: z6.array(z6.string().uuid()).min(1),
  confidence: z6.number().min(0).max(100).optional(),
  producer: ProducerSchema,
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  v: z6.number().int().positive().default(1)
});
var ExportBundleSchema = z6.object({
  exportedAt: IsoDateSchema,
  mission: MissionSchema,
  investigations: z6.array(InvestigationSchema),
  observations: z6.array(ObservationSchema),
  evidence: z6.array(EvidenceSchema),
  hypotheses: z6.array(HypothesisSchema),
  sources: z6.array(SourceSchema),
  missionSources: z6.array(MissionSourceSchema).default([]),
  companies: z6.array(CompanySchema),
  signals: z6.array(SignalSchema),
  confidenceProposals: z6.array(ConfidenceProposalSchema),
  reviews: z6.array(ReviewSchema),
  findings: z6.array(FindingSchema),
  patterns: z6.array(PatternSchema),
  journal: z6.array(JournalEntrySchema)
});
var CollectionNameSchema = z6.enum([
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
  "patterns"
]);

// packages/store/src/file-store.ts
var schemas = {
  missions: MissionSchema,
  journal: JournalEntrySchema,
  observations: ObservationSchema,
  hypotheses: HypothesisSchema,
  sources: SourceSchema,
  missionSources: MissionSourceSchema,
  companies: CompanySchema,
  evidence: EvidenceSchema,
  signals: SignalSchema,
  confidenceProposals: ConfidenceProposalSchema,
  reviews: ReviewSchema,
  findings: FindingSchema,
  investigations: InvestigationSchema,
  patterns: PatternSchema
};
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function missionKey(item) {
  if (!item || typeof item !== "object") return null;
  const o = item;
  if (typeof o.missionId === "string") return o.missionId;
  if (typeof o.mission_id === "string") return o.mission_id;
  return null;
}
var FileStore = class {
  constructor(rootDir) {
    this.rootDir = rootDir;
  }
  dir(collection) {
    return path.join(this.rootDir, collection);
  }
  file(collection, id) {
    return path.join(this.dir(collection), `${id}.json`);
  }
  async ensureDir(collection) {
    await mkdir(this.dir(collection), { recursive: true });
  }
  async readAll(collection) {
    await this.ensureDir(collection);
    const files = await readdir(this.dir(collection));
    const items = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const raw = await readFile(path.join(this.dir(collection), file), "utf8");
      const parsed = schemas[collection].parse(JSON.parse(raw));
      items.push(parsed);
    }
    return items;
  }
  async listMissions() {
    const missions = await this.readAll("missions");
    return missions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async getMission(id) {
    return this.get("missions", id);
  }
  async upsertMission(mission) {
    return this.upsert("missions", mission);
  }
  async listByMission(collection, missionId) {
    if (collection === "sources") {
      await this.ensureMissionSourceLinks(missionId);
      return await this.listSourcesForMission(missionId);
    }
    const all = await this.readAll(collection);
    return all.filter((item) => missionKey(item) === missionId).sort((a, b) => {
      const au = "updatedAt" in a && typeof a.updatedAt === "string" ? a.updatedAt : "added_at" in a && typeof a.added_at === "string" ? a.added_at : "";
      const bu = "updatedAt" in b && typeof b.updatedAt === "string" ? b.updatedAt : "added_at" in b && typeof b.added_at === "string" ? b.added_at : "";
      return bu.localeCompare(au);
    });
  }
  async listSourcesForMission(missionId) {
    const links = (await this.readAll("missionSources")).filter(
      (l) => l.mission_id === missionId
    );
    const sources = [];
    for (const link of links) {
      const source = await this.get("sources", link.source_id);
      if (source) sources.push(source);
    }
    return sources.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  /** Lazy migrate: old owner-missionId sources get a MissionSource row. */
  async ensureMissionSourceLinks(missionId) {
    const existing = await this.readAll("missionSources");
    const linked = new Set(
      existing.filter((l) => l.mission_id === missionId).map((l) => l.source_id)
    );
    const allSources = await this.readAll("sources");
    for (const source of allSources) {
      const belongs = source.first_seen_mission === missionId || source.reused_in_missions.includes(missionId);
      if (!belongs || linked.has(source.id)) continue;
      const link = {
        id: randomUUID(),
        mission_id: missionId,
        source_id: source.id,
        added_at: source.createdAt,
        producer: "ImportedDataset",
        updatedAt: nowIso(),
        v: 1
      };
      await this.upsert("missionSources", link);
      linked.add(source.id);
    }
  }
  async get(collection, id) {
    CollectionNameSchema.parse(collection);
    try {
      const raw = await readFile(this.file(collection, id), "utf8");
      return schemas[collection].parse(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  async upsert(collection, entity) {
    await this.ensureDir(collection);
    const stamped = {
      ...entity,
      updatedAt: nowIso(),
      v: "v" in entity ? Number(entity.v) || 1 : 1
    };
    const parsed = schemas[collection].parse(stamped);
    await writeFile(
      this.file(collection, parsed.id),
      `${JSON.stringify(parsed, null, 2)}
`,
      "utf8"
    );
    return parsed;
  }
  async remove(collection, id) {
    try {
      await unlink(this.file(collection, id));
      return true;
    } catch {
      return false;
    }
  }
  async createSourceInMission(missionId, sourceInput) {
    const source = SourceSchema.parse({
      ...sourceInput,
      first_seen_mission: sourceInput.first_seen_mission ?? missionId,
      reused_in_missions: sourceInput.reused_in_missions ?? []
    });
    const saved = await this.upsert("sources", source);
    await this.ensureLink(missionId, saved.id, saved.producer, saved.createdAt);
    return saved;
  }
  async linkSourceToMission(missionId, sourceId, producer = "Human") {
    const source = await this.get("sources", sourceId);
    if (!source) {
      throw new Error(`Source not found: ${sourceId}`);
    }
    const existing = (await this.readAll("missionSources")).find(
      (l) => l.mission_id === missionId && l.source_id === sourceId
    );
    if (existing) {
      return { source, link: existing };
    }
    const link = await this.ensureLink(
      missionId,
      sourceId,
      producer,
      nowIso()
    );
    let next = source;
    if (source.first_seen_mission !== missionId) {
      const reused = new Set(source.reused_in_missions);
      reused.add(missionId);
      next = await this.upsert("sources", {
        ...source,
        reused_in_missions: [...reused]
      });
    }
    return { source: next, link };
  }
  /**
   * Scenario B/C warm-start: reuse CARA-confirmed lists that apply across
   * sectors (national registry etc.) or across the same location (local
   * associations). Sector-specific lists (branch_association, quality_mark,
   * sector_qualification) stay out — those remain gaps for the new sector.
   */
  async warmStartMissionSources(missionId, location) {
    const CROSS_SECTOR_NATIONAL = /* @__PURE__ */ new Set([
      "registry",
      "labor_market_presence",
      "internship_market",
      "digital_presence",
      "trade_fair"
    ]);
    const LOCATION_REUSABLE = /* @__PURE__ */ new Set([
      "local_business_association",
      "networking_group",
      "sponsorship",
      "municipal_initiative",
      "local_media",
      "labor_market_presence"
    ]);
    const loc = location.trim().toLowerCase();
    const all = await this.listAllSources();
    const linked = [];
    for (const source of all) {
      if (source.status !== "accepted" && source.status !== "adjusted") {
        continue;
      }
      let reuse = false;
      if (source.scope === "national") {
        reuse = CROSS_SECTOR_NATIONAL.has(source.category);
      } else if (source.scope === "regional" || source.scope === "local") {
        const region = (source.region ?? "").trim().toLowerCase();
        reuse = Boolean(loc) && region === loc && LOCATION_REUSABLE.has(source.category);
      }
      if (!reuse) continue;
      const { source: next } = await this.linkSourceToMission(
        missionId,
        source.id,
        "ImportedDataset"
      );
      linked.push(next);
    }
    return linked;
  }
  async ensureLink(missionId, sourceId, producer, addedAt) {
    const existing = (await this.readAll("missionSources")).find(
      (l) => l.mission_id === missionId && l.source_id === sourceId
    );
    if (existing) return existing;
    const link = {
      id: randomUUID(),
      mission_id: missionId,
      source_id: sourceId,
      added_at: addedAt,
      producer,
      updatedAt: nowIso(),
      v: 1
    };
    return this.upsert("missionSources", link);
  }
  async listAllSources() {
    const all = await this.readAll("sources");
    return all.sort((a, b) => a.name.localeCompare(b.name));
  }
  async listLinkableSources(excludeMissionId, q = "") {
    await this.ensureMissionSourceLinks(excludeMissionId);
    const linkedIds = new Set(
      (await this.readAll("missionSources")).filter((l) => l.mission_id === excludeMissionId).map((l) => l.source_id)
    );
    const needle = q.trim().toLowerCase();
    const all = await this.readAll("sources");
    return all.filter((s) => !linkedIds.has(s.id)).filter((s) => {
      if (!needle) return true;
      return s.name.toLowerCase().includes(needle) || s.category.toLowerCase().includes(needle) || (s.type?.toLowerCase().includes(needle) ?? false);
    }).sort((a, b) => a.name.localeCompare(b.name));
  }
  async deleteMission(missionId) {
    const mission = await this.getMission(missionId);
    if (!mission) return false;
    await this.ensureMissionSourceLinks(missionId);
    const investigationIds = new Set(
      (await this.listByMission("investigations", missionId)).map((i) => i.id)
    );
    const links = (await this.readAll("missionSources")).filter(
      (l) => l.mission_id === missionId
    );
    const linkedSourceIds = links.map((l) => l.source_id);
    const scoped = CollectionNameSchema.options.filter(
      (name) => name !== "missions" && name !== "patterns" && name !== "sources" && name !== "missionSources"
    );
    for (const collection of scoped) {
      const items = await this.listByMission(collection, missionId);
      for (const item of items) {
        await this.remove(collection, item.id);
      }
    }
    for (const link of links) {
      await this.remove("missionSources", link.id);
    }
    const remainingLinks = await this.readAll("missionSources");
    for (const sourceId of linkedSourceIds) {
      const still = remainingLinks.filter((l) => l.source_id === sourceId);
      if (still.length === 0) {
        await this.remove("sources", sourceId);
        continue;
      }
      const source = await this.get("sources", sourceId);
      if (!source) continue;
      let first = source.first_seen_mission;
      let reused = source.reused_in_missions.filter((m) => m !== missionId);
      if (first === missionId) {
        const ordered = [...still].sort(
          (a, b) => a.added_at.localeCompare(b.added_at)
        );
        first = ordered[0].mission_id;
        reused = ordered.slice(1).map((l) => l.mission_id);
      }
      await this.upsert("sources", {
        ...source,
        first_seen_mission: first,
        reused_in_missions: reused
      });
    }
    for (const pattern of await this.listPatterns()) {
      const kept = pattern.investigationIds.filter(
        (id) => !investigationIds.has(id)
      );
      if (kept.length === 0) {
        await this.remove("patterns", pattern.id);
      } else if (kept.length !== pattern.investigationIds.length) {
        await this.upsert("patterns", {
          ...pattern,
          investigationIds: kept
        });
      }
    }
    try {
      await unlink(path.join(this.rootDir, "export", `${missionId}.json`));
    } catch {
    }
    return this.remove("missions", missionId);
  }
  async listPatterns() {
    return this.readAll("patterns");
  }
  async exportBundle(missionId) {
    const mission = await this.getMission(missionId);
    if (!mission) {
      throw new Error(`Mission not found: ${missionId}`);
    }
    await this.ensureMissionSourceLinks(missionId);
    const [
      investigations,
      observations,
      evidence,
      hypotheses,
      sources,
      missionSources,
      companies,
      signals,
      confidenceProposals,
      reviews,
      findings,
      journal
    ] = await Promise.all([
      this.listByMission("investigations", missionId),
      this.listByMission("observations", missionId),
      this.listByMission("evidence", missionId),
      this.listByMission("hypotheses", missionId),
      this.listByMission("sources", missionId),
      this.listByMission("missionSources", missionId),
      this.listByMission("companies", missionId),
      this.listByMission("signals", missionId),
      this.listByMission("confidenceProposals", missionId),
      this.listByMission("reviews", missionId),
      this.listByMission("findings", missionId),
      this.listByMission("journal", missionId)
    ]);
    const investigationIds = new Set(investigations.map((i) => i.id));
    const patterns = (await this.listPatterns()).filter(
      (p) => p.investigationIds.some((id) => investigationIds.has(id))
    );
    const bundle = {
      exportedAt: nowIso(),
      mission,
      investigations,
      observations,
      evidence,
      hypotheses,
      sources,
      missionSources,
      companies,
      signals,
      confidenceProposals,
      reviews,
      findings,
      patterns,
      journal
    };
    return ExportBundleSchema.parse(bundle);
  }
};

// packages/store/src/postgres-store.ts
import { randomUUID as randomUUID2 } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// packages/store/src/schemas.ts
var entitySchemas = {
  missions: MissionSchema,
  journal: JournalEntrySchema,
  observations: ObservationSchema,
  hypotheses: HypothesisSchema,
  sources: SourceSchema,
  missionSources: MissionSourceSchema,
  companies: CompanySchema,
  evidence: EvidenceSchema,
  signals: SignalSchema,
  confidenceProposals: ConfidenceProposalSchema,
  reviews: ReviewSchema,
  findings: FindingSchema,
  investigations: InvestigationSchema,
  patterns: PatternSchema
};
function nowIso2() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function missionKey2(item) {
  if (!item || typeof item !== "object") return null;
  const o = item;
  if (typeof o.missionId === "string") return o.missionId;
  if (typeof o.mission_id === "string") return o.mission_id;
  return null;
}
function sortByUpdatedDesc(items) {
  return [...items].sort((a, b) => {
    const au = "updatedAt" in a && typeof a.updatedAt === "string" ? a.updatedAt : "added_at" in a && typeof a.added_at === "string" ? a.added_at : "";
    const bu = "updatedAt" in b && typeof b.updatedAt === "string" ? b.updatedAt : "added_at" in b && typeof b.added_at === "string" ? b.added_at : "";
    return bu.localeCompare(au);
  });
}

// packages/store/src/postgres-store.ts
var PostgresStore = class {
  db;
  constructor(options) {
    this.db = createClient(options.url, options.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  /** Expose client for auth/admin helpers on the server. */
  get client() {
    return this.db;
  }
  async readAll(collection) {
    const { data, error } = await this.db.from("entities").select("payload").eq("collection", collection);
    if (error) throw new Error(`entities list ${collection}: ${error.message}`);
    const items = [];
    for (const row of data ?? []) {
      const parsed = entitySchemas[collection].parse(row.payload);
      items.push(parsed);
    }
    return items;
  }
  async listMissions() {
    const missions = await this.readAll("missions");
    return missions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async getMission(id) {
    return this.get("missions", id);
  }
  async upsertMission(mission) {
    return this.upsert("missions", mission);
  }
  async listByMission(collection, missionId) {
    if (collection === "sources") {
      await this.ensureMissionSourceLinks(missionId);
      return await this.listSourcesForMission(missionId);
    }
    const { data, error } = await this.db.from("entities").select("payload").eq("collection", collection).eq("mission_id", missionId);
    if (error) {
      const all = await this.readAll(collection);
      return sortByUpdatedDesc(
        all.filter((item) => missionKey2(item) === missionId)
      );
    }
    if (!data || data.length === 0) {
      const all = await this.readAll(collection);
      const filtered = all.filter((item) => missionKey2(item) === missionId);
      if (filtered.length > 0) {
        return sortByUpdatedDesc(filtered);
      }
    }
    const items = [];
    for (const row of data ?? []) {
      const parsed = entitySchemas[collection].parse(row.payload);
      items.push(parsed);
    }
    return sortByUpdatedDesc(items);
  }
  async listSourcesForMission(missionId) {
    const links = (await this.readAll("missionSources")).filter(
      (l) => l.mission_id === missionId
    );
    const sources = [];
    for (const link of links) {
      const source = await this.get("sources", link.source_id);
      if (source) sources.push(source);
    }
    return sources.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async ensureMissionSourceLinks(missionId) {
    const existing = await this.readAll("missionSources");
    const linked = new Set(
      existing.filter((l) => l.mission_id === missionId).map((l) => l.source_id)
    );
    const allSources = await this.readAll("sources");
    for (const source of allSources) {
      const belongs = source.first_seen_mission === missionId || source.reused_in_missions.includes(missionId);
      if (!belongs || linked.has(source.id)) continue;
      const link = {
        id: randomUUID2(),
        mission_id: missionId,
        source_id: source.id,
        added_at: source.createdAt,
        producer: "ImportedDataset",
        updatedAt: nowIso2(),
        v: 1
      };
      await this.upsert("missionSources", link);
      linked.add(source.id);
    }
  }
  async get(collection, id) {
    CollectionNameSchema.parse(collection);
    const { data, error } = await this.db.from("entities").select("payload").eq("collection", collection).eq("id", id).maybeSingle();
    if (error) throw new Error(`entities get ${collection}/${id}: ${error.message}`);
    if (!data) return null;
    return entitySchemas[collection].parse(data.payload);
  }
  async upsert(collection, entity) {
    const stamped = {
      ...entity,
      updatedAt: nowIso2(),
      v: "v" in entity ? Number(entity.v) || 1 : 1
    };
    const parsed = entitySchemas[collection].parse(stamped);
    const mid = missionKey2(parsed);
    const updatedAt = "updatedAt" in parsed && typeof parsed.updatedAt === "string" ? parsed.updatedAt : nowIso2();
    const row = {
      collection,
      id: parsed.id,
      mission_id: mid,
      payload: parsed,
      updated_at: updatedAt,
      v: Number("v" in parsed && parsed.v || 1)
    };
    const { error } = await this.db.from("entities").upsert(row, {
      onConflict: "collection,id"
    });
    if (error) {
      throw new Error(`entities upsert ${collection}/${parsed.id}: ${error.message}`);
    }
    return parsed;
  }
  async remove(collection, id) {
    const { error, count } = await this.db.from("entities").delete({ count: "exact" }).eq("collection", collection).eq("id", id);
    if (error) throw new Error(`entities delete: ${error.message}`);
    return (count ?? 0) > 0;
  }
  async createSourceInMission(missionId, sourceInput) {
    const source = SourceSchema.parse({
      ...sourceInput,
      first_seen_mission: sourceInput.first_seen_mission ?? missionId,
      reused_in_missions: sourceInput.reused_in_missions ?? []
    });
    const saved = await this.upsert("sources", source);
    await this.ensureLink(missionId, saved.id, saved.producer, saved.createdAt);
    return saved;
  }
  async linkSourceToMission(missionId, sourceId, producer = "Human") {
    const source = await this.get("sources", sourceId);
    if (!source) {
      throw new Error(`Source not found: ${sourceId}`);
    }
    const existing = (await this.readAll("missionSources")).find(
      (l) => l.mission_id === missionId && l.source_id === sourceId
    );
    if (existing) {
      return { source, link: existing };
    }
    const link = await this.ensureLink(
      missionId,
      sourceId,
      producer,
      nowIso2()
    );
    let next = source;
    if (source.first_seen_mission !== missionId) {
      const reused = new Set(source.reused_in_missions);
      reused.add(missionId);
      next = await this.upsert("sources", {
        ...source,
        reused_in_missions: [...reused]
      });
    }
    return { source: next, link };
  }
  async warmStartMissionSources(missionId, location) {
    const CROSS_SECTOR_NATIONAL = /* @__PURE__ */ new Set([
      "registry",
      "labor_market_presence",
      "internship_market",
      "digital_presence",
      "trade_fair"
    ]);
    const LOCATION_REUSABLE = /* @__PURE__ */ new Set([
      "local_business_association",
      "networking_group",
      "sponsorship",
      "municipal_initiative",
      "local_media",
      "labor_market_presence"
    ]);
    const loc = location.trim().toLowerCase();
    const all = await this.listAllSources();
    const linked = [];
    for (const source of all) {
      if (source.status !== "accepted" && source.status !== "adjusted") {
        continue;
      }
      let reuse = false;
      if (source.scope === "national") {
        reuse = CROSS_SECTOR_NATIONAL.has(source.category);
      } else if (source.scope === "regional" || source.scope === "local") {
        const region = (source.region ?? "").trim().toLowerCase();
        reuse = Boolean(loc) && region === loc && LOCATION_REUSABLE.has(source.category);
      }
      if (!reuse) continue;
      const { source: next } = await this.linkSourceToMission(
        missionId,
        source.id,
        "ImportedDataset"
      );
      linked.push(next);
    }
    return linked;
  }
  async ensureLink(missionId, sourceId, producer, addedAt) {
    const existing = (await this.readAll("missionSources")).find(
      (l) => l.mission_id === missionId && l.source_id === sourceId
    );
    if (existing) return existing;
    const link = {
      id: randomUUID2(),
      mission_id: missionId,
      source_id: sourceId,
      added_at: addedAt,
      producer,
      updatedAt: nowIso2(),
      v: 1
    };
    return this.upsert("missionSources", link);
  }
  async listAllSources() {
    const all = await this.readAll("sources");
    return all.sort((a, b) => a.name.localeCompare(b.name));
  }
  async listLinkableSources(excludeMissionId, q = "") {
    await this.ensureMissionSourceLinks(excludeMissionId);
    const linkedIds = new Set(
      (await this.readAll("missionSources")).filter((l) => l.mission_id === excludeMissionId).map((l) => l.source_id)
    );
    const needle = q.trim().toLowerCase();
    const all = await this.readAll("sources");
    return all.filter((s) => !linkedIds.has(s.id)).filter((s) => {
      if (!needle) return true;
      return s.name.toLowerCase().includes(needle) || s.category.toLowerCase().includes(needle) || (s.type?.toLowerCase().includes(needle) ?? false);
    }).sort((a, b) => a.name.localeCompare(b.name));
  }
  async deleteMission(missionId) {
    const mission = await this.getMission(missionId);
    if (!mission) return false;
    await this.ensureMissionSourceLinks(missionId);
    const investigationIds = new Set(
      (await this.listByMission("investigations", missionId)).map((i) => i.id)
    );
    const links = (await this.readAll("missionSources")).filter(
      (l) => l.mission_id === missionId
    );
    const linkedSourceIds = links.map((l) => l.source_id);
    const scoped = CollectionNameSchema.options.filter(
      (name) => name !== "missions" && name !== "patterns" && name !== "sources" && name !== "missionSources"
    );
    for (const collection of scoped) {
      const items = await this.listByMission(collection, missionId);
      for (const item of items) {
        await this.remove(collection, item.id);
      }
    }
    for (const link of links) {
      await this.remove("missionSources", link.id);
    }
    const remainingLinks = await this.readAll("missionSources");
    for (const sourceId of linkedSourceIds) {
      const still = remainingLinks.filter((l) => l.source_id === sourceId);
      if (still.length === 0) {
        await this.remove("sources", sourceId);
        continue;
      }
      const source = await this.get("sources", sourceId);
      if (!source) continue;
      let first = source.first_seen_mission;
      let reused = source.reused_in_missions.filter((m) => m !== missionId);
      if (first === missionId) {
        const ordered = [...still].sort(
          (a, b) => a.added_at.localeCompare(b.added_at)
        );
        first = ordered[0].mission_id;
        reused = ordered.slice(1).map((l) => l.mission_id);
      }
      await this.upsert("sources", {
        ...source,
        first_seen_mission: first,
        reused_in_missions: reused
      });
    }
    for (const pattern of await this.listPatterns()) {
      const kept = pattern.investigationIds.filter(
        (id) => !investigationIds.has(id)
      );
      if (kept.length === 0) {
        await this.remove("patterns", pattern.id);
      } else if (kept.length !== pattern.investigationIds.length) {
        await this.upsert("patterns", {
          ...pattern,
          investigationIds: kept
        });
      }
    }
    return this.remove("missions", missionId);
  }
  async listPatterns() {
    return this.readAll("patterns");
  }
  async exportBundle(missionId) {
    const mission = await this.getMission(missionId);
    if (!mission) {
      throw new Error(`Mission not found: ${missionId}`);
    }
    await this.ensureMissionSourceLinks(missionId);
    const [
      investigations,
      observations,
      evidence,
      hypotheses,
      sources,
      missionSources,
      companies,
      signals,
      confidenceProposals,
      reviews,
      findings,
      journal
    ] = await Promise.all([
      this.listByMission("investigations", missionId),
      this.listByMission("observations", missionId),
      this.listByMission("evidence", missionId),
      this.listByMission("hypotheses", missionId),
      this.listByMission("sources", missionId),
      this.listByMission("missionSources", missionId),
      this.listByMission("companies", missionId),
      this.listByMission("signals", missionId),
      this.listByMission("confidenceProposals", missionId),
      this.listByMission("reviews", missionId),
      this.listByMission("findings", missionId),
      this.listByMission("journal", missionId)
    ]);
    const investigationIds = new Set(investigations.map((i) => i.id));
    const patterns = (await this.listPatterns()).filter(
      (p) => p.investigationIds.some((id) => investigationIds.has(id))
    );
    const bundle = {
      exportedAt: nowIso2(),
      mission,
      investigations,
      observations,
      evidence,
      hypotheses,
      sources,
      missionSources,
      companies,
      signals,
      confidenceProposals,
      reviews,
      findings,
      patterns,
      journal
    };
    return ExportBundleSchema.parse(bundle);
  }
};

// packages/store/src/create-store.ts
import path2 from "node:path";
function resolveStoreDriver(explicit) {
  const raw = (explicit ?? process.env.STORE_DRIVER ?? "file").toLowerCase();
  if (raw === "postgres" || raw === "supabase") return "postgres";
  return "file";
}
function createStore(options = {}) {
  const driver = resolveStoreDriver(options.driver);
  if (driver === "postgres") {
    const url = options.postgres?.url ?? process.env.SUPABASE_URL ?? "";
    const serviceRoleKey = options.postgres?.serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    if (!url || !serviceRoleKey) {
      throw new Error(
        "STORE_DRIVER=postgres requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
      );
    }
    return new PostgresStore({ url, serviceRoleKey });
  }
  const root = options.writableRoot ?? process.env.WRITABLE_ROOT ?? path2.resolve(process.cwd(), "writable");
  return new FileStore(root);
}

// apps/server/src/app.ts
import { randomUUID as randomUUID5 } from "node:crypto";
import { readdir as readdir2, readFile as readFile3, mkdir as mkdir2, writeFile as writeFile2 } from "node:fs/promises";
import path4 from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { getCookie, setCookie } from "hono/cookie";

// packages/schema/src/omega-commands.ts
import { z as z7 } from "zod";
var OmegaCommandSchema = z7.enum([
  "discover",
  "probe",
  "extract",
  "harvest",
  "refresh"
]);
var OmegaProducerSchema = z7.literal("OmegaClaw");
var MissionContextSchema = z7.object({
  country: z7.string(),
  location: z7.string(),
  sector: z7.string(),
  subsector: z7.string(),
  goal: z7.string()
});
var DiscoverGapSchema = z7.object({
  layer: SourceScopeSchema,
  category: SourceCategorySchema,
  nuance_rule: z7.string().optional()
});
var RecentFeedbackSchema = z7.object({
  decision: z7.enum(["agree", "adjust", "disagree"]),
  reason: z7.string().optional()
});
var DiscoverInputSchema = z7.object({
  missionId: z7.string().uuid(),
  gap: DiscoverGapSchema,
  context: MissionContextSchema,
  existingSourceNames: z7.array(z7.string()).default([]),
  recentFeedback: z7.array(RecentFeedbackSchema).default([])
});
var DiscoverCandidateSchema = z7.object({
  found: z7.boolean(),
  name: z7.string().optional(),
  type: SourceTypeSchema.optional(),
  category: SourceCategorySchema.optional(),
  scope: SourceScopeSchema.optional(),
  region: z7.string().optional(),
  url: z7.string().optional(),
  reason: z7.string().optional(),
  suggestedWeight: z7.number().min(0).max(100).optional(),
  suggestedConfidence: z7.number().min(0).max(100).optional(),
  confidence_in_existence: z7.enum(["high", "medium", "low"]).optional()
});
var DiscoverOutputSchema = z7.object({
  producer: OmegaProducerSchema,
  missionId: z7.string().uuid(),
  candidates: z7.array(DiscoverCandidateSchema).default([])
});
var ProbeInputSchema = z7.object({
  missionId: z7.string().uuid(),
  sourceId: z7.string().uuid(),
  url: z7.string().optional(),
  category: SourceCategorySchema,
  nuance_rule: z7.string().optional(),
  context: MissionContextSchema,
  fieldUniverse: z7.array(SourceFieldKeySchema)
});
var ProbeOutputSchema = z7.object({
  producer: OmegaProducerSchema,
  missionId: z7.string().uuid(),
  sourceId: z7.string().uuid(),
  sourceFields: z7.array(SourceFieldKeySchema).default([]),
  richness: RichnessSchema,
  extractionGuide: ExtractionGuideSchema,
  suggestedConfidence: z7.number().min(0).max(100).optional(),
  evidence: SourceEvidenceSchema,
  /** Ω raises this when the list needs a human to unlock. Harness stores it on the Source. */
  accessBarrier: AccessBarrierSchema.optional()
});
var ExtractSourceRefSchema = z7.object({
  id: z7.string().uuid(),
  url: z7.string().optional(),
  sourceFields: z7.array(SourceFieldKeySchema).default([]),
  extractionGuide: ExtractionGuideSchema
});
var ExtractInputSchema = z7.object({
  missionId: z7.string().uuid(),
  sources: z7.array(ExtractSourceRefSchema),
  context: MissionContextSchema,
  existingCompanyNames: z7.array(z7.string()).default([]),
  kvkFormat: z7.string().optional()
});
var ExtractCompanySchema = z7.object({
  name: z7.string(),
  address: z7.string().optional(),
  region: z7.string().optional(),
  kvk_number: z7.string().optional(),
  kvk_gate: KvkGateSchema.default("unchecked"),
  source_ids: z7.array(z7.string().uuid()).default([]),
  list_membership: z7.array(z7.string()).default([]),
  fieldsExtracted: z7.array(SourceFieldKeySchema).default([]),
  specialism: z7.string().optional(),
  tier: z7.string().optional(),
  image: z7.string().optional()
});
var ExtractOutputSchema = z7.object({
  producer: OmegaProducerSchema,
  missionId: z7.string().uuid(),
  companies: z7.array(ExtractCompanySchema).default([]),
  discoveryNotes: z7.string().optional()
});
var HarvestInputSchema = z7.object({
  missionId: z7.string().uuid(),
  companyId: z7.string().uuid(),
  name: z7.string(),
  website_url: z7.string().optional(),
  capability_aliases: z7.record(z7.string(), z7.array(z7.string())).default({}),
  service_contexts_allowed: z7.array(ServiceContextSchema).default([])
});
var WebpageTrustProbeSchema = z7.object({
  domain_age: z7.string().optional(),
  has_real_address: z7.boolean().optional(),
  has_contact: z7.boolean().optional(),
  notes: z7.string().optional()
});
var HarvestOutputSchema = z7.object({
  producer: OmegaProducerSchema,
  missionId: z7.string().uuid(),
  companyId: z7.string().uuid(),
  capabilities: z7.array(z7.string()).default([]),
  serviceContexts: z7.array(ServiceContextSchema).default([]),
  differentiators: z7.array(z7.string()).default([]),
  profileSnippet: z7.string(),
  harvest_confidence: z7.enum(["high", "medium", "low"]).optional(),
  webpageTrustProbe: WebpageTrustProbeSchema.optional()
});
var RefreshInputSchema = z7.object({
  missionId: z7.string().uuid(),
  check_type: z7.enum(["full_mission", "single_company"]).default("full_mission"),
  context: MissionContextSchema,
  last_full_check: z7.string().optional()
});
var RefreshOutputSchema = z7.object({
  producer: OmegaProducerSchema,
  missionId: z7.string().uuid(),
  checked_at: z7.string(),
  companies_added: z7.array(ExtractCompanySchema).default([]),
  companies_removed: z7.array(z7.string()).default([]),
  source_changes: z7.array(z7.string()).default([]),
  overall_status: z7.enum(["no_changes", "minor_changes", "major_changes"]).default("no_changes")
});
var OMEGA_CONTRACTS = {
  discover: { input: DiscoverInputSchema, output: DiscoverOutputSchema },
  probe: { input: ProbeInputSchema, output: ProbeOutputSchema },
  extract: { input: ExtractInputSchema, output: ExtractOutputSchema },
  harvest: { input: HarvestInputSchema, output: HarvestOutputSchema },
  refresh: { input: RefreshInputSchema, output: RefreshOutputSchema }
};

// node_modules/.pnpm/uuid@11.1.1/node_modules/uuid/dist/esm/stringify.js
var byteToHex = [];
for (let i = 0; i < 256; ++i) {
  byteToHex.push((i + 256).toString(16).slice(1));
}
function unsafeStringify(arr, offset = 0) {
  return (byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + "-" + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + "-" + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + "-" + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + "-" + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]]).toLowerCase();
}

// node_modules/.pnpm/uuid@11.1.1/node_modules/uuid/dist/esm/rng.js
import { randomFillSync } from "crypto";
var rnds8Pool = new Uint8Array(256);
var poolPtr = rnds8Pool.length;
function rng() {
  if (poolPtr > rnds8Pool.length - 16) {
    randomFillSync(rnds8Pool);
    poolPtr = 0;
  }
  return rnds8Pool.slice(poolPtr, poolPtr += 16);
}

// node_modules/.pnpm/uuid@11.1.1/node_modules/uuid/dist/esm/native.js
import { randomUUID as randomUUID3 } from "crypto";
var native_default = { randomUUID: randomUUID3 };

// node_modules/.pnpm/uuid@11.1.1/node_modules/uuid/dist/esm/v4.js
function v4(options, buf, offset) {
  if (native_default.randomUUID && !buf && !options) {
    return native_default.randomUUID();
  }
  options = options || {};
  const rnds = options.random ?? options.rng?.() ?? rng();
  if (rnds.length < 16) {
    throw new Error("Random bytes length must be >= 16");
  }
  rnds[6] = rnds[6] & 15 | 64;
  rnds[8] = rnds[8] & 63 | 128;
  if (buf) {
    offset = offset || 0;
    if (offset < 0 || offset + 16 > buf.length) {
      throw new RangeError(`UUID byte range ${offset}:${offset + 15} is out of buffer bounds`);
    }
    for (let i = 0; i < 16; ++i) {
      buf[offset + i] = rnds[i];
    }
    return buf;
  }
  return unsafeStringify(rnds);
}
var v4_default = v4;

// apps/server/src/omega/adapter.ts
function nowIso3() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function mirrorStamp(output) {
  return { ...output, producer: "OmegaClaw" };
}
function buildDiscoverSourceRecords(output, missionId) {
  const now = nowIso3();
  const sources = [];
  const skipped = [];
  for (const candidate of output.candidates) {
    if (!candidate.found || !candidate.name?.trim()) {
      skipped.push({
        reason: candidate.reason?.trim() || "OmegaClaw reported no findable source for this gap.",
        candidate
      });
      continue;
    }
    const summaryReasons = [
      candidate.reason?.trim(),
      candidate.confidence_in_existence ? `? Existence confidence: ${candidate.confidence_in_existence}` : null
    ].filter((r) => Boolean(r));
    sources.push({
      id: v4_default(),
      producer: "OmegaClaw",
      createdAt: now,
      updatedAt: now,
      v: 1,
      first_seen_mission: missionId,
      reused_in_missions: [],
      name: candidate.name.trim(),
      type: candidate.type ?? "directory",
      category: candidate.category ?? "digital_presence",
      scope: candidate.scope ?? "regional",
      region: candidate.region ?? "",
      url: candidate.url,
      reason: candidate.reason,
      suggestedWeight: candidate.suggestedWeight,
      suggestedConfidence: candidate.suggestedConfidence,
      signalIds: [],
      evidenceIds: [],
      evidence: {
        checked_at: now,
        url: candidate.url,
        summary_reasons: summaryReasons.length ? summaryReasons : ["\u03A9 provisional candidate \u2014 awaiting probe"]
      },
      status: "candidate",
      notes: "Provisional \u03A9 proposal \u2014 probe before CURAD align.",
      sourceFields: [],
      probeStatus: "unprobed"
    });
  }
  return { sources, skipped };
}
function buildProbeSourcePatch(probe) {
  assertGuideSubsetOfFields(probe.extractionGuide.fields, probe.sourceFields);
  return {
    sourceFields: probe.sourceFields,
    richness: probe.richness,
    extractionGuide: probe.extractionGuide,
    probeStatus: "probed",
    suggestedConfidence: probe.suggestedConfidence,
    evidence: probe.evidence,
    producer: "OmegaClaw",
    updatedAt: nowIso3(),
    ...probe.accessBarrier ? { accessBarrier: probe.accessBarrier } : {}
  };
}
function buildHarvestCompanyPatch(harvest, opts) {
  return {
    capabilities: harvest.capabilities,
    serviceContexts: harvest.serviceContexts,
    differentiators: harvest.differentiators,
    profileSnippet: harvest.profileSnippet,
    ...opts?.profileSourceUrl ? { profileSourceUrl: opts.profileSourceUrl } : {},
    profileHarvestedAt: nowIso3(),
    profileProducer: "OmegaClaw",
    updatedAt: nowIso3()
  };
}
async function runExtractGated(input, missionSources) {
  const byId = new Map(missionSources.map((s) => [s.id, s]));
  const unlocked = [];
  const blocked = [];
  for (const ref of input.sources) {
    const src = byId.get(ref.id);
    const barrier = src?.accessBarrier;
    if (barrier && isBlockingBarrier(barrier)) {
      blocked.push({
        sourceId: ref.id,
        barrierId: barrier.id,
        kind: barrier.kind,
        what_human_does: barrier.what_human_does
      });
      continue;
    }
    unlocked.push(ref);
  }
  const output = unlocked.length ? await runOcCommand("extract", { ...input, sources: unlocked }) : mirrorStamp({
    producer: "OmegaClaw",
    missionId: input.missionId,
    companies: [],
    discoveryNotes: "all sources blocked by barriers"
  });
  return { ...output, blocked };
}
async function storeSecretRef(_ref) {
}
function buildFulfilledBarrier(barrier, fulfillment) {
  return {
    ...barrier,
    status: "human-fulfilled",
    fulfilled_at: nowIso3(),
    fulfillment
  };
}
function buildDeclinedBarrier(barrier, reason, by) {
  return {
    ...barrier,
    status: "human-declined",
    fulfilled_at: nowIso3(),
    fulfillment: {
      kind: "note",
      note: reason,
      by
    }
  };
}
function buildHumanCompaniesFromFulfillment(args) {
  if (args.fulfillment.kind !== "manual-rows" || !args.fulfillment.manual_companies?.length) {
    return [];
  }
  const now = nowIso3();
  const src = args.source;
  return args.fulfillment.manual_companies.map((m) => ({
    id: v4_default(),
    missionId: args.missionId,
    producer: "Human",
    createdAt: now,
    updatedAt: now,
    v: 1,
    name: m.name,
    address: m.address ?? "",
    region: src.region || "",
    sector: src.category,
    category: src.category,
    kvk_number: m.kvk_number,
    kvk_gate: m.kvk_number ? "pass" : "unchecked",
    source_ids: [src.id],
    list_membership: [src.name],
    specialism: m.specialism,
    blacklist_flags: [],
    status: "candidate",
    capabilities: [],
    serviceContexts: [],
    differentiators: []
  }));
}
function buildExtractCompanyRecords(output, missionId, source) {
  const now = nowIso3();
  return output.companies.map((c) => ({
    id: v4_default(),
    missionId,
    producer: "OmegaClaw",
    createdAt: now,
    updatedAt: now,
    v: 1,
    name: c.name,
    address: c.address ?? "",
    region: c.region ?? "",
    sector: source?.category ?? "",
    category: source?.category ?? "",
    kvk_number: c.kvk_number,
    kvk_gate: c.kvk_gate,
    source_ids: c.source_ids.length ? c.source_ids : source ? [source.id] : [],
    list_membership: c.list_membership.length ? c.list_membership : source ? [source.name] : [],
    specialism: c.specialism,
    blacklist_flags: [],
    status: "candidate",
    capabilities: [],
    serviceContexts: [],
    differentiators: []
  }));
}
function looksLikeKvkSource(input) {
  const url = (input.url ?? "").toLowerCase();
  return url.includes("kvk") || input.category === "registry";
}
function stubKvkBarrier() {
  return {
    id: v4_default(),
    scope: "source",
    kind: "manual-lookup",
    severity: "blocks-extract",
    free_tier_available: true,
    estimated_effort: "minutes",
    what_omega_needs: "I cannot bulk-pull the KvK register \u2014 only verify one number at a time, and the free single-lookup needs a key I don't have.",
    what_human_does: "Apply for the free KvK single-lookup key and paste the ref, OR paste company names you already know and I'll verify each.",
    status: "raised",
    raised_at: nowIso3()
  };
}
function stubDiscover(input) {
  const { gap, context, existingSourceNames } = input;
  const stubName = `\u03A9 Stub ${gap.category} \xB7 ${gap.layer}`;
  if (existingSourceNames.some((n) => n.toLowerCase() === stubName.toLowerCase())) {
    return mirrorStamp({
      producer: "OmegaClaw",
      missionId: input.missionId,
      candidates: [
        {
          found: false,
          reason: `Already have a stub for ${gap.category} @ ${gap.layer}`
        }
      ]
    });
  }
  return mirrorStamp({
    producer: "OmegaClaw",
    missionId: input.missionId,
    candidates: [
      {
        found: true,
        name: stubName,
        type: "association",
        category: gap.category,
        scope: gap.layer,
        region: gap.layer === "national" ? "" : context.location,
        url: `https://example.stub/${gap.category}`,
        reason: `Stub discover for ${gap.category} @ ${gap.layer}. ${gap.nuance_rule ?? ""}`.trim(),
        suggestedWeight: 55,
        suggestedConfidence: 60,
        confidence_in_existence: "medium"
      }
    ]
  });
}
function stubProbe(input) {
  const fields = [
    "name",
    "website",
    "address",
    "phone",
    "kvk"
  ].filter(
    (f) => input.fieldUniverse.includes(f)
  );
  const sourceFields = fields.length > 0 ? fields : ["name", "website", "address"];
  const extractionFields = sourceFields.slice();
  assertGuideSubsetOfFields(extractionFields, sourceFields);
  const richness = computeRichness(sourceFields);
  const raiseBarrier = looksLikeKvkSource(input);
  return mirrorStamp({
    producer: "OmegaClaw",
    missionId: input.missionId,
    sourceId: input.sourceId,
    sourceFields,
    richness,
    extractionGuide: {
      listPattern: raiseBarrier ? "search-form" : "directory",
      fields: extractionFields,
      pagination: !raiseBarrier,
      regionFilter: input.context.location,
      notes: `Stub probe against ${input.url ?? "(no url)"} \xB7 category ${input.category}`
    },
    suggestedConfidence: Math.min(95, richness.score + 10),
    evidence: {
      checked_at: nowIso3(),
      url: input.url,
      summary_reasons: [
        "\u2713 Stub probe \u2014 shape inferred without live fetch",
        `? Richness ${richness.score} (${richness.present.join("+")})`,
        ...raiseBarrier ? ["\u26A0 Access barrier raised \u2014 human must unlock before extract"] : []
      ]
    },
    ...raiseBarrier ? { accessBarrier: stubKvkBarrier() } : {}
  });
}
function stubExtract(input) {
  const companies = input.sources.flatMap((src, i) => {
    const guideFields = src.extractionGuide.fields;
    assertGuideSubsetOfFields(
      guideFields,
      src.sourceFields.length ? src.sourceFields : guideFields
    );
    const baseName = `\u03A9 Stub Co ${i + 1} \xB7 ${input.context.location}`;
    if (input.existingCompanyNames.includes(baseName)) return [];
    const hasKvk = guideFields.includes("kvk");
    return [
      {
        name: baseName,
        address: `${100 + i} Stubstraat, ${input.context.location}`,
        region: input.context.location,
        kvk_number: hasKvk ? `1234567${i}` : void 0,
        kvk_gate: hasKvk ? "pass" : "unchecked",
        source_ids: [src.id],
        list_membership: [src.id],
        fieldsExtracted: guideFields,
        specialism: guideFields.includes("specialism") ? "interior painting" : void 0,
        tier: guideFields.includes("tier") ? "silver" : void 0
      }
    ];
  });
  return mirrorStamp({
    producer: "OmegaClaw",
    missionId: input.missionId,
    companies,
    discoveryNotes: "Stub extract \u2014 used extractionGuide.fields only."
  });
}
function stubHarvest(input) {
  const allowed = input.service_contexts_allowed.length > 0 ? input.service_contexts_allowed : ["private", "hoa"];
  const hasUrl = Boolean(input.website_url?.trim());
  if (!hasUrl) {
    return mirrorStamp({
      producer: "OmegaClaw",
      missionId: input.missionId,
      companyId: input.companyId,
      capabilities: [],
      serviceContexts: [],
      differentiators: [],
      profileSnippet: `${input.name} \u2014 no website on file; profile is name-only.`,
      harvest_confidence: "low",
      webpageTrustProbe: {
        notes: "v2: traditional webpage trust probe not wired"
      }
    });
  }
  return mirrorStamp({
    producer: "OmegaClaw",
    missionId: input.missionId,
    companyId: input.companyId,
    capabilities: ["interior painting", "exterior painting"],
    serviceContexts: [...allowed].slice(0, 2),
    differentiators: ["stub local presence", "colour advice"],
    profileSnippet: `Stub harvest for ${input.name} (${input.website_url}). Residential painters in ${input.missionId.slice(0, 8)}.`,
    harvest_confidence: "medium",
    webpageTrustProbe: {
      notes: "v2: traditional webpage trust probe not wired"
    }
  });
}
function stubRefresh(input) {
  return mirrorStamp({
    producer: "OmegaClaw",
    missionId: input.missionId,
    checked_at: nowIso3(),
    companies_added: [],
    companies_removed: [],
    source_changes: [],
    overall_status: "no_changes"
  });
}
var stubImpl = {
  discover: stubDiscover,
  probe: stubProbe,
  extract: stubExtract,
  harvest: stubHarvest,
  refresh: stubRefresh
};
async function runOcCommand(command, rawInput) {
  const contract = OMEGA_CONTRACTS[command];
  const input = contract.input.parse(rawInput);
  const rawOut = stubImpl[command](input);
  if (command === "probe") {
    const probe = rawOut;
    assertGuideSubsetOfFields(probe.extractionGuide.fields, probe.sourceFields);
  }
  if (command === "extract") {
    const extract = rawOut;
    const inputExtract = input;
    const allowed = new Set(
      inputExtract.sources.flatMap((s) => s.extractionGuide.fields)
    );
    for (const co of extract.companies) {
      const extra = co.fieldsExtracted.filter((f) => !allowed.has(f));
      if (extra.length > 0) {
        throw new Error(
          `extract fieldsExtracted not \u2286 guide fields: ${extra.join(", ")}`
        );
      }
    }
  }
  const output = contract.output.parse(rawOut);
  return mirrorStamp(output);
}

// apps/server/src/omega/discover-route.ts
async function runDiscoverForMission(store, missionId, rawGap) {
  const mission = await store.getMission(missionId);
  if (!mission) {
    throw new DiscoverRouteError("Mission not found", 404);
  }
  let gap;
  try {
    gap = DiscoverGapSchema.parse(rawGap);
  } catch (err) {
    throw new DiscoverRouteError(
      err instanceof Error ? err.message : "Invalid gap payload",
      400
    );
  }
  const missionSources = await store.listByMission("sources", missionId);
  const cellNames = missionSources.filter((s) => s.category === gap.category && s.scope === gap.layer).map((s) => s.name);
  const allNames = missionSources.map((s) => s.name);
  const existingSourceNames = Array.from(/* @__PURE__ */ new Set([...cellNames, ...allNames]));
  const reviews = await store.listByMission("reviews", missionId);
  const pendingFeedback = reviews.filter(
    (r) => r.reactsToProducer === "OmegaClaw" && !r.fedBackToOmega
  );
  const recentFeedback = pendingFeedback.map((r) => ({
    decision: r.action,
    reason: r.reason
  }));
  const output = await runOcCommand("discover", {
    missionId,
    gap,
    context: missionContext(mission),
    existingSourceNames,
    recentFeedback
  });
  const { sources: drafts, skipped } = buildDiscoverSourceRecords(
    output,
    missionId
  );
  const sources = [];
  for (const draft of drafts) {
    sources.push(await store.createSourceInMission(missionId, draft));
  }
  for (const review of pendingFeedback) {
    await store.upsert("reviews", {
      ...review,
      fedBackToOmega: true,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  return { output, sources, skipped };
}
function missionContext(mission) {
  return {
    country: mission.country,
    location: mission.location,
    sector: mission.sector,
    subsector: mission.subsector,
    goal: mission.goal
  };
}
var DiscoverRouteError = class extends Error {
  status;
  constructor(message, status) {
    super(message);
    this.name = "DiscoverRouteError";
    this.status = status;
  }
};

// apps/server/src/omega/probe-route.ts
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function runProbeForMission(store, missionId, rawBody, loadPlan) {
  const mission = await store.getMission(missionId);
  if (!mission) {
    throw new ProbeRouteError("Mission not found", 404);
  }
  const sourceId = rawBody && typeof rawBody === "object" && "sourceId" in rawBody && typeof rawBody.sourceId === "string" ? rawBody.sourceId : "";
  if (!UUID_RE.test(sourceId)) {
    throw new ProbeRouteError("sourceId (uuid) required", 400);
  }
  const missionSources = await store.listByMission("sources", missionId);
  const source = missionSources.find((s) => s.id === sourceId);
  if (!source) {
    throw new ProbeRouteError("Source not found on this mission", 404);
  }
  const nuance_rule = await resolveNuanceRule(mission, source, loadPlan);
  const fieldUniverse = SOURCE_FIELD_KEYS.length > 0 ? [...SOURCE_FIELD_KEYS] : [...SOURCE_FIELD_KEYS];
  try {
    const output = await runOcCommand("probe", {
      missionId,
      sourceId: source.id,
      url: source.url,
      category: source.category,
      nuance_rule,
      context: missionContext2(mission),
      fieldUniverse
    });
    const patch = buildProbeSourcePatch(output);
    const updated = await store.upsert("sources", {
      ...source,
      ...patch
    });
    return { output, source: updated };
  } catch (err) {
    if (err instanceof ProbeRouteError) throw err;
    const message = err instanceof Error ? err.message : "Probe failed";
    try {
      await store.upsert("sources", {
        ...source,
        probeStatus: "probe-failed",
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    } catch {
    }
    throw new ProbeRouteError(message, 400);
  }
}
async function resolveNuanceRule(mission, source, loadPlan) {
  const version = mission.search_plan_version || DEFAULT_SEARCH_PLAN_VERSION;
  const plan = await loadPlan(version);
  if (!plan) return void 0;
  const entry = plan.entries.find(
    (e) => e.layer === source.scope && e.category === source.category
  );
  return entry?.nuance_rule;
}
function missionContext2(mission) {
  return {
    country: mission.country,
    location: mission.location,
    sector: mission.sector,
    subsector: mission.subsector,
    goal: mission.goal
  };
}
var ProbeRouteError = class extends Error {
  status;
  constructor(message, status) {
    super(message);
    this.name = "ProbeRouteError";
    this.status = status;
  }
};

// apps/server/src/omega/extract-route.ts
async function runExtractForSource(store, missionId, sourceId) {
  const mission = await store.getMission(missionId);
  if (!mission) {
    throw new ExtractRouteError("Mission not found", 404);
  }
  const missionSources = await store.listByMission("sources", missionId);
  const source = missionSources.find((s) => s.id === sourceId);
  if (!source) {
    throw new ExtractRouteError("Source not found on this mission", 404);
  }
  if (source.status !== "accepted" && source.status !== "adjusted") {
    throw new ExtractRouteError("source not accepted", 400);
  }
  if (!source.extractionGuide) {
    throw new ExtractRouteError("source not probed (no extraction guide)", 400);
  }
  const existing = await store.listByMission("companies", missionId);
  const existingCompanyNames = existing.map((c) => c.name);
  const result = await runExtractGated(
    {
      missionId,
      sources: [
        {
          id: source.id,
          url: source.url,
          sourceFields: source.sourceFields ?? [],
          extractionGuide: source.extractionGuide
        }
      ],
      context: missionContext3(mission),
      existingCompanyNames
    },
    missionSources
  );
  const drafts = buildExtractCompanyRecords(result, missionId, source);
  const companies = [];
  for (const draft of drafts) {
    companies.push(await store.upsert("companies", draft));
  }
  return {
    created: companies.map((c) => c.id),
    companies,
    blocked: result.blocked,
    notes: result.discoveryNotes,
    output: result
  };
}
function missionContext3(mission) {
  return {
    country: mission.country,
    location: mission.location,
    sector: mission.sector,
    subsector: mission.subsector,
    goal: mission.goal
  };
}
var ExtractRouteError = class extends Error {
  status;
  constructor(message, status) {
    super(message);
    this.name = "ExtractRouteError";
    this.status = status;
  }
};

// apps/server/src/omega/barrier-route.ts
async function fulfillBarrierForSource(store, missionId, sourceId, barrierId, rawFulfillment) {
  const mission = await store.getMission(missionId);
  if (!mission) {
    throw new BarrierRouteError("Mission not found", 404);
  }
  let fulfillment;
  try {
    fulfillment = BarrierFulfillmentSchema.parse(rawFulfillment);
  } catch (err) {
    throw new BarrierRouteError(
      err instanceof Error ? err.message : "Invalid fulfillment payload",
      400
    );
  }
  const missionSources = await store.listByMission("sources", missionId);
  const source = missionSources.find((s) => s.id === sourceId);
  if (!source) {
    throw new BarrierRouteError("Source not found on this mission", 404);
  }
  if (!source.accessBarrier || source.accessBarrier.id !== barrierId) {
    throw new BarrierRouteError("barrier not found on source", 404);
  }
  const barrier = buildFulfilledBarrier(source.accessBarrier, fulfillment);
  const updated = await store.upsert("sources", {
    ...source,
    accessBarrier: barrier,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  if (fulfillment.kind === "api-key" && fulfillment.api_key_ref) {
    await storeSecretRef(fulfillment.api_key_ref);
  }
  const drafts = buildHumanCompaniesFromFulfillment({
    missionId,
    source: updated,
    fulfillment
  });
  const companies = [];
  for (const draft of drafts) {
    companies.push(await store.upsert("companies", draft));
  }
  return {
    barrier,
    source: updated,
    createdCompanyIds: companies.map((c) => c.id),
    companies
  };
}
async function declineBarrierForSource(store, missionId, sourceId, barrierId, rawBody) {
  const mission = await store.getMission(missionId);
  if (!mission) {
    throw new BarrierRouteError("Mission not found", 404);
  }
  const body = rawBody && typeof rawBody === "object" ? rawBody : {};
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const by = typeof body.by === "string" ? body.by.trim() : "";
  if (!reason) {
    throw new BarrierRouteError("reason is required to decline a barrier", 400);
  }
  if (!by) {
    throw new BarrierRouteError("by (curator id) is required", 400);
  }
  const missionSources = await store.listByMission("sources", missionId);
  const source = missionSources.find((s) => s.id === sourceId);
  if (!source) {
    throw new BarrierRouteError("Source not found on this mission", 404);
  }
  if (!source.accessBarrier || source.accessBarrier.id !== barrierId) {
    throw new BarrierRouteError("barrier not found on source", 404);
  }
  const barrier = buildDeclinedBarrier(source.accessBarrier, reason, by);
  const updated = await store.upsert("sources", {
    ...source,
    accessBarrier: barrier,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  return { barrier, source: updated };
}
var BarrierRouteError = class extends Error {
  status;
  constructor(message, status) {
    super(message);
    this.name = "BarrierRouteError";
    this.status = status;
  }
};

// apps/server/src/omega/harvest-route.ts
import { readFile as readFile2 } from "node:fs/promises";
import path3 from "node:path";
import { fileURLToPath } from "node:url";
var __dirname = path3.dirname(fileURLToPath(import.meta.url));
var aliasesPath = path3.resolve(
  __dirname,
  "../../../../searchplans/capability_aliases.v1.json"
);
async function runHarvestForCompany(store, missionId, companyId) {
  const mission = await store.getMission(missionId);
  if (!mission) {
    throw new HarvestRouteError("Mission not found", 404);
  }
  const companies = await store.listByMission("companies", missionId);
  const company = companies.find((c) => c.id === companyId);
  if (!company) {
    throw new HarvestRouteError("Company not found on this mission", 404);
  }
  const website_url = company.website_url ?? company.profileSourceUrl;
  const capability_aliases = await loadCapabilityAliases();
  try {
    const out = await runOcCommand("harvest", {
      missionId,
      companyId: company.id,
      name: company.name,
      website_url,
      capability_aliases,
      service_contexts_allowed: [...SERVICE_CONTEXTS]
    });
    const patch = buildHarvestCompanyPatch(out, {
      profileSourceUrl: website_url ?? company.profileSourceUrl
    });
    const updated = await store.upsert("companies", {
      ...company,
      ...patch
    });
    return {
      ok: true,
      company: updated,
      harvest_confidence: out.harvest_confidence,
      webpageTrustProbe: out.webpageTrustProbe
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Harvest failed";
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const observation = {
      id: v4_default(),
      missionId,
      producer: "OmegaClaw",
      createdAt: now,
      updatedAt: now,
      v: 1,
      statement: `Harvest failed for ${company.name} (${companyId}): ${message}`,
      evidenceUrls: website_url ? [website_url] : [],
      evidenceIds: [],
      tags: ["harvest-failed", `company:${companyId}`]
    };
    await store.upsert("observations", observation);
    return {
      ok: false,
      observationId: observation.id,
      error: message
    };
  }
}
async function loadCapabilityAliases() {
  try {
    const raw = JSON.parse(await readFile2(aliasesPath, "utf8"));
    const parsed = CapabilityAliasesSchema.parse(raw);
    return parsed.aliases;
  } catch {
    return {};
  }
}
var HarvestRouteError = class extends Error {
  status;
  constructor(message, status) {
    super(message);
    this.name = "HarvestRouteError";
    this.status = status;
  }
};

// apps/server/src/auth.ts
import { createClient as createClient2 } from "@supabase/supabase-js";
import { randomUUID as randomUUID4 } from "node:crypto";
var SEARCH_LIMIT = Number(process.env.SEARCH_SESSION_LIMIT ?? 5) || 5;
var SEARCH_COOKIE = "h3_search_session";
var SEARCH_SESSION_HEADER = "x-h3-search-session";
var SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidSearchSessionId(value) {
  if (!value) return false;
  const v = value.trim();
  return SESSION_ID_RE.test(v) || /^h3-[a-z0-9-]+$/i.test(v);
}
function createSupabaseAdmin() {
  const url = process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) return null;
  return createClient2(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
function isAuthRequired() {
  const explicit = process.env.AUTH_REQUIRED?.toLowerCase();
  if (explicit === "true" || explicit === "1") return true;
  if (explicit === "false" || explicit === "0") return false;
  const driver = (process.env.STORE_DRIVER ?? "file").toLowerCase();
  return driver === "postgres" || driver === "supabase";
}
async function loadProfile(admin, userId) {
  const { data, error } = await admin.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error || !data) return null;
  return data;
}
async function resolveAuthFromRequest(admin, authorizationHeader) {
  if (!admin || !authorizationHeader?.startsWith("Bearer ")) return null;
  const token = authorizationHeader.slice("Bearer ".length).trim();
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  let profile = await loadProfile(admin, data.user.id);
  if (!profile && data.user.email) {
    const { error: upsertErr } = await admin.from("profiles").upsert({
      id: data.user.id,
      email: data.user.email,
      role: "curad_volunteer",
      status: "pending"
    });
    if (!upsertErr) {
      profile = await loadProfile(admin, data.user.id);
    }
  }
  if (!profile) return null;
  const adminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (adminEmail && profile.email.toLowerCase() === adminEmail && (profile.role !== "admin" || profile.status !== "approved")) {
    const { data: updated } = await admin.from("profiles").update({
      role: "admin",
      status: "approved",
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }).eq("id", profile.id).select("*").single();
    if (updated) profile = updated;
  }
  return { user: data.user, profile };
}
function canWrite(auth, authRequired) {
  if (!authRequired) return true;
  if (!auth) return false;
  if (auth.profile.role === "admin" && auth.profile.status === "approved") {
    return true;
  }
  return auth.profile.role === "curad_volunteer" && auth.profile.status === "approved";
}
function isAdmin(auth) {
  return auth?.profile.role === "admin" && auth.profile.status === "approved";
}
function authMiddleware(admin, authRequired) {
  return async (c, next) => {
    c.set("authRequired", authRequired);
    try {
      const auth = await resolveAuthFromRequest(
        admin,
        c.req.header("Authorization")
      );
      c.set("auth", auth);
    } catch (err) {
      console.error("[auth] resolve failed", err);
      c.set("auth", null);
    }
    await next();
  };
}
function requireWrite() {
  return async (c, next) => {
    const method = c.req.method.toUpperCase();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      return next();
    }
    const path6 = c.req.path;
    if (path6 === "/api/me" || path6 === "/api/search/session" || path6 === "/api/search/consume" || path6 === "/api/search/demand" || path6.startsWith("/api/admin/")) {
      return next();
    }
    const authRequired = c.get("authRequired");
    const auth = c.get("auth");
    if (!canWrite(auth, authRequired)) {
      if (authRequired && auth && auth.profile.status === "pending") {
        return c.json(
          {
            error: "Awaiting admin approval \u2014 you can browse but cannot interact yet.",
            code: "pending_approval"
          },
          403
        );
      }
      if (authRequired && !auth) {
        return c.json({ error: "Authentication required", code: "auth_required" }, 401);
      }
      return c.json({ error: "Forbidden", code: "forbidden" }, 403);
    }
    return next();
  };
}
async function ensureSearchSession(admin, sessionId, memory) {
  if (admin) {
    const { data } = await admin.from("search_sessions").select("*").eq("session_id", sessionId).maybeSingle();
    if (!data) {
      await admin.from("search_sessions").insert({
        session_id: sessionId,
        search_count: 0
      });
      return {
        sessionId,
        searchCount: 0,
        remaining: SEARCH_LIMIT
      };
    }
    const count2 = data.search_count;
    return {
      sessionId,
      searchCount: count2,
      remaining: Math.max(0, SEARCH_LIMIT - count2)
    };
  }
  const count = memory.get(sessionId) ?? 0;
  return {
    sessionId,
    searchCount: count,
    remaining: Math.max(0, SEARCH_LIMIT - count)
  };
}
async function consumeSearch(admin, sessionId, memory) {
  const current = await ensureSearchSession(admin, sessionId, memory);
  if (current.searchCount >= SEARCH_LIMIT) {
    return {
      ok: false,
      searchCount: current.searchCount,
      remaining: 0,
      error: `Search limit reached (${SEARCH_LIMIT} per session during test phase).`
    };
  }
  const next = current.searchCount + 1;
  if (admin) {
    const { error } = await admin.from("search_sessions").update({ search_count: next }).eq("session_id", sessionId);
    if (error) {
      return {
        ok: false,
        searchCount: current.searchCount,
        remaining: 0,
        error: error.message
      };
    }
  } else {
    memory.set(sessionId, next);
  }
  return {
    ok: true,
    searchCount: next,
    remaining: Math.max(0, SEARCH_LIMIT - next)
  };
}
var OUTCOMES = /* @__PURE__ */ new Set([
  "hit",
  "no_match",
  "empty_companies",
  "ambiguous",
  "quota_blocked"
]);
function normalizeSearchDemandInput(body) {
  if (!body || typeof body !== "object") return null;
  const b = body;
  const what = String(b.what ?? "").trim();
  const location = String(b.location ?? "").trim();
  const outcomeRaw = String(b.outcome ?? "").trim();
  if (!what || !location || !OUTCOMES.has(outcomeRaw)) return null;
  const country = String(b.country ?? "").trim() || null;
  const parsed_sector = String(b.parsed_sector ?? "").trim() || null;
  const matched_mission_id = String(b.matched_mission_id ?? "").trim() || null;
  return {
    what: what.slice(0, 200),
    location: location.slice(0, 200),
    country: country ? country.slice(0, 120) : null,
    parsed_sector: parsed_sector ? parsed_sector.slice(0, 200) : null,
    matched_mission_id: matched_mission_id ? matched_mission_id.slice(0, 80) : null,
    outcome: outcomeRaw
  };
}
async function recordSearchDemand(admin, memory, input) {
  const row = {
    id: randomUUID4(),
    session_id: input.session_id,
    user_id: input.user_id,
    what: input.what,
    location: input.location,
    country: input.country,
    parsed_sector: input.parsed_sector,
    matched_mission_id: input.matched_mission_id,
    outcome: input.outcome,
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (admin) {
    const { data, error } = await admin.from("search_demands").insert({
      session_id: row.session_id,
      user_id: row.user_id,
      what: row.what,
      location: row.location,
      country: row.country,
      parsed_sector: row.parsed_sector,
      matched_mission_id: row.matched_mission_id,
      outcome: row.outcome
    }).select("*").single();
    if (!error && data) return data;
    if (error) {
      console.error("[search_demands] insert failed", error.message);
      const retry = await admin.from("search_demands").insert({
        session_id: row.session_id,
        user_id: null,
        what: row.what,
        location: row.location,
        country: row.country,
        parsed_sector: row.parsed_sector,
        matched_mission_id: row.matched_mission_id,
        outcome: row.outcome
      }).select("*").single();
      if (!retry.error && retry.data) return retry.data;
      console.error("[search_demands] retry failed", retry.error?.message);
    }
  }
  memory.unshift(row);
  if (memory.length > 500) memory.length = 500;
  return row;
}
async function listSearchDemands(admin, memory, limit = 200) {
  const capped = Math.min(Math.max(limit, 1), 500);
  if (admin) {
    const { data, error } = await admin.from("search_demands").select("*").order("created_at", { ascending: false }).limit(capped);
    if (!error && data) return data;
    console.error("[search_demands] list failed", error?.message);
  }
  return memory.slice(0, capped);
}
function aggregateSearchDemands(demands) {
  const map = /* @__PURE__ */ new Map();
  for (const d of demands) {
    const what = (d.parsed_sector || d.what).trim();
    const location = d.location.trim();
    const country = d.country?.trim() || null;
    const key = `${normalizeKey(location)}|${normalizeKey(country ?? "")}|${normalizeKey(what)}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        key,
        what,
        location,
        country,
        count: 1,
        lastAt: d.created_at,
        outcomes: { [d.outcome]: 1 },
        matchedMissionId: d.matched_mission_id
      });
      continue;
    }
    existing.count += 1;
    existing.outcomes[d.outcome] = (existing.outcomes[d.outcome] ?? 0) + 1;
    if (d.created_at > existing.lastAt) {
      existing.lastAt = d.created_at;
      if (d.matched_mission_id) existing.matchedMissionId = d.matched_mission_id;
    }
  }
  return [...map.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return b.lastAt.localeCompare(a.lastAt);
  });
}
function normalizeKey(s) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

// apps/server/src/app.ts
function normPlace(value) {
  return value.toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function titleCaseTrade(value) {
  return value.replace(/\([^)]*\)/g, "").trim().replace(/\b\w/g, (c) => c.toUpperCase());
}
function findMissionForDemand(missions, input) {
  if (input.matched_mission_id) {
    const byId = missions.find((m) => m.id === input.matched_mission_id);
    if (byId) return byId;
  }
  const loc = normPlace(input.location);
  const country = input.country ? normPlace(input.country) : "";
  const what = normPlace(input.what);
  let best = null;
  for (const m of missions) {
    const mLoc = normPlace(m.location);
    const mCountry = normPlace(m.country);
    const mSector = normPlace(`${m.subsector} ${m.sector}`);
    let score = 0;
    if (mLoc === loc || mLoc.includes(loc) || loc.includes(mLoc)) score += 2;
    else continue;
    if (mSector.includes(what) || what.includes(normPlace(m.subsector))) {
      score += 2;
    } else continue;
    if (country && (mCountry === country || mCountry.includes(country) || country.includes(mCountry))) {
      score += 1;
    }
    if (!best || score > best.score) best = { mission: m, score };
  }
  return best && best.score >= 4 ? best.mission : null;
}
async function ensureMissionFromSearchDemand(store, input) {
  const missions = await store.listMissions();
  const existing = findMissionForDemand(missions, input);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  if (existing) {
    const demandCount = (existing.demandCount ?? 0) + 1;
    const updated = {
      ...existing,
      demandCount,
      lastSearchedAt: now,
      updatedAt: now,
      notes: `Search demand \xB7 ${demandCount}\xD7 \xB7 last ${now}`
    };
    await store.upsertMission(updated);
    return { mission: updated, created: false };
  }
  const subsector = titleCaseTrade(input.what);
  const country = input.country?.trim() || "Unspecified";
  const created = {
    id: randomUUID5(),
    location: input.location.trim(),
    country,
    sector: "Home Maintenance",
    subsector,
    goal: `Find trustworthy ${subsector.toLowerCase()} in ${input.location.trim()}${country !== "Unspecified" ? ` (${country})` : ""} and validate source reliability.`,
    notes: `Search demand \xB7 1\xD7 \xB7 last ${now}`,
    search_plan_version: DEFAULT_SEARCH_PLAN_VERSION,
    discoveryBrief: {
      approach: "Opened from worldwide Single Search demand. Warm-start reusable lists; fill local/sector gaps.",
      candidateListTypes: [
        "registry",
        "local_business_association",
        "branch_association"
      ],
      successCriteria: "\u22655 CARA-accepted/adjusted lists before company deep-check",
      producer: "Human",
      updatedAt: now
    },
    phases: [
      { key: "observation", status: "active" },
      { key: "hypothesis", status: "waiting" },
      { key: "evidence", status: "waiting" },
      { key: "cara", status: "waiting" },
      { key: "patterns", status: "waiting" },
      { key: "companies", status: "waiting" },
      { key: "deep_check", status: "waiting" }
    ],
    producer: "Human",
    origin: "search_demand",
    demandCount: 1,
    lastSearchedAt: now,
    createdAt: now,
    updatedAt: now,
    v: 1
  };
  await store.upsertMission(created);
  try {
    await store.warmStartMissionSources(created.id, created.location);
  } catch {
  }
  return { mission: created, created: true };
}
function createApp(options) {
  const { store, searchPlansRoot: searchPlansRoot2, writableRoot } = options;
  const admin = createSupabaseAdmin();
  const authRequired = isAuthRequired();
  const searchMemory = /* @__PURE__ */ new Map();
  const searchDemandMemory = [];
  const corsOrigins = options.corsOrigins ?? [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    ...process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim()) : []
  ];
  const app2 = new Hono();
  app2.use(
    "*",
    cors({
      origin: (origin) => {
        if (!origin) return corsOrigins[0] ?? "*";
        if (corsOrigins.includes(origin)) return origin;
        if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) return origin;
        return corsOrigins[0] ?? origin;
      },
      credentials: true,
      allowHeaders: [
        "Content-Type",
        "Authorization",
        "X-H3-Search-Session"
      ]
    })
  );
  app2.use("*", authMiddleware(admin, authRequired));
  app2.use("/api/*", requireWrite());
  async function listSearchPlanVersions() {
    try {
      const files = await readdir2(searchPlansRoot2);
      return files.filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/i, "")).sort();
    } catch {
      return [];
    }
  }
  async function loadSearchPlan(version) {
    const safe = version.replace(/[^a-zA-Z0-9._-]/g, "");
    if (!safe) return null;
    try {
      const raw = await readFile3(
        path4.join(searchPlansRoot2, `${safe}.json`),
        "utf8"
      );
      return SearchPlanSchema.parse(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  app2.get(
    "/api/health",
    (c) => c.json({
      ok: true,
      service: "h3-trust-harness",
      storeDriver: process.env.STORE_DRIVER ?? "file",
      authRequired,
      hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
      hasServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      hasAdminEmail: Boolean(process.env.ADMIN_EMAIL),
      writableRoot: writableRoot ?? null
    })
  );
  app2.get("/api/me", async (c) => {
    const auth = c.get("auth");
    if (!auth) {
      if (!authRequired) {
        return c.json({
          authRequired: false,
          user: null,
          profile: null,
          openMode: true
        });
      }
      return c.json({ error: "Not authenticated", code: "auth_required" }, 401);
    }
    return c.json({
      authRequired,
      user: { id: auth.user.id, email: auth.user.email },
      profile: auth.profile,
      canWrite: canWrite(auth, authRequired),
      isAdmin: isAdmin(auth)
    });
  });
  app2.patch("/api/me", async (c) => {
    const auth = c.get("auth");
    if (!auth || !admin) {
      return c.json({ error: "Authentication required" }, 401);
    }
    const body = await c.req.json();
    const patch = {
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (typeof body.display_name === "string") {
      patch.display_name = body.display_name.trim() || null;
    }
    if (typeof body.preferred_location === "string") {
      patch.preferred_location = body.preferred_location.trim() || null;
    }
    const { data, error } = await admin.from("profiles").update(patch).eq("id", auth.profile.id).select("*").single();
    if (error) return c.json({ error: error.message }, 400);
    return c.json({ profile: data });
  });
  app2.get("/api/admin/volunteers", async (c) => {
    const auth = c.get("auth");
    if (!isAdmin(auth) || !admin) {
      return c.json({ error: "Admin only" }, 403);
    }
    const { data, error } = await admin.from("profiles").select("*").eq("role", "curad_volunteer").order("created_at", { ascending: false });
    if (error) return c.json({ error: error.message }, 400);
    return c.json({ volunteers: data ?? [] });
  });
  app2.post("/api/admin/volunteers/:id/approve", async (c) => {
    const auth = c.get("auth");
    if (!isAdmin(auth) || !admin) {
      return c.json({ error: "Admin only" }, 403);
    }
    const { data, error } = await admin.from("profiles").update({
      status: "approved",
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }).eq("id", c.req.param("id")).select("*").single();
    if (error) return c.json({ error: error.message }, 400);
    return c.json({ profile: data });
  });
  app2.post("/api/admin/volunteers/:id/reject", async (c) => {
    const auth = c.get("auth");
    if (!isAdmin(auth) || !admin) {
      return c.json({ error: "Admin only" }, 403);
    }
    const { data, error } = await admin.from("profiles").update({
      status: "rejected",
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }).eq("id", c.req.param("id")).select("*").single();
    if (error) return c.json({ error: error.message }, 400);
    return c.json({ profile: data });
  });
  function resolveSearchSessionId(c) {
    const fromHeader = c.req.header(SEARCH_SESSION_HEADER)?.trim();
    if (isValidSearchSessionId(fromHeader)) {
      return { sessionId: fromHeader, isNew: false };
    }
    const fromCookie = getCookie(c, SEARCH_COOKIE)?.trim();
    if (isValidSearchSessionId(fromCookie)) {
      return { sessionId: fromCookie, isNew: false };
    }
    return { sessionId: randomUUID5(), isNew: true };
  }
  function attachSearchSessionCookie(c, sessionId) {
    setCookie(c, SEARCH_COOKIE, sessionId, {
      httpOnly: true,
      // HTTPS on Vercel; local dev relies on X-H3-Search-Session header
      secure: process.env.VERCEL === "1",
      sameSite: "Lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7
    });
  }
  app2.post("/api/search/session", async (c) => {
    const { sessionId } = resolveSearchSessionId(c);
    attachSearchSessionCookie(c, sessionId);
    const state = await ensureSearchSession(admin, sessionId, searchMemory);
    return c.json({
      ...state,
      limit: SEARCH_LIMIT
    });
  });
  app2.post("/api/search/consume", async (c) => {
    const { sessionId } = resolveSearchSessionId(c);
    attachSearchSessionCookie(c, sessionId);
    const auth = c.get("auth");
    if (canWrite(auth, authRequired)) {
      const state = await ensureSearchSession(admin, sessionId, searchMemory);
      return c.json({
        ok: true,
        searchCount: state.searchCount,
        remaining: SEARCH_LIMIT,
        limit: SEARCH_LIMIT,
        unlimited: true
      });
    }
    const result = await consumeSearch(admin, sessionId, searchMemory);
    if (!result.ok) {
      return c.json({ ...result, limit: SEARCH_LIMIT }, 429);
    }
    return c.json({ ...result, limit: SEARCH_LIMIT, unlimited: false });
  });
  app2.post("/api/search/demand", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = normalizeSearchDemandInput(body);
    if (!parsed) {
      return c.json(
        { error: "Invalid demand \u2014 need what, location, and outcome." },
        400
      );
    }
    const { sessionId } = resolveSearchSessionId(c);
    attachSearchSessionCookie(c, sessionId);
    const auth = c.get("auth");
    let mission = null;
    let missionCreated = false;
    try {
      const ensured = await ensureMissionFromSearchDemand(store, {
        what: parsed.what,
        location: parsed.location,
        country: parsed.country,
        matched_mission_id: parsed.matched_mission_id
      });
      mission = ensured.mission;
      missionCreated = ensured.created;
    } catch (err) {
      console.error(
        "[search_demands] ensure mission failed",
        err instanceof Error ? err.message : err
      );
    }
    const demand = await recordSearchDemand(admin, searchDemandMemory, {
      session_id: sessionId,
      user_id: auth?.user.id ?? null,
      ...parsed,
      matched_mission_id: parsed.matched_mission_id || mission?.id || null
    });
    return c.json(
      {
        ok: true,
        demand,
        mission,
        missionCreated
      },
      201
    );
  });
  app2.get("/api/search/demands", async (c) => {
    const limitRaw = Number(c.req.query("limit") ?? 200);
    const demands = await listSearchDemands(admin, searchDemandMemory, limitRaw);
    const aggregates = aggregateSearchDemands(demands);
    return c.json({ demands, aggregates });
  });
  app2.get("/api/searchplans", async (c) => {
    const versions = await listSearchPlanVersions();
    const latest = versions.includes(DEFAULT_SEARCH_PLAN_VERSION) ? DEFAULT_SEARCH_PLAN_VERSION : versions[versions.length - 1] ?? DEFAULT_SEARCH_PLAN_VERSION;
    return c.json({ versions, latest });
  });
  app2.get("/api/searchplans/:version", async (c) => {
    const plan = await loadSearchPlan(c.req.param("version"));
    if (!plan) return c.json({ error: "Search plan not found" }, 404);
    return c.json(plan);
  });
  app2.get("/api/missions", async (c) => {
    const missions = await store.listMissions();
    return c.json(missions);
  });
  app2.get("/api/missions/:id", async (c) => {
    const mission = await store.getMission(c.req.param("id"));
    if (!mission) return c.json({ error: "Not found" }, 404);
    return c.json(mission);
  });
  app2.post("/api/missions", async (c) => {
    const body = await c.req.json();
    const mission = await store.upsertMission(body);
    try {
      await store.warmStartMissionSources(mission.id, mission.location);
    } catch {
    }
    return c.json(mission, 201);
  });
  app2.put("/api/missions/:id", async (c) => {
    const body = await c.req.json();
    if (body.id !== c.req.param("id")) {
      return c.json({ error: "ID mismatch" }, 400);
    }
    const mission = await store.upsertMission(body);
    return c.json(mission);
  });
  app2.delete("/api/missions/:id", async (c) => {
    const ok = await store.deleteMission(c.req.param("id"));
    if (!ok) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  });
  app2.post("/api/missions/:missionId/omega/discover", async (c) => {
    const missionId = c.req.param("missionId");
    const body = await c.req.json();
    try {
      const result = await runDiscoverForMission(store, missionId, body);
      return c.json(result, 201);
    } catch (err) {
      if (err instanceof DiscoverRouteError) {
        return c.json({ error: err.message }, err.status);
      }
      return c.json(
        { error: err instanceof Error ? err.message : "Discover failed" },
        400
      );
    }
  });
  app2.post("/api/missions/:missionId/omega/probe", async (c) => {
    const missionId = c.req.param("missionId");
    const body = await c.req.json();
    try {
      const result = await runProbeForMission(
        store,
        missionId,
        body,
        loadSearchPlan
      );
      return c.json(result);
    } catch (err) {
      if (err instanceof ProbeRouteError) {
        return c.json({ error: err.message }, err.status);
      }
      return c.json(
        { error: err instanceof Error ? err.message : "Probe failed" },
        400
      );
    }
  });
  app2.post(
    "/api/missions/:missionId/sources/:sourceId/extract",
    async (c) => {
      try {
        const result = await runExtractForSource(
          store,
          c.req.param("missionId"),
          c.req.param("sourceId")
        );
        return c.json(result, 201);
      } catch (err) {
        if (err instanceof ExtractRouteError) {
          return c.json({ error: err.message }, err.status);
        }
        return c.json(
          { error: err instanceof Error ? err.message : "Extract failed" },
          400
        );
      }
    }
  );
  app2.post(
    "/api/missions/:missionId/sources/:sourceId/barriers/:barrierId/fulfill",
    async (c) => {
      const body = await c.req.json();
      try {
        const result = await fulfillBarrierForSource(
          store,
          c.req.param("missionId"),
          c.req.param("sourceId"),
          c.req.param("barrierId"),
          body.fulfillment ?? body
        );
        return c.json(result);
      } catch (err) {
        if (err instanceof BarrierRouteError) {
          return c.json({ error: err.message }, err.status);
        }
        return c.json(
          { error: err instanceof Error ? err.message : "Fulfill failed" },
          400
        );
      }
    }
  );
  app2.post(
    "/api/missions/:missionId/sources/:sourceId/barriers/:barrierId/decline",
    async (c) => {
      const body = await c.req.json();
      try {
        const result = await declineBarrierForSource(
          store,
          c.req.param("missionId"),
          c.req.param("sourceId"),
          c.req.param("barrierId"),
          body
        );
        return c.json(result);
      } catch (err) {
        if (err instanceof BarrierRouteError) {
          return c.json({ error: err.message }, err.status);
        }
        return c.json(
          { error: err instanceof Error ? err.message : "Decline failed" },
          400
        );
      }
    }
  );
  app2.post(
    "/api/missions/:missionId/companies/:companyId/harvest",
    async (c) => {
      try {
        const result = await runHarvestForCompany(
          store,
          c.req.param("missionId"),
          c.req.param("companyId")
        );
        return c.json(result);
      } catch (err) {
        if (err instanceof HarvestRouteError) {
          return c.json({ error: err.message }, err.status);
        }
        return c.json(
          { error: err instanceof Error ? err.message : "Harvest failed" },
          400
        );
      }
    }
  );
  app2.get("/api/missions/:missionId/coverage", async (c) => {
    const missionId = c.req.param("missionId");
    const mission = await store.getMission(missionId);
    if (!mission) return c.json({ error: "Not found" }, 404);
    const [sources, companies] = await Promise.all([
      store.listByMission("sources", missionId),
      store.listByMission("companies", missionId)
    ]);
    const plan = await loadSearchPlan(
      mission.search_plan_version || DEFAULT_SEARCH_PLAN_VERSION
    );
    const coverage = computeMissionCoverage({
      sources,
      companies,
      planEntries: plan?.entries ?? []
    });
    return c.json(coverage);
  });
  app2.post("/api/missions/:missionId/sources/warm-start", async (c) => {
    const missionId = c.req.param("missionId");
    const mission = await store.getMission(missionId);
    if (!mission) return c.json({ error: "Not found" }, 404);
    try {
      const linked = await store.warmStartMissionSources(
        missionId,
        mission.location
      );
      return c.json({ linked: linked.length, sources: linked });
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : "Warm-start failed" },
        400
      );
    }
  });
  app2.post("/api/missions/:missionId/sources", async (c) => {
    const missionId = c.req.param("missionId");
    const body = await c.req.json();
    try {
      const saved = await store.createSourceInMission(missionId, body);
      return c.json(saved, 201);
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : "Create source failed" },
        400
      );
    }
  });
  app2.post("/api/missions/:missionId/sources/link", async (c) => {
    const missionId = c.req.param("missionId");
    const body = await c.req.json();
    const sourceId = body.sourceId;
    if (!sourceId) {
      return c.json({ error: "sourceId required" }, 400);
    }
    try {
      const result = await store.linkSourceToMission(
        missionId,
        sourceId,
        body.producer ?? "Human"
      );
      return c.json(result, 201);
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : "Link failed" },
        400
      );
    }
  });
  app2.get("/api/sources/linkable", async (c) => {
    const excludeMission = c.req.query("excludeMission");
    if (!excludeMission) {
      return c.json({ error: "excludeMission required" }, 400);
    }
    const q = c.req.query("q") ?? "";
    const items = await store.listLinkableSources(excludeMission, q);
    return c.json(items);
  });
  app2.get("/api/sources", async (c) => {
    return c.json(await store.listAllSources());
  });
  const missionCollections = CollectionNameSchema.options.filter(
    (name) => name !== "missions" && name !== "patterns" && name !== "sources"
  );
  for (const collection of missionCollections) {
    app2.get(`/api/missions/:missionId/${collection}`, async (c) => {
      const items = await store.listByMission(
        collection,
        c.req.param("missionId")
      );
      return c.json(items);
    });
    app2.post(`/api/missions/:missionId/${collection}`, async (c) => {
      const body = await c.req.json();
      const missionId = c.req.param("missionId");
      if (collection === "missionSources") {
        if (body.mission_id !== missionId) {
          return c.json({ error: "mission_id mismatch" }, 400);
        }
      } else if (body.missionId !== missionId) {
        return c.json({ error: "missionId mismatch" }, 400);
      }
      const saved = await store.upsert(collection, body);
      return c.json(saved, 201);
    });
    app2.put(`/api/${collection}/:id`, async (c) => {
      const body = await c.req.json();
      if (body.id !== c.req.param("id")) {
        return c.json({ error: "ID mismatch" }, 400);
      }
      const saved = await store.upsert(collection, body);
      return c.json(saved);
    });
    app2.delete(`/api/${collection}/:id`, async (c) => {
      const ok = await store.remove(collection, c.req.param("id"));
      return c.json({ ok });
    });
  }
  app2.put("/api/sources/:id", async (c) => {
    const body = await c.req.json();
    if (body.id !== c.req.param("id")) {
      return c.json({ error: "ID mismatch" }, 400);
    }
    const saved = await store.upsert("sources", body);
    return c.json(saved);
  });
  app2.delete("/api/sources/:id", async (c) => {
    const ok = await store.remove("sources", c.req.param("id"));
    return c.json({ ok });
  });
  app2.get("/api/missions/:missionId/sources", async (c) => {
    const items = await store.listByMission(
      "sources",
      c.req.param("missionId")
    );
    return c.json(items);
  });
  app2.get("/api/patterns", async (c) => {
    return c.json(await store.listPatterns());
  });
  app2.post("/api/patterns", async (c) => {
    const body = await c.req.json();
    const saved = await store.upsert("patterns", body);
    return c.json(saved, 201);
  });
  app2.get("/api/missions/:id/export", async (c) => {
    try {
      const bundle = await store.exportBundle(c.req.param("id"));
      if (writableRoot) {
        const exportDir = path4.join(writableRoot, "export");
        await mkdir2(exportDir, { recursive: true });
        const outPath = path4.join(exportDir, `${c.req.param("id")}.json`);
        await writeFile2(outPath, `${JSON.stringify(bundle, null, 2)}
`, "utf8");
      }
      return c.json(bundle);
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : "Export failed" },
        404
      );
    }
  });
  return app2;
}

// scripts/vercel-api-entry.ts
process.env.STORE_DRIVER ??= "postgres";
process.env.AUTH_REQUIRED ??= "true";
var searchPlansRoot = path5.join(process.cwd(), "searchplans");
function buildApp() {
  try {
    const store = createStore({ driver: "postgres" });
    return createApp({
      store,
      searchPlansRoot
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api] failed to boot store/app:", message);
    const fallback = new Hono2();
    fallback.all(
      "*",
      (c) => c.json(
        {
          ok: false,
          error: message,
          hint: "Set STORE_DRIVER=postgres, SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY on the Vercel project (server env, not only VITE_*)."
        },
        500
      )
    );
    return fallback;
  }
}
var app = buildApp();
var vercel_api_entry_default = app;
export {
  vercel_api_entry_default as default
};
