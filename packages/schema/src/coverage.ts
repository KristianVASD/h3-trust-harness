import { z } from "zod";
import type { SearchPlanEntry } from "./search-plan";
import type { SourceFieldKey } from "./source-richness";
import type { ExtractionGuide, ProbeStatus, Richness } from "./source-richness";

/** A "cell" = one (layer × category) slot in the search plan. */
export const TARGET_COMPANIES = 5; // ties to the ≥5 mission-success gate
export const READY_MIN_SCORE = 60;
export const READY_MIN_SOURCES = 2;
export const READY_MIN_COMPANIES = 3;

/** default.v1 coverage blend — sums to 1.0. */
export const COVERAGE_WEIGHTS = {
  planCoverage: 0.3,
  sourceDepth: 0.2,
  companyBreadth: 0.25,
  profileCompleteness: 0.15,
  kvkQuality: 0.1,
} as const;

export const MissionCoverageSchema = z.object({
  searchPlanCellsTotal: z.number().int().min(0),
  searchPlanCellsFilled: z.number().int().min(0),
  sourcesAccepted: z.number().int().min(0),
  sourcesProbed: z.number().int().min(0),
  sourcesWithGuide: z.number().int().min(0),
  companiesExtracted: z.number().int().min(0),
  companiesWithProfile: z.number().int().min(0),
  kvkPassRate: z.number().min(0).max(1),
  completenessScore: z.number().int().min(0).max(100),
  readyForSearch: z.boolean(),
  readyReason: z.string(),
  /** Per-component contribution — the "why" behind the score. */
  breakdown: z.record(z.string(), z.number()).optional(),
});
export type MissionCoverage = z.infer<typeof MissionCoverageSchema>;

/** Duck-typed so this module never imports from index (no circular deps). */
export type CoverageMissionSource = {
  status: string;
  scope: string;
  category: string;
  probeStatus?: ProbeStatus;
  extractionGuide?: ExtractionGuide | null;
  sourceFields?: SourceFieldKey[];
  richness?: Richness;
};

export type CoverageMissionCompany = {
  capabilities: string[];
  profileSnippet?: string;
  kvk_gate: string;
};

const ACCEPTED = new Set(["accepted", "adjusted"]);

/**
 * Pure + derived — never stored, so it can never go stale.
 * Call it on demand from the server/UI whenever sources or companies change.
 */
export function computeMissionCoverage(args: {
  sources: CoverageMissionSource[];
  companies: CoverageMissionCompany[];
  planEntries: SearchPlanEntry[];
}): MissionCoverage {
  const { sources, companies, planEntries } = args;
  const accepted = sources.filter((s) => ACCEPTED.has(s.status));

  // A cell is "filled" when ≥1 accepted source matches its (layer, category).
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
  const companiesExtracted = companies.length;
  const companiesWithProfile = companies.filter(
    (c) => c.capabilities.length > 0 || (c.profileSnippet ?? "").length > 0,
  ).length;
  const kvkPassRate =
    companiesExtracted === 0
      ? 0
      : companies.filter((c) => c.kvk_gate === "pass").length / companiesExtracted;

  const planCoverage =
    searchPlanCellsTotal === 0 ? 0 : searchPlanCellsFilled / searchPlanCellsTotal;
  const sourceDepth =
    sourcesAccepted === 0 ? 0 : sourcesWithGuide / sourcesAccepted;
  const companyBreadth = Math.min(companiesExtracted / TARGET_COMPANIES, 1);
  const profileCompleteness =
    companiesExtracted === 0 ? 0 : companiesWithProfile / companiesExtracted;

  const breakdown: Record<string, number> = {
    planCoverage: Math.round(100 * COVERAGE_WEIGHTS.planCoverage * planCoverage),
    sourceDepth: Math.round(100 * COVERAGE_WEIGHTS.sourceDepth * sourceDepth),
    companyBreadth: Math.round(
      100 * COVERAGE_WEIGHTS.companyBreadth * companyBreadth,
    ),
    profileCompleteness: Math.round(
      100 * COVERAGE_WEIGHTS.profileCompleteness * profileCompleteness,
    ),
    kvkQuality: Math.round(100 * COVERAGE_WEIGHTS.kvkQuality * kvkPassRate),
  };
  const completenessScore = Math.min(
    100,
    Object.values(breakdown).reduce((a, b) => a + b, 0),
  );

  const unmet: string[] = [];
  if (completenessScore < READY_MIN_SCORE) {
    unmet.push(`completeness ${completenessScore}<${READY_MIN_SCORE}`);
  }
  if (sourcesAccepted < READY_MIN_SOURCES) {
    unmet.push(
      `need ≥${READY_MIN_SOURCES} accepted sources (have ${sourcesAccepted})`,
    );
  }
  if (companiesExtracted < READY_MIN_COMPANIES) {
    unmet.push(
      `need ≥${READY_MIN_COMPANIES} companies (have ${companiesExtracted})`,
    );
  }
  const readyForSearch = unmet.length === 0;

  return {
    searchPlanCellsTotal,
    searchPlanCellsFilled,
    sourcesAccepted,
    sourcesProbed,
    sourcesWithGuide,
    companiesExtracted,
    companiesWithProfile,
    kvkPassRate: Number(kvkPassRate.toFixed(3)),
    completenessScore,
    readyForSearch,
    readyReason: readyForSearch ? "ready" : unmet.join("; "),
    breakdown,
  };
}
