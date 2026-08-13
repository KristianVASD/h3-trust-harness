import type { Mission } from "@h3-trust/schema";

export function normalizePackLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isNationalPack(mission: Mission): boolean {
  const loc = normalizePackLabel(mission.location);
  const country = normalizePackLabel(mission.country);
  if (!loc) return false;
  if (loc === "national" || loc === "nationwide" || loc === "nl") return true;
  if (country && (loc === country || country.includes(loc) || loc.includes(country))) {
    return true;
  }
  return false;
}

export function missionMatchesPackTrade(
  mission: Mission,
  parsed: { sector?: string; country?: string },
  aliasHit: (hay: string, needle: string) => boolean,
): boolean {
  const countryOk = parsed.country
    ? (() => {
        const want = normalizePackLabel(parsed.country);
        const have = normalizePackLabel(mission.country ?? "");
        return (
          have === want || have.includes(want) || want.includes(have)
        );
      })()
    : true;
  if (!countryOk) return false;
  if (!parsed.sector) return true;
  const hay = normalizePackLabel(`${mission.subsector} ${mission.sector}`);
  return aliasHit(hay, parsed.sector);
}
