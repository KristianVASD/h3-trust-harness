import { randomUUID } from "node:crypto";
import {
  DEFAULT_SEARCH_PLAN_VERSION,
  LOCAL_DIRECTORY_SECTOR,
  LOCAL_DIRECTORY_SUBSECTOR,
  buildCompanyIndexes,
  countClusterHits,
  countriesEquivalent,
  findCompanyMatchIndex,
  isLocalDirectoryMission,
  isMixedSourceCategory,
  type Company,
  type Mission,
  type Producer,
  type ServiceContext,
  type Source,
} from "@h3-trust/schema";
import type { Store } from "@h3-trust/store";
import {
  CompanyImportError,
  importCompaniesForMission,
  mergeCompany,
  type CompanyImportRow,
} from "./companies-import-route.js";
import { countriesMatch, isNationalPack } from "./pack-match.js";
import type { ClassifyRow } from "@h3-trust/schema/omega";

const defaultPhases: Mission["phases"] = [
  { key: "observation", status: "active" },
  { key: "hypothesis", status: "waiting" },
  { key: "evidence", status: "waiting" },
  { key: "cara", status: "waiting" },
  { key: "patterns", status: "waiting" },
  { key: "companies", status: "waiting" },
  { key: "deep_check", status: "waiting" },
];

