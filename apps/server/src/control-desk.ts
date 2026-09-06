import {
  DISCOVERY_CHANNELS,
  HOME_MAINTENANCE_SECTOR,
  TRADE_IDS,
  countriesEquivalent,
  countrySlug,
  displayCountry,
  isIdentityTool,
  isLocalDirectoryMission,
  packMatchesTrade,
  tradeLabel,
  type Mission,
  type NationLandscape,
  type Source,
  type TradeId,
} from "@h3-trust/schema";
import type { Store } from "@h3-trust/store";
import type { SearchDemandAggregate } from "./auth.js";
import { isNationalPack } from "./pack-match.js";
import type { WorkerEvent, WorkerRun } from "./worker-progress.js";

const ACTIVITY_CAP = 5;

export type ControlDoorRow = {
  key: string;
  country: string;
  sector: string;
  subsector: string;
  tradeId?: TradeId;
  tradeLabel?: string;
  companyCount: number;
  missionCount: number;
  trustedCount: number;
  nationalSourceCount: number;
  localSourceCount: number;
  searchable: boolean;
  status: "searchable" | "needs_overlay" | "lists_found" | "empty";
  sourceCount: number;
  trustListCount: number;
  identityToolCount: number;
  nationalPackId?: string;
  directory?: boolean;
  listNames: string[];
};

export type ControlJobRow = {
  id: string;
  location: string;
  country: string;
  sector: string;
  subsector: string;
  goal: string;
  companyCount: number;
  trustedCount: number;
  trustListCount: number;
  identityToolCount: number;
  listNames: string[];
  nationalPack: boolean;
  directory: boolean;
  updatedAt: string;
};

export type ControlCountryRow = {
  country: string;
  countrySlug: string;
  doorsFilled: number;
  doorTotal: number;
  companyCount: number;
  listCount: number;
  landscapeStatus: NationLandscape["status"] | "none";
  lastRun: Pick<
    WorkerRun,
    "id" | "status" | "progress_pct" | "current_action" | "updated_at"
  > | null;
};

export type ListStyleSource = {
  id: string;
  name: string;
  category: string;
  scope: string;
  status: string;
  suggestedWeight?: number;
  url?: string;
  listUrl?: string;
  listPattern?: string;
  identityTool?: boolean;
};

export type ListStyleGroup = {
  layer: string;
  category: string;
  title: string;
  sources: ListStyleSource[];
};

function isDeskMission(mission: Mission): boolean {
  return isNationalPack(mission) || isLocalDirectoryMission(mission);
}

function missionsForCountry(missions: Mission[], country: string): Mission[] {
  return missions.filter((m) => countriesEquivalent(m.country, country));
}

function packStatus(args: {
  companyCount: number;
  trustListCount: number;
  localSourceCount: number;
  directory: boolean;
  hasNationalCompanies: boolean;
}): ControlDoorRow["status"] {
  if (args.companyCount === 0) {
    return args.trustListCount > 0 ? "lists_found" : "empty";
  }
  if (args.directory) return "searchable";
  if (args.hasNationalCompanies && args.localSourceCount === 0) {
    return "needs_overlay";
  }
  return "searchable";
}

async function missionStats(
  store: Store,
  mission: Mission,
): Promise<{
  companyCount: number;
  sourceCount: number;
  trustedCount: number;
  trustListCount: number;
  identityToolCount: number;
  nationalSourceCount: number;
  localSourceCount: number;
  listNames: string[];
}> {
  const [companyCount, sources] = await Promise.all([
    store.countByMission("companies", mission.id),
    store.summarizeSourcesForMission(mission.id),
  ]);
  return {
    companyCount,
    sourceCount: sources.sourceCount,
    trustedCount: sources.trustedCount,
    trustListCount: sources.trustListCount,
    identityToolCount: sources.identityToolCount,
    nationalSourceCount: sources.nationalSourceCount,
    localSourceCount: sources.localSourceCount,
    listNames: sources.trustListNames,
  };
}

async function toJobRow(store: Store, mission: Mission): Promise<ControlJobRow> {
  const stats = await missionStats(store, mission);
  return {
    id: mission.id,
    location: mission.location,
    country: mission.country,
    sector: mission.sector,
    subsector: mission.subsector,
    goal: mission.goal,
    companyCount: stats.companyCount,
    trustedCount: stats.trustedCount,
    trustListCount: stats.trustListCount,
    identityToolCount: stats.identityToolCount,
    listNames: stats.listNames,
    nationalPack: isNationalPack(mission),
    directory: isLocalDirectoryMission(mission),
    updatedAt: mission.updatedAt,
  };
}

