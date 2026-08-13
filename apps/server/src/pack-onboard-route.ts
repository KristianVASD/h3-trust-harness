import { randomUUID } from "node:crypto";
import {
  DEFAULT_SEARCH_PLAN_VERSION,
  SOURCE_CATEGORIES,
  type Mission,
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
import { findPackMission } from "./coverage-desk.js";
import { isNationalPack } from "./pack-match.js";

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

function defaultWeight(category: SourceCategory, layer: SourceScope): number {
  if (category === "registry") return 90;
  if (category === "quality_mark" || category === "sector_qualification") return 75;
  if (layer === "national") return 70;
  if (layer === "local") return 65;
  return 55;
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

  const location = (input.location ?? "").trim() || country;
  const missions = await store.listMissions();
  let mission = findPackMission(missions, {
    country,
    sector,
    subsector,
    location,
  });
  let createdMission = false;
  const now = new Date().toISOString();

  if (!mission) {
    const national = location.toLowerCase() === country.toLowerCase();
    mission = {
      id: randomUUID(),
      location,
      country,
      sector,
      subsector,
      goal:
        input.goal?.trim() ||
        (national
          ? `National ${subsector} base layer for ${country}.`
          : `Local overlay: ${subsector} in ${location}, ${country}.`),
      notes: national
        ? "National pack — onboarded as ImportedDataset. CARA can lock weights later."
        : "Local overlay pack — onboarded as ImportedDataset. CARA can lock weights later.",
      search_plan_version: DEFAULT_SEARCH_PLAN_VERSION,
      discoveryBrief: {
        approach: "Base layer first, then overlay, then CARA.",
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

  const sourceId = randomUUID();
  const layer = input.source.layer;
  const source = await store.createSourceInMission(mission.id, {
    id: sourceId,
    producer: "ImportedDataset",
    createdAt: now,
    updatedAt: now,
    v: 1,
    first_seen_mission: mission.id,
    reused_in_missions: [],
    name: input.source.name.trim(),
    type: categoryToType(input.source.category),
    category: input.source.category,
    scope: layer,
    region: layer === "national" ? "" : location,
    url: input.source.url?.trim() || undefined,
    listUrl: input.source.url?.trim() || undefined,
    reason: "Bulk pack onboard — accepted as imported dataset; CARA may adjust later.",
    suggestedWeight: defaultWeight(input.source.category, layer),
    suggestedConfidence: defaultWeight(input.source.category, layer),
    signalIds: [],
    evidenceIds: [],
    status: "accepted",
    notes: "ImportedDataset — Align later to lock trust weight.",
    sourceFields: [],
    probeStatus: "unprobed",
  });

  const importResult = await importCompaniesForMission(store, {
    missionId: mission.id,
    sourceId: source.id,
    listLabel: input.listLabel?.trim() || source.name,
    rows: input.rows ?? [],
    producer: "ImportedDataset",
  });

  return {
    mission,
    createdMission,
    source,
    created: importResult.created,
    updated: importResult.updated,
    skipped: importResult.skipped,
    nationalPack: isNationalPack(mission),
  };
}
