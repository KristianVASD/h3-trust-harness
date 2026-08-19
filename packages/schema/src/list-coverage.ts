export type CoverageSource = {
  id: string;
  name: string;
  status: string;
  suggestedWeight?: number;
  suggestedConfidence?: number;
};

export type CoverageCompany = {
  source_ids: string[];
};

/** Human-validated list statuses — Adjust counts as validated. */
export function isTrustedList(source: CoverageSource): boolean {
  return source.status === "accepted" || source.status === "adjusted";
}

export function listWeight(source: CoverageSource): number {
  return source.suggestedWeight ?? source.suggestedConfidence ?? 50;
}

/** Source ids that actually have at least one company row pointing at them. */
export function harvestedSourceIds(companies: CoverageCompany[]): Set<string> {
  const ids = new Set<string>();
  for (const company of companies) {
    for (const id of company.source_ids ?? []) {
      if (id) ids.add(id);
    }
  }
  return ids;
}

export type ListCoverage = {
  onCount: number;
  totalCount: number;
  coveredWeight: number;
  totalWeight: number;
  /** 0–100 share of trusted-list weight this company appears on. */
  score: number;
  lists: CoverageSource[];
  explanation: string;
};

/**
 * Weighted list coverage: two companies on "3 lists" can rank differently
 * when those lists carry different weights.
 *
 * When `packCompanies` is passed, the denominator is only trusted lists that
 * actually have member rows in this pack (empty warm-starts do not inflate 1/11).
 */
export function computeListCoverage(
  company: CoverageCompany,
  missionSources: CoverageSource[],
  packCompanies?: CoverageCompany[],
): ListCoverage {
  const harvested = packCompanies ? harvestedSourceIds(packCompanies) : null;
  const trusted = missionSources.filter(
    (s) => isTrustedList(s) && (!harvested || harvested.has(s.id)),
  );
  const totalWeight = trusted.reduce((sum, s) => sum + listWeight(s), 0);
  const lists = trusted.filter((s) => company.source_ids.includes(s.id));
  const coveredWeight = lists.reduce((sum, s) => sum + listWeight(s), 0);
  const score =
    totalWeight === 0 ? 0 : Math.round((coveredWeight / totalWeight) * 100);

  const listBits = lists
    .map((s) => `${s.name} (w${listWeight(s)})`)
    .join(", ");

  const explanation =
    trusted.length === 0
      ? packCompanies
        ? "No trusted lists with member rows in this pack yet."
        : "No CARA-accepted/adjusted lists in this mission yet."
      : `On ${lists.length} of ${trusted.length} lists with members` +
        ` · weight ${coveredWeight}/${totalWeight} (${score}%)` +
        (listBits ? ` — ${listBits}` : "");

  return {
    onCount: lists.length,
    totalCount: trusted.length,
    coveredWeight,
    totalWeight,
    score,
    lists,
    explanation,
  };
}
