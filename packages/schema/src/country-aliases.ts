/**
 * Local country names that must match the same sector pack.
 * Search used to miss NL painters when the query said "Nederland"
 * and the pack said "Netherlands".
 */
const COUNTRY_CANONICAL: Record<string, string> = {
  nederland: "netherlands",
  netherlands: "netherlands",
  "the netherlands": "netherlands",
  holland: "netherlands",
  nl: "netherlands",
  belgie: "belgium",
  belgium: "belgium",
  italia: "italy",
  italy: "italy",
};

export function foldCountryLabel(value: string): string {
  return value
    .trim()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Canonical English key, or the folded label if unknown. */
export function canonicalCountry(value: string): string {
  const folded = foldCountryLabel(value);
  if (!folded) return "";
  return COUNTRY_CANONICAL[folded] ?? folded;
}

/** True when both labels name the same country. Empty strings do not match. */
export function countriesEquivalent(a: string, b: string): boolean {
  const left = canonicalCountry(a);
  const right = canonicalCountry(b);
  if (!left || !right) return false;
  return left === right;
}
