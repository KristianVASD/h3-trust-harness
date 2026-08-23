import {
  countriesEquivalent,
  HOME_MAINTENANCE_SECTOR,
  TRADE_IDS,
  isLocalDirectoryMission,
  packMatchesTrade,
  primaryTradeId,
  tradeIdsForPackLabel,
  tradeLabel,
  type Mission,
  type Source,
  type TradeId,
} from "@h3-trust/schema";
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
  tradeId?: string;
  tradeLabel?: string;
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

function missionServesTrade(mission: {
  country: string;
  sector: string;
  subsector: string;
}, country: string, requested: string): boolean {
  if (!countriesEquivalent(mission.country, country) && mission.country !== country) {
    if (!countriesMatch(mission as Mission, country)) return false;
  } else if (!countriesEquivalent(mission.country, country)) {
    return false;
  }
  const wantIds = tradeIdsForPackLabel(requested);
  const packIds = tradeIdsForPackLabel(mission.subsector);
  if (wantIds.length && packIds.length) {
    return wantIds.some((id) => packIds.includes(id));
  }
  if (packMatchesTrade(mission.subsector, requested)) return true;
  return (
    mission.subsector.trim().toLowerCase() === requested.trim().toLowerCase()
  );
}

function packStatus(
  pack: Pick<
    CoveragePackRow,
    "companyCount" | "localSourceCount" | "sector" | "subsector" | "missions"
  >,
): CoveragePackRow["status"] {
  const sample = pack.missions[0];
  const directory = sample
    ? isLocalDirectoryMission({
        sector: pack.sector,
        subsector: pack.subsector,
      })
    : false;
  const hasNational = pack.missions.some((m) => m.nationalPack && m.companyCount > 0);
  const hasLocal = pack.localSourceCount > 0;
  if (pack.companyCount === 0) return "empty";
  if (directory) return "searchable";
  if (hasNational && !hasLocal) return "needs_overlay";
  return "searchable";
}

function emptyDoor(country: string, tradeId: TradeId): CoveragePackRow {
  return {
    key: `${country.toLowerCase()}|door|${tradeId}`,
    country,
    sector: HOME_MAINTENANCE_SECTOR,
    subsector: tradeId,
    tradeId,
    tradeLabel: tradeLabel(tradeId),
    companyCount: 0,
    missionCount: 0,
    trustedCount: 0,
    nationalSourceCount: 0,
    localSourceCount: 0,
    searchable: false,
    status: "empty",
    missions: [],
  };
}

function expandTradeDoors(
  rows: CoverageMissionRow[],
  missions: Mission[],
): CoveragePackRow[] {
  const countries = [
    ...new Set(
      rows
        .filter((r) => r.nationalPack && !isLocalDirectoryMission(r))
        .map((r) => r.country.trim())
        .filter(Boolean),
    ),
  ];
  if (!countries.length) countries.push("Netherlands");

  const byId = new Map(missions.map((m) => [m.id, m]));
  const doors: CoveragePackRow[] = [];

  for (const country of countries.sort((a, b) => a.localeCompare(b))) {
    for (const tradeId of TRADE_IDS) {
      const matching = rows.filter(
        (r) =>
          countriesEquivalent(r.country, country) &&
          !isLocalDirectoryMission(r) &&
          packMatchesTrade(r.subsector, tradeId),
      );
      if (!matching.length) {
        doors.push(emptyDoor(country, tradeId));
        continue;
      }
      const pack: CoveragePackRow = {
        key: `${country.toLowerCase()}|door|${tradeId}`,
        country,
        sector: HOME_MAINTENANCE_SECTOR,
        subsector: tradeId,
        tradeId,
        tradeLabel: tradeLabel(tradeId),
        companyCount: matching.reduce((s, r) => s + r.companyCount, 0),
        missionCount: matching.length,
        trustedCount: matching.reduce((s, r) => s + r.trustedCount, 0),
        nationalSourceCount: matching.reduce((s, r) => s + r.nationalSourceCount, 0),
        localSourceCount: matching.reduce((s, r) => s + r.localSourceCount, 0),
        searchable: false,
        status: "empty",
        missions: matching,
      };
      pack.status = packStatus(pack);
      pack.searchable = pack.companyCount > 0;
      doors.push(pack);
    }
  }

  const used = new Set(doors.flatMap((d) => d.missions.map((m) => m.id)));
  const leftovers = rows.filter(
    (r) => !used.has(r.id) && isLocalDirectoryMission(r),
  );
  const leftoverPacks: CoveragePackRow[] = [];
  for (const row of leftovers) {
    const mission = byId.get(row.id);
    leftoverPacks.push({
      key: mission ? packKey(mission) : `dir|${row.id}`,
      country: row.country,
      sector: row.sector,
      subsector: row.subsector,
      companyCount: row.companyCount,
      missionCount: 1,
      trustedCount: row.trustedCount,
      nationalSourceCount: row.nationalSourceCount,
      localSourceCount: row.localSourceCount,
      searchable: row.companyCount > 0,
      status: "searchable",
      missions: [row],
    });
  }

  return [...doors, ...leftoverPacks];
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

  return { packs: expandTradeDoors(rows, missions), missions: rows };
}

export function findPackMission(
  missions: Mission[],
  input: { country: string; sector: string; subsector: string; location?: string },
): Mission | null {
  const loc = (input.location ?? "").trim();
  const country = input.country.trim();
  const subsector = input.subsector.trim();

  const sameTrade = (m: Mission) => missionServesTrade(m, country, subsector);

  const exactSubsector = (m: Mission) =>
    m.subsector.trim().toLowerCase() === subsector.toLowerCase() ||
    primaryTradeId(m.subsector) === subsector.toLowerCase();

  const national = missions.filter((m) => sameTrade(m) && isNationalPack(m));
  const exactNational = national.find(exactSubsector);
  if (exactNational) return exactNational;
  if (national[0]) return national[0]!;

  const colocated = missions.filter(
    (m) => sameTrade(m) && countriesEquivalent(m.location, country),
  );
  const exactColocated = colocated.find(exactSubsector);
  if (exactColocated) return exactColocated;
  if (colocated[0]) return colocated[0]!;

  if (loc && !countriesEquivalent(loc, country) && loc.toLowerCase() !== "national") {
    return (
      missions.find(
        (m) =>
          sameTrade(m) &&
          m.location.trim().toLowerCase() === loc.toLowerCase() &&
          exactSubsector(m),
      ) ??
      missions.find(
        (m) =>
          sameTrade(m) && m.location.trim().toLowerCase() === loc.toLowerCase(),
      ) ??
      null
    );
  }
  return null;
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
