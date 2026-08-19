import { randomUUID } from "node:crypto";
import {
  DEFAULT_SEARCH_PLAN_VERSION,
  SOURCE_CATEGORIES,
  countClusterHits,
  defaultAudienceForCategory,
  defaultWeightForList,
  isMixedSourceCategory,
  type Mission,
  type ServiceContext,
  type Source,
  type SourceCategory,
  type SourceScope,
  type SourceType,
} from "@h3-trust/schema";
import type { Store } from "@h3-trust/store";
import {
  importCompaniesForMission,
  type CompanyImportRow,
} from "./companies-import-route.js";
import { findNationalPackMission } from "./coverage-desk.js";
import { isNationalPack } from "./pack-match.js";
import {
  ensureLocalDirectoryMission,
  importNicheForPack,
  importStackedMixedList,
} from "./stacked-import.js";

const defaultPhases: Mission["phases"] = [
  { key: "observation", status: "active" },
  { key: "hypothesis", status: "waiting" },
  { key: "evidence", status: "waiting" },
  { key: "cara", status: "waiting" },
  { key: "patterns", status: "waiting" },
  { key: "companies", status: "waiting" },
  { key: "deep_check", status: "waiting" },
];

export type PackOnboardInput = {
  country: string;
  sector: string;
  subsector: string;
  location?: string;
  goal?: string;
  source: {
    name: string;
    url?: string;
    layer: SourceScope;
    category: SourceCategory;
  };
  listLabel?: string;
  rows: CompanyImportRow[];
  mixed?: boolean;
  suggestedWeight?: number;
  defaultAudience?: ServiceContext;
};

function categoryToType(category: SourceCategory): SourceType {
  if (category === "registry") return "registry";
  if (
    category === "branch_association" ||
    category === "local_business_association" ||
    category === "networking_group"
  ) {
    return "association";
  }
  if (category === "municipal_initiative") return "municipality";
  if (category === "local_media") return "news";
  return "directory";
}

export class PackOnboardError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "PackOnboardError";
    this.status = status;
  }
}

export async function onboardCountrySectorPack(
  store: Store,
  input: PackOnboardInput,
): Promise<{
  mission: Mission;
  createdMission: boolean;
  source: Source;
  created: number;
  updated: number;
  skipped: number;
  nationalPack: boolean;
  mixed: boolean;
  createdUnknown: number;
  clusterHits: number;
  directoryMissionId?: string;
}> {
  const country = input.country.trim();
  const sector = input.sector.trim();
  const subsector = input.subsector.trim();
  if (!country || !sector || !subsector) {
    throw new PackOnboardError("country, sector, and subsector are required", 400);
  }
  if (!input.source?.name?.trim()) {
    throw new PackOnboardError("source.name is required", 400);
  }
  if (!SOURCE_CATEGORIES.includes(input.source.category as (typeof SOURCE_CATEGORIES)[number])) {
    throw new PackOnboardError("source.category is not a known list type", 400);
  }

  const overlayPlace = (input.location ?? "").trim();
  const mixed =
    input.mixed === true || isMixedSourceCategory(input.source.category);
  const missions = await store.listMissions();
  let mission = findNationalPackMission(missions, { country, sector, subsector });
  let createdMission = false;
  const now = new Date().toISOString();

  if (!mission) {
    mission = {
      id: randomUUID(),
      location: country,
      country,
      sector,
      subsector,
      goal:
        input.goal?.trim() ||
        `National ${subsector} base layer for ${country}.`,
      notes: "National pack — local lists attach here (source.region). Not a town mission.",
      search_plan_version: DEFAULT_SEARCH_PLAN_VERSION,
      discoveryBrief: {
        approach: "Base layer first, attach local lists, then CARA.",
        candidateListTypes: [input.source.category],
        successCriteria: "Companies searchable from the pack; Align is optional.",
        producer: "Human",
        updatedAt: now,
      },
      phases: defaultPhases,
      producer: "Human",
      origin: "human",
      createdAt: now,
      updatedAt: now,
      v: 1,
    };
    mission = await store.upsertMission(mission);
    createdMission = true;
  }

  const layer = input.source.layer;
  const sourceName = input.source.name.trim();
  const weight =
    input.suggestedWeight ?? defaultWeightForList(input.source.category, layer);
  const existingSources = (await store.listByMission(
    "sources",
    mission.id,
  )) as Source[];
  let source = existingSources.find(
    (s) => s.name.trim().toLowerCase() === sourceName.toLowerCase(),
  );

  if (!source) {
    source = await store.createSourceInMission(mission.id, {
      id: randomUUID(),
      producer: "ImportedDataset",
      createdAt: now,
      updatedAt: now,
      v: 1,
      first_seen_mission: mission.id,
      reused_in_missions: [],
      name: sourceName,
      type: categoryToType(input.source.category),
      category: input.source.category,
      scope: layer,
      region: layer === "national" ? "" : overlayPlace,
      url: input.source.url?.trim() || undefined,
      listUrl: input.source.url?.trim() || undefined,
      reason: "Bulk pack onboard — accepted as imported dataset; CARA may adjust later.",
      suggestedWeight: weight,
      suggestedConfidence: weight,
      signalIds: [],
      evidenceIds: [],
      status: "accepted",
      notes: "ImportedDataset — Align later to lock trust weight.",
      sourceFields: [],
      probeStatus: "unprobed",
    });
  }

  const audience =
    input.defaultAudience ?? defaultAudienceForCategory(input.source.category);
  const serviceContexts = audience ? [audience] : undefined;
  const rows = input.rows ?? [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let createdUnknown = 0;
  let directoryMissionId: string | undefined;

  if (mixed) {
    const dir = await ensureLocalDirectoryMission(store, country);
    directoryMissionId = dir.mission.id;
    await store.linkSourceToMission(dir.mission.id, source.id, "ImportedDataset");
    if (rows.length) {
      const stacked = await importStackedMixedList(store, {
        country,
        sourceId: source.id,
        listLabel: input.listLabel?.trim() || source.name,
        rows,
        producer: "ImportedDataset",
        place: overlayPlace,
        serviceContexts,
      });
      updated = stacked.matched;
      createdUnknown = stacked.createdUnknown;
      skipped = stacked.skipped;
    }
  } else if (rows.length) {
    const niche = await importNicheForPack(store, {
      missionId: mission.id,
      country,
      sourceId: source.id,
      listLabel: input.listLabel?.trim() || source.name,
      rows,
      producer: "ImportedDataset",
      place: overlayPlace,
      serviceContexts,
    });
    created = niche.created ?? 0;
    updated = niche.updated ?? niche.matched;
    skipped = niche.skipped;
  } else {
    const empty = await importCompaniesForMission(store, {
      missionId: mission.id,
      sourceId: source.id,
      listLabel: input.listLabel?.trim() || source.name,
      rows: [],
      producer: "ImportedDataset",
      serviceContexts,
    });
    skipped = empty.skipped;
  }

  const clusterHits = overlayPlace ? countClusterHits(rows, overlayPlace) : 0;

  return {
    mission,
    createdMission,
    source,
    created,
    updated,
    skipped,
    nationalPack: isNationalPack(mission),
    mixed,
    createdUnknown,
    clusterHits,
    directoryMissionId,
  };
}