export async function buildCountryIndex(
  store: Store,
  landscapes: NationLandscape[],
  lastRuns: Map<string, WorkerRun>,
): Promise<ControlCountryRow[]> {
  const missions = await store.listMissions();
  const slugs = new Map<string, { display: string; missions: Mission[] }>();

  for (const mission of missions) {
    const slug = countrySlug(mission.country);
    const existing = slugs.get(slug);
    if (existing) {
      existing.missions.push(mission);
      continue;
    }
    slugs.set(slug, {
      display: displayCountry(mission.country),
      missions: [mission],
    });
  }
  for (const landscape of landscapes) {
    if (!slugs.has(landscape.countrySlug)) {
      slugs.set(landscape.countrySlug, {
        display: landscape.country,
        missions: [],
      });
    }
  }

  const rows: ControlCountryRow[] = [];
  for (const [slug, group] of slugs) {
    const desk = group.missions.filter(isDeskMission);
    let companyCount = 0;
    let listCount = 0;
    const filled = new Set<string>();
    for (const mission of desk) {
      const stats = await missionStats(store, mission);
      companyCount += stats.companyCount;
      listCount += stats.trustedCount;
      if (isLocalDirectoryMission(mission)) continue;
      for (const tradeId of TRADE_IDS) {
        if (
          packMatchesTrade(mission.subsector, tradeId) &&
          (stats.companyCount > 0 || stats.sourceCount > 0)
        ) {
          filled.add(tradeId);
        }
      }
    }
    const landscape = landscapes.find((l) => l.countrySlug === slug);
    const run = lastRuns.get(slug) ?? null;
    rows.push({
      country: group.display,
      countrySlug: slug,
      doorsFilled: filled.size,
      doorTotal: TRADE_IDS.length,
      companyCount,
      listCount,
      landscapeStatus: landscape?.status ?? "none",
      lastRun: run
        ? {
            id: run.id,
            status: run.status,
            progress_pct: run.progress_pct,
            current_action: run.current_action,
            updated_at: run.updated_at,
          }
        : null,
    });
  }

  return rows.sort((a, b) => a.country.localeCompare(b.country));
}

export async function buildCountryDoors(
  store: Store,
  country: string,
): Promise<{ doors: ControlDoorRow[]; directory?: ControlDoorRow }> {
  const missions = missionsForCountry(await store.listMissions(), country);
  const doors: ControlDoorRow[] = [];

  for (const tradeId of TRADE_IDS) {
    const matching = missions.filter(
      (m) =>
        isDeskMission(m) &&
        !isLocalDirectoryMission(m) &&
        packMatchesTrade(m.subsector, tradeId),
    );
    if (!matching.length) {
      doors.push({
        key: `${countrySlug(country)}|door|${tradeId}`,
        country: displayCountry(country),
        sector: HOME_MAINTENANCE_SECTOR,
        subsector: tradeId,
        tradeId,
        tradeLabel: tradeLabel(tradeId),
        companyCount: 0,
        sourceCount: 0,
        missionCount: 0,
        trustedCount: 0,
        trustListCount: 0,
        identityToolCount: 0,
        nationalSourceCount: 0,
        localSourceCount: 0,
        searchable: false,
        status: "empty",
        listNames: [],
      });
      continue;
    }
    let companyCount = 0;
    let sourceCount = 0;
    let trustedCount = 0;
    let trustListCount = 0;
    let identityToolCount = 0;
    let nationalSourceCount = 0;
    let localSourceCount = 0;
    const listNames: string[] = [];
    let nationalPackId: string | undefined;
    let hasNationalCompanies = false;
    for (const mission of matching) {
      const stats = await missionStats(store, mission);
      companyCount += stats.companyCount;
      sourceCount += stats.sourceCount;
      trustedCount += stats.trustedCount;
      trustListCount += stats.trustListCount;
      identityToolCount += stats.identityToolCount;
      nationalSourceCount += stats.nationalSourceCount;
      localSourceCount += stats.localSourceCount;
      listNames.push(...stats.listNames);
      if (isNationalPack(mission)) {
        nationalPackId = mission.id;
        if (stats.companyCount > 0) hasNationalCompanies = true;
      }
    }
    const status = packStatus({
      companyCount,
      trustListCount,
      localSourceCount,
      directory: false,
      hasNationalCompanies,
    });
    doors.push({
      key: `${countrySlug(country)}|door|${tradeId}`,
      country: displayCountry(country),
      sector: HOME_MAINTENANCE_SECTOR,
      subsector: tradeId,
      tradeId,
      tradeLabel: tradeLabel(tradeId),
      companyCount,
      sourceCount,
      missionCount: matching.length,
      trustedCount,
      trustListCount,
      identityToolCount,
      nationalSourceCount,
      localSourceCount,
      searchable: companyCount > 0,
      status,
      nationalPackId,
      listNames: [...new Set(listNames)],
    });
  }

  const directoryMission = missions.find((m) => isLocalDirectoryMission(m));
  let directory: ControlDoorRow | undefined;
  if (directoryMission) {
    const stats = await missionStats(store, directoryMission);
    directory = {
      key: `${countrySlug(country)}|directory`,
      country: displayCountry(country),
      sector: directoryMission.sector,
      subsector: directoryMission.subsector,
      companyCount: stats.companyCount,
      sourceCount: stats.sourceCount,
      missionCount: 1,
      trustedCount: stats.trustedCount,
      trustListCount: stats.trustListCount,
      identityToolCount: stats.identityToolCount,
      nationalSourceCount: stats.nationalSourceCount,
      localSourceCount: stats.localSourceCount,
      searchable: stats.companyCount > 0,
      status: "searchable",
      directory: true,
      nationalPackId: directoryMission.id,
      listNames: stats.listNames,
    };
  }

  return { doors, directory };
}

