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

/**
 * Being on a CARA-trusted list is real evidence, not a 1/N fail.
 * Default-weight (50) list alone ≈ 65; Vakwerk-class (90) alone ≈ 75.
 */
const PRESENCE_FLOOR = 52;
const FIRST_WEIGHT_SCALE = 0.26;
/** Share of remaining headroom each extra independent list can claim. */
const CORROBORATION = 0.85;

/**
 * Independent-mention factor for meters that only know a count.
 * 1 list ≈ 0.62, 2 ≈ 0.86, 3+ saturates toward 1.0 — not n/3.
 */
export function listMentionFactor(listCount: number): number {
  if (listCount <= 0) return 0;
  return Math.min(1, 1 - Math.pow(0.38, listCount));
}

/**
 * Saturating evidence from the lists this company is actually on.
 * Extra lists in the pack (that the company is not on) do not pull the score down.
 */
export function evidenceScoreFromWeights(weights: number[]): number {
  if (!weights.length) return 0;
  const ranked = [...weights]
    .map((w) => Math.min(100, Math.max(0, w)))
    .sort((a, b) => b - a);
  const first = ranked[0] ?? 0;
  let score = PRESENCE_FLOOR + FIRST_WEIGHT_SCALE * first;
  let remaining = Math.max(0, 100 - score);
  for (const weight of ranked.slice(1)) {
    const take = remaining * (weight / 100) * CORROBORATION;
    score += take;
    remaining -= take;
  }
  return Math.round(Math.min(100, Math.max(0, score)));
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
  /** 0–100 independent-mention evidence (not share of the pack). */
  score: number;
  lists: CoverageSource[];
  explanation: string;
};

/**
 * Rank by independent trusted-list evidence.
 *
 * One high-weight list is a real painter signal (~65–75). A second
 * independent list corroborates and ranks higher. The pack's unused lists
 * stay in `totalCount` as context — they do not dilute the score.
 *
 * When `packCompanies` is passed, `totalCount` only includes trusted lists
 * that actually have member rows (empty warm-starts do not inflate 1/11).
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
  const score = evidenceScoreFromWeights(lists.map(listWeight));

  const listBits = lists
    .map((s) => `${s.name} (w${listWeight(s)})`)
    .join(", ");

  const corroboration =
    lists.length === 0
      ? ""
      : lists.length === 1
        ? " · single list (not yet corroborated)"
        : ` · ${lists.length} independent lists`;

  const explanation =
    trusted.length === 0
      ? packCompanies
        ? "No trusted lists with member rows in this pack yet."
        : "No CARA-accepted/adjusted lists in this mission yet."
      : `On ${lists.length} of ${trusted.length} lists with members` +
        ` · evidence ${score}/100` +
        corroboration +
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
