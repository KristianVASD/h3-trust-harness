import {
  canonicalCountry,
  countriesEquivalent,
  type Mission,
} from "@h3-trust/schema";

export function normPlace(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)\s*/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isNationalPack(mission: Mission): boolean {
  const loc = normPlace(mission.location);
  if (!loc) return false;
  if (loc === "national" || loc === "nationwide") return true;
  if (countriesEquivalent(mission.location, mission.country)) return true;
  return false;
}

export function packKey(mission: Mission): string {
  return `${canonicalCountry(mission.country) || normPlace(mission.country)}|${normPlace(mission.sector)}|${normPlace(mission.subsector)}`;
}

export function tradesMatch(mission: Mission, what: string): boolean {
  const needle = normPlace(what);
  if (!needle) return false;
  const hay = normPlace(`${mission.subsector} ${mission.sector}`);
  return hay.includes(needle) || needle.includes(normPlace(mission.subsector));
}

export function countriesMatch(
  mission: Mission,
  country: string | null | undefined,
): boolean {
  const want = (country ?? "").trim();
  if (!want) return true;
  return countriesEquivalent(mission.country, want);
}
