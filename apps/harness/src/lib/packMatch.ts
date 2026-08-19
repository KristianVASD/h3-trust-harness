import { countriesEquivalent, isLocalDirectoryMission, type Mission } from "@h3-trust/schema";

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
  if (!loc) return false;
  if (loc === "national" || loc === "nationwide") return true;
  if (countriesEquivalent(mission.location, mission.country)) return true;
  return false;
}

export function missionMatchesPackTrade(
  mission: Mission,
  parsed: { sector?: string; country?: string },
  aliasHit: (hay: string, needle: string) => boolean,
): boolean {
  if (parsed.country && !countriesEquivalent(mission.country ?? "", parsed.country)) {
    return false;
  }
  if (!parsed.sector) return true;
  if (isLocalDirectoryMission(mission)) return false;
  const hay = normalizePackLabel(`${mission.subsector} ${mission.sector}`);
  return aliasHit(hay, parsed.sector);
}