export async function listDeskJobs(
  store: Store,
  country: string,
  tradeId?: string,
): Promise<ControlJobRow[]> {
  const missions = missionsForCountry(await store.listMissions(), country).filter(
    (m) => {
      if (!isDeskMission(m)) return false;
      if (!tradeId) return true;
      if (isLocalDirectoryMission(m)) return true;
      return packMatchesTrade(m.subsector, tradeId);
    },
  );
  const rows = await Promise.all(missions.map((m) => toJobRow(store, m)));
  return rows
    .sort((a, b) => {
      if (b.companyCount !== a.companyCount) return b.companyCount - a.companyCount;
      return b.updatedAt.localeCompare(a.updatedAt);
    })
    .slice(0, ACTIVITY_CAP);
}

export function capDemands(
  aggregates: SearchDemandAggregate[],
  country: string,
  what?: string,
): SearchDemandAggregate[] {
  return [...aggregates]
    .filter((d) => {
      if (d.country && !countriesEquivalent(d.country, country)) return false;
      if (!what) return true;
      return packMatchesTrade(d.what, what) || d.what.toLowerCase().includes(what);
    })
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return b.lastAt.localeCompare(a.lastAt);
    })
    .slice(0, ACTIVITY_CAP);
}

export function capEvents(events: WorkerEvent[]): WorkerEvent[] {
  return [...events]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, ACTIVITY_CAP);
}

export async function buildDoorListStyles(
  store: Store,
  country: string,
  tradeId: TradeId,
): Promise<{
  door: ControlDoorRow;
  groups: ListStyleGroup[];
  directorySources: ListStyleSource[];
}> {
  const { doors, directory } = await buildCountryDoors(store, country);
  const door = doors.find((d) => d.tradeId === tradeId) ?? doors[0]!;
  const missions = missionsForCountry(await store.listMissions(), country).filter(
    (m) =>
      isDeskMission(m) &&
      (isLocalDirectoryMission(m) || packMatchesTrade(m.subsector, tradeId)),
  );

  const sources: Source[] = [];
  for (const mission of missions) {
    if (isLocalDirectoryMission(mission)) continue;
    sources.push(...(await store.listByMission("sources", mission.id)));
  }
  const seen = new Set<string>();
  const unique = sources.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });

  const groups: ListStyleGroup[] = DISCOVERY_CHANNELS.map((ch) => ({
    layer: ch.layer,
    category: ch.category,
    title: ch.title,
    sources: unique
      .filter((s) => s.scope === ch.layer && s.category === ch.category)
      .map(toStyleSource),
  }));

  const leftover = unique.filter(
    (s) =>
      !DISCOVERY_CHANNELS.some(
        (ch) => ch.layer === s.scope && ch.category === s.category,
      ),
  );
  if (leftover.length) {
    groups.push({
      layer: "local",
      category: "other",
      title: "Other list styles",
      sources: leftover.map(toStyleSource),
    });
  }

  let directorySources: ListStyleSource[] = [];
  if (directory?.nationalPackId) {
    const dirSources = await store.listByMission("sources", directory.nationalPackId);
    directorySources = dirSources.map(toStyleSource);
  }

  return { door, groups, directorySources };
}

function toStyleSource(source: Source): ListStyleSource {
  const listPattern = source.extractionGuide?.listPattern;
  return {
    id: source.id,
    name: source.name,
    category: source.category,
    scope: source.scope,
    status: source.status,
    suggestedWeight: source.suggestedWeight,
    url: source.url,
    listUrl: source.listUrl,
    listPattern,
    identityTool: isIdentityTool({
      category: source.category,
      listPattern,
    }),
  };
}

export { ACTIVITY_CAP };