export async function ensureLocalDirectoryMission(
  store: Store,
  country: string,
): Promise<{ mission: Mission; created: boolean }> {
  const missions = await store.listMissions();
  const existing = missions.find(
    (m) =>
      isLocalDirectoryMission(m) &&
      countriesEquivalent(m.country, country) &&
      isNationalPack(m),
  );
  if (existing) return { mission: existing, created: false };

  const now = new Date().toISOString();
  const mission: Mission = {
    id: randomUUID(),
    location: country,
    country,
    sector: LOCAL_DIRECTORY_SECTOR,
    subsector: LOCAL_DIRECTORY_SUBSECTOR,
    goal: `Country local directory for ${country} — mixed-list bijvangst (unknown until sector match or CARA classify).`,
    notes: "Not a town mission. Mixed OV/sportclub rows land here when they are not yet a painter/electrician/…",
    search_plan_version: DEFAULT_SEARCH_PLAN_VERSION,
    discoveryBrief: {
      approach: "Stack local presence; classify potentials; CARA promotes onto sector packs.",
      candidateListTypes: ["local_business_association", "sponsorship"],
      successCriteria: "Unknowns stack; sector search stays clean.",
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
  return { mission: await store.upsertMission(mission), created: true };
}

export type StackedImportResult = {
  matched: number;
  createdUnknown: number;
  skipped: number;
  clusterHits: number;
  warnings: string[];
  created?: number;
  updated?: number;
};

/**
 * Mixed list: badge existing firms on every national sector pack in the country;
 * unmatched rows become status=unknown in the NL local directory.
 */
export async function importStackedMixedList(
  store: Store,
  args: {
    country: string;
    sourceId: string;
    listLabel: string;
    rows: CompanyImportRow[];
    producer?: Producer;
    place?: string;
    serviceContexts?: ServiceContext[];
  },
): Promise<StackedImportResult> {
  const producer: Producer = args.producer ?? "Human";
  const source = await store.get("sources", args.sourceId);
  if (!source) throw new CompanyImportError("Source not found", 404);
  if (source.status !== "accepted" && source.status !== "adjusted") {
    throw new CompanyImportError(
      "Source must be CURAD-accepted or adjusted before list import",
      400,
    );
  }

  const missions = await store.listMissions();
  const sectorPacks = missions.filter(
    (m) =>
      countriesMatch(m, args.country) &&
      isNationalPack(m) &&
      !isLocalDirectoryMission(m),
  );
  const { mission: directory } = await ensureLocalDirectoryMission(
    store,
    args.country,
  );
  await store.linkSourceToMission(directory.id, args.sourceId, producer);

  type PackState = { mission: Mission; companies: Company[] };
  const packs: PackState[] = [];
  for (const mission of sectorPacks) {
    const companies = (await store.listByMission(
      "companies",
      mission.id,
    )) as Company[];
    packs.push({ mission, companies });
  }

  let matched = 0;
  let createdUnknown = 0;
  let skipped = 0;
  const now = new Date().toISOString();
  const label = args.listLabel.trim() || source.name;
  const unmatched: CompanyImportRow[] = [];

  for (const row of args.rows) {
    const name = (row.name ?? "").trim();
    if (!name) {
      skipped += 1;
      continue;
    }
    let hit = false;
    for (const pack of packs) {
      const indexes = buildCompanyIndexes(pack.companies);
      const idx = findCompanyMatchIndex(row, indexes);
      if (idx == null) continue;
      await store.linkSourceToMission(pack.mission.id, args.sourceId, producer);
      const current = pack.companies[idx]!;
      const next = mergeCompany(current, {
        sourceId: args.sourceId,
        label,
        address: (row.address ?? "").trim(),
        region: (row.region ?? "").trim(),
        sector: (row.sector ?? "").trim(),
        kvk_number: row.kvk_number,
        website_url: row.website_url,
        specialism: row.specialism,
        incomingCaps: [],
        phone: row.phone,
        email: row.email,
        serviceContexts: args.serviceContexts,
        now,
      });
      const saved = (await store.upsert("companies", next)) as Company;
      pack.companies[idx] = saved;
      matched += 1;
      hit = true;
      break;
    }
    if (!hit) unmatched.push(row);
  }

  if (unmatched.length) {
    const dirImport = await importCompaniesForMission(store, {
      missionId: directory.id,
      sourceId: args.sourceId,
      listLabel: label,
      rows: unmatched,
      producer,
      status: "unknown",
    });
    createdUnknown = dirImport.created;
    matched += dirImport.updated;
    skipped += dirImport.skipped;
  }

  const clusterHits = args.place
    ? countClusterHits(args.rows, args.place)
    : 0;

  return {
    matched,
    createdUnknown,
    skipped,
    clusterHits,
    warnings: [],
  };
}

/**
 * Niche sector list: create/merge on this pack, and pull matching directory
 * unknowns onto the pack (sector list proves the trade).
 */
export async function importNicheForPack(
  store: Store,
  args: {
    missionId: string;
    country: string;
    sourceId: string;
    listLabel: string;
    rows: CompanyImportRow[];
    producer?: Producer;
    place?: string;
    serviceContexts?: ServiceContext[];
  },
): Promise<StackedImportResult> {
  const producer: Producer = args.producer ?? "Human";
  const base = await importCompaniesForMission(store, {
    missionId: args.missionId,
    sourceId: args.sourceId,
    listLabel: args.listLabel,
    rows: args.rows,
    producer,
    serviceContexts: args.serviceContexts,
  });

  const { mission: directory } = await ensureLocalDirectoryMission(
    store,
    args.country,
  );
  const dirCompanies = (await store.listByMission(
    "companies",
    directory.id,
  )) as Company[];
  const dirIndexes = buildCompanyIndexes(dirCompanies);
  const now = new Date().toISOString();
  let extraUpdated = 0;

  const packCompanies = (await store.listByMission(
    "companies",
    args.missionId,
  )) as Company[];
  const packIndexes = buildCompanyIndexes(packCompanies);

  for (const row of args.rows) {
    const dirIdx = findCompanyMatchIndex(row, dirIndexes);
    if (dirIdx == null) continue;
    const unknown = dirCompanies[dirIdx]!;
    const packIdx = findCompanyMatchIndex(row, packIndexes);
    if (packIdx == null) continue;
    const packCo = packCompanies[packIdx]!;
    const saved = (await store.upsert("companies", {
      ...packCo,
      source_ids: [
        ...new Set([
          ...(packCo.source_ids ?? []),
          ...(unknown.source_ids ?? []),
          args.sourceId,
        ]),
      ],
      list_membership: [
        ...new Set([
          ...(packCo.list_membership ?? []),
          ...(unknown.list_membership ?? []),
          args.listLabel,
        ]),
      ],
      updatedAt: now,
    })) as Company;
    packCompanies[packIdx] = saved;
    extraUpdated += 1;
    if (unknown.status === "unknown") {
      await store.upsert("companies", {
        ...unknown,
        status: "staged",
        updatedAt: now,
      });
    }
  }

  return {
    matched: base.updated + extraUpdated,
    createdUnknown: 0,
    skipped: base.skipped,
    clusterHits: args.place ? countClusterHits(args.rows, args.place) : 0,
    warnings: base.warnings,
    created: base.created,
    updated: base.updated + extraUpdated,
  };
}

export async function promoteUnknownToSectorPack(
  store: Store,
  args: {
    companyId: string;
    country: string;
    subsector: string;
    sector?: string;
    reviewer: string;
    reason?: string;
  },
): Promise<{ company: Company; mission: Mission }> {
  const company = (await store.get("companies", args.companyId)) as Company | null;
  if (!company) throw new CompanyImportError("Company not found", 404);
  if (company.status !== "unknown") {
    throw new CompanyImportError("Only unknown directory rows can be promoted", 400);
  }
  if (company.classify?.verdict !== "home_service") {
    throw new CompanyImportError(
      "CARA promote requires classify.verdict=home_service",
      400,
    );
  }

  const missions = await store.listMissions();
  const sub = args.subsector.trim().toLowerCase();
  const pack =
    missions.find(
      (m) =>
        countriesMatch(m, args.country) &&
        isNationalPack(m) &&
        !isLocalDirectoryMission(m) &&
        m.subsector.trim().toLowerCase() === sub,
    ) ??
    missions.find(
      (m) =>
        countriesMatch(m, args.country) &&
        isNationalPack(m) &&
        !isLocalDirectoryMission(m) &&
        `${m.subsector} ${m.sector}`.toLowerCase().includes(sub),
    );
  if (!pack) {
    throw new CompanyImportError(
      `No national pack for ${args.subsector} in ${args.country}`,
      404,
    );
  }

  const existing = (await store.listByMission("companies", pack.id)) as Company[];
  const indexes = buildCompanyIndexes(existing);
  const idx = findCompanyMatchIndex(company, indexes);
  const now = new Date().toISOString();
  let saved: Company;
  if (idx != null) {
    const match = existing[idx]!;
    saved = (await store.upsert("companies", {
      ...match,
      source_ids: [
        ...new Set([...(match.source_ids ?? []), ...(company.source_ids ?? [])]),
      ],
      list_membership: [
        ...new Set([
          ...(match.list_membership ?? []),
          ...(company.list_membership ?? []),
        ]),
      ],
      address: match.address || company.address,
      region: match.region || company.region,
      kvk_number: match.kvk_number || company.kvk_number,
      website_url: match.website_url || company.website_url,
      phone: match.phone || company.phone,
      email: match.email || company.email,
      updatedAt: now,
    })) as Company;
  } else {
    saved = (await store.upsert("companies", {
      ...company,
      id: randomUUID(),
      missionId: pack.id,
      status: "candidate",
      sector: company.sector || pack.subsector,
      producer: company.producer,
      createdAt: now,
      updatedAt: now,
    })) as Company;
  }

  await store.upsert("companies", {
    ...company,
    status: "staged",
    updatedAt: now,
  });

  await store.upsert("reviews", {
    id: randomUUID(),
    missionId: pack.id,
    producer: "Human",
    createdAt: now,
    updatedAt: now,
    v: 1,
    targetType: "company",
    targetId: saved.id,
    action: "agree",
    reason:
      args.reason?.trim() ||
      `CARA promote from local directory (${args.reviewer})`,
    valueTags: [],
    observationIds: [],
    hypothesisIds: [],
    evidenceIds: [],
    version: 1,
    fedBackToOmega: false,
  });

  return { company: saved, mission: pack };
}

export async function applyClassifyVerdicts(
  store: Store,
  missionId: string,
  verdicts: ClassifyRow[],
  producer: Producer = "OmegaClaw",
): Promise<{ updated: number; skipped: number }> {
  const companies = (await store.listByMission("companies", missionId)) as Company[];
  const byId = new Map(companies.map((c) => [c.id, c]));
  const byName = new Map(
    companies.map((c) => [c.name.trim().toLowerCase(), c]),
  );
  const now = new Date().toISOString();
  let updated = 0;
  let skipped = 0;
  for (const row of verdicts) {
    const target =
      (row.companyId ? byId.get(row.companyId) : undefined) ??
      byName.get(row.name.trim().toLowerCase());
    if (!target) {
      skipped += 1;
      continue;
    }
    const next: Company = {
      ...target,
      classify: {
        verdict: row.verdict,
        suggestedSubsector: row.suggestedSubsector,
        confidence: row.confidence,
        websiteChecked: row.websiteChecked,
        producer,
        updatedAt: now,
      },
      updatedAt: now,
    };
    await store.upsert("companies", next);
    updated += 1;
  }
  return { updated, skipped };
}

export type PeelMixedResult = {
  peeled: number;
  keptDoubles: number;
  skipped: number;
  directoryMissionId: string;
  mixedSourceNames: string[];
};

/**
 * Move companies that only have mixed-list badges (OV / sportclub / networking)
 * off a sector job into the country local directory as unknown.
 * Firms that also sit on a niche sector list (Vakwerk+, Echte Installateur, …) stay.
 */
export async function peelMixedOnlyFromMission(
  store: Store,
  args: { missionId: string; sourceId?: string },
): Promise<PeelMixedResult> {
  const mission = await store.getMission(args.missionId);
  if (!mission) throw new CompanyImportError("Mission not found", 404);
  if (isLocalDirectoryMission(mission)) {
    throw new CompanyImportError("Local directory is the destination, not a peel target", 400);
  }

  const missionSources = (await store.listByMission(
    "sources",
    args.missionId,
  )) as Source[];
  const companies = (await store.listByMission(
    "companies",
    args.missionId,
  )) as Company[];

  const sourceIds = new Set<string>();
  for (const co of companies) {
    for (const id of co.source_ids ?? []) sourceIds.add(id);
  }
  const sourceById = new Map(missionSources.map((s) => [s.id, s]));
  for (const id of sourceIds) {
    if (sourceById.has(id)) continue;
    const extra = (await store.get("sources", id)) as Source | null;
    if (extra) sourceById.set(id, extra);
  }

  const mixedOnJob = [...sourceById.values()].filter((s) =>
    args.sourceId ? s.id === args.sourceId : isMixedSourceCategory(s.category),
  );
  if (args.sourceId && mixedOnJob.length === 0) {
    const named = sourceById.get(args.sourceId);
    if (named) mixedOnJob.push(named);
  }
  if (mixedOnJob.length === 0) {
    throw new CompanyImportError(
      "No mixed list (OV / sportclub / networking) on this job",
      400,
    );
  }
  const peelSourceIds = new Set(mixedOnJob.map((s) => s.id));

  function isNicheSource(sourceId: string): boolean {
    const src = sourceById.get(sourceId);
    if (!src) return true;
    if (peelSourceIds.has(sourceId)) return false;
    return !isMixedSourceCategory(src.category);
  }

  const { mission: directory } = await ensureLocalDirectoryMission(
    store,
    mission.country,
  );
  for (const src of mixedOnJob) {
    await store.linkSourceToMission(directory.id, src.id, "ImportedDataset");
  }

  const dirCompanies = (await store.listByMission(
    "companies",
    directory.id,
  )) as Company[];
  let dirIndexList = [...dirCompanies];
  let indexes = buildCompanyIndexes(dirIndexList);

  const now = new Date().toISOString();
  let peeled = 0;
  let keptDoubles = 0;
  let skipped = 0;

  for (const company of companies) {
    const ids = company.source_ids ?? [];
    const onMixed = ids.some((id) => peelSourceIds.has(id));
    const onNiche = ids.some((id) => isNicheSource(id));
    if (!onMixed) {
      skipped += 1;
      continue;
    }
    if (onNiche) {
      keptDoubles += 1;
      continue;
    }

    const matchIdx = findCompanyMatchIndex(company, indexes);
    if (matchIdx != null) {
      const existing = dirIndexList[matchIdx]!;
      const merged = mergeCompany(existing, {
        sourceId: ids[0] ?? mixedOnJob[0]!.id,
        label: (company.list_membership ?? [])[0] ?? mixedOnJob[0]!.name,
        address: company.address,
        region: company.region,
        sector: company.sector,
        kvk_number: company.kvk_number,
        website_url: company.website_url,
        specialism: company.specialism,
        incomingCaps: [],
        phone: company.phone,
        email: company.email,
        now,
      });
      const saved = (await store.upsert("companies", {
        ...merged,
        source_ids: [...new Set([...(existing.source_ids ?? []), ...ids])],
        list_membership: [
          ...new Set([
            ...(existing.list_membership ?? []),
            ...(company.list_membership ?? []),
          ]),
        ],
        status: "unknown",
        updatedAt: now,
      })) as Company;
      dirIndexList[matchIdx] = saved;
      indexes = buildCompanyIndexes(dirIndexList);
      if (company.id !== saved.id) {
        await store.remove("companies", company.id);
      }
    } else {
      const moved = (await store.upsert("companies", {
        ...company,
        missionId: directory.id,
        status: "unknown",
        updatedAt: now,
      })) as Company;
      dirIndexList.push(moved);
      indexes = buildCompanyIndexes(dirIndexList);
    }
    peeled += 1;
  }

  return {
    peeled,
    keptDoubles,
    skipped,
    directoryMissionId: directory.id,
    mixedSourceNames: mixedOnJob.map((s) => s.name),
  };
}
