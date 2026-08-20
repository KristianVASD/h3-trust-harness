import { countriesEquivalent, isLocalDirectoryMission, type Mission, type Source } from "@h3-trust/schema";
import type { Store } from "@h3-trust/store";
import { countriesMatch, isNationalPack, packKey } from "./pack-match.js";

export type CoverageMissionRow = {
  id: string;
  location: string;
  country: string;
  sector: string;
  subsector: string;
  companyCount: number;
  trustedCount: number;
  listNames: string[];
  nationalSourceCount: number;
  localSourceCount: number;
  nationalPack: boolean;
  updatedAt: string;
  origin?: Mission["origin"];
};

export type CoveragePackRow = {
  key: string;
  country: string;
  sector: string;
  subsector: string;
  companyCount: number;
  missionCount: number;
  trustedCount: number;
  nationalSourceCount: number;
  localSourceCount: number;
  searchable: boolean;
  status: "searchable" | "needs_overlay" | "empty";
  missions: CoverageMissionRow[];
};

function isTrusted(source: Source): boolean {
  return source.status === "accepted" || source.status === "adjusted";
}

export async function buildCoverageDesk(
  store: Store,
): Promise<{ packs: CoveragePackRow[]; missions: CoverageMissionRow[] }> {
  const missions = await store.listMissions();
  const rows: CoverageMissionRow[] = [];

  for (const mission of missions) {
    const [sources, companies] = await Promise.all([
      store.listByMission("sources", mission.id),
      store.listByMission("companies", mission.id),
    ]);
    const trusted = sources.filter(isTrusted);
    const nationalSourceCount = trusted.filter((s) => s.scope === "national").length;
    const localSourceCount = trusted.filter(
      (s) => s.scope === "local" || s.scope === "regional",
    ).length;
    rows.push({
      id: mission.id,
      location: mission.location,
      country: mission.country,
      sector: mission.sector,
      subsector: mission.subsector,
      companyCount: companies.length,
      trustedCount: trusted.length,
      listNames: trusted.map((s) => s.name),
      nationalSourceCount,
      localSourceCount,
      nationalPack: isNationalPack(mission),
      updatedAt: mission.updatedAt,
      origin: mission.origin,
    });
  }

  const byPack = new Map<string, CoveragePackRow>();
  for (const row of rows) {
    const mission = missions.find((m) => m.id === row.id)!;
    const key = packKey(mission);
    const existing = byPack.get(key);
    if (!existing) {
      byPack.set(key, {
        key,
        country: row.country,
        sector: row.sector,
        subsector: row.subsector,
        companyCount: row.companyCount,
        missionCount: 1,
        trustedCount: row.trustedCount,
        nationalSourceCount: row.nationalSourceCount,
        localSourceCount: row.localSourceCount,
        searchable: row.companyCount > 0,
        status: "empty",
        missions: [row],
      });
      continue;
    }
    existing.companyCount += row.companyCount;
    existing.missionCount += 1;
    existing.trustedCount += row.trustedCount;
    existing.nationalSourceCount += row.nationalSourceCount;
    existing.localSourceCount += row.localSourceCount;
    existing.searchable = existing.companyCount > 0;
    existing.missions.push(row);
  }

  const packs = [...byPack.values()].map((pack) => {
    const sample = pack.missions[0];
    const directory = sample
      ? isLocalDirectoryMission({
          sector: pack.sector,
          subsector: pack.subsector,
        })
      : false;
    const hasNational = pack.missions.some((m) => m.nationalPack && m.companyCount > 0);
    const hasLocal = pack.localSourceCount > 0;
    let status: CoveragePackRow["status"] = "empty";
    if (pack.companyCount === 0) status = "empty";
    else if (directory) status = "searchable";
    else if (hasNational && !hasLocal) status = "needs_overlay";
    else status = "searchable";
    return { ...pack, status, searchable: pack.companyCount > 0 };
  });

  packs.sort((a, b) => b.companyCount - a.companyCount || a.country.localeCompare(b.country));

  return { packs, missions: rows };
}

export function findPackMission(
  missions: Mission[],
  input: { country: string; sector: string; subsector: string; location?: string },
): Mission | null {
  const loc = (input.location ?? "").trim();
  const country = input.country.trim();
  const subsector = input.subsector.trim();
  const sector = input.sector.trim();

  const sameTrade = (m: Mission) =>
    countriesMatch(m, country) &&
    m.subsector.trim().toLowerCase() === subsector.toLowerCase() &&
    m.sector.trim().toLowerCase() === sector.toLowerCase();

  return (
    missions.find((m) => sameTrade(m) && isNationalPack(m)) ??
    missions.find(
      (m) => sameTrade(m) && countriesEquivalent(m.location, country),
    ) ??
    (loc && !countriesEquivalent(loc, country) && loc.toLowerCase() !== "national"
      ? missions.find(
          (m) => sameTrade(m) && m.location.trim().toLowerCase() === loc.toLowerCase(),
        ) ?? null
      : null)
  );
}

/** Always the country × sector national pack — never a town mission. */
export function findNationalPackMission(
  missions: Mission[],
  input: { country: string; sector: string; subsector: string },
): Mission | null {
  return findPackMission(missions, {
    country: input.country,
    sector: input.sector,
    subsector: input.subsector,
    location: input.country,
  });
}
