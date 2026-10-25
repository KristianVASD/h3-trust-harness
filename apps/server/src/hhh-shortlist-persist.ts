import { randomUUID } from "node:crypto";
import {
  CompanySchema,
  DEFAULT_SEARCH_PLAN_VERSION,
  PLACE_CELL_SUBSECTOR,
  PartnerTrustSchema,
  PlaceCellSchema,
  buildCompanyIndexes,
  countrySlug,
  displayCountry,
  factExpiry,
  findCompanyMatchIndex,
  foundFacts,
  placeCellSector,
  type Company,
  type GeminiFoundCompany,
  type HhhShortlistCompany,
  type Mission,
  type PartnerFact,
  type PartnerTrust,
  type PlaceCell,
  type ServiceContext,
} from "@h3-trust/schema";
import { isPostgresStore, type Store } from "@h3-trust/store";
import type { PlaceCellStore } from "./place-cell-store.js";
import type { CompanyAssessment } from "./company-assess.js";

const phases: Mission["phases"] = [
  { key: "observation", status: "active" },
  { key: "hypothesis", status: "waiting" },
  { key: "evidence", status: "waiting" },
  { key: "cara", status: "waiting" },
  { key: "patterns", status: "waiting" },
  { key: "companies", status: "waiting" },
  { key: "deep_check", status: "waiting" },
];

export type StoredAssessment = {
  name: string;
  website: string;
  signal: "in_category" | "not_listed";
  sourceUrl?: string;
  sourceName?: string;
  assessment: CompanyAssessment;
};

export async function loadTrustedCompanies(store: Store): Promise<Company[]> {
  const missions = await store.listMissions();
  const relevant = missions.filter(
    (mission) =>
      mission.subsector === PLACE_CELL_SUBSECTOR ||
      (mission.notes ?? "").includes("hhh-shortlist"),
  );
  const lists = await Promise.all(
    relevant.map((mission) => store.listByMission("companies", mission.id)),
  );
  return lists.flat().filter((company) => company.partnerTrust);
}

/**
 * One query for companies already stored for this place and trade.
 * Falls back to the full mission scan only when that query cannot run.
 */
export async function loadFoundCompaniesForPlace(
  store: Store,
  query: { tradeId: string; postcode4?: string; gemeente?: string },
): Promise<Company[]> {
  const trust: Record<string, string> = { status: "gevonden", tradeId: query.tradeId };
  if (query.postcode4) trust.postcode4 = query.postcode4;
  else if (query.gemeente) trust.gemeente = query.gemeente;
  else return loadTrustedCompanies(store);
  if (!isPostgresStore(store)) return loadTrustedCompanies(store);
  const { data, error } = await store.client
    .from("entities")
    .select("payload")
    .eq("collection", "companies")
    .contains("payload", { partnerTrust: trust })
    .limit(80);
  if (error || !data) return loadTrustedCompanies(store);
  return data.flatMap((row) => {
    const parsed = CompanySchema.safeParse((row as { payload?: unknown }).payload);
    return parsed.success && parsed.data.partnerTrust ? [parsed.data] : [];
  });
}

async function ensureMission(
  store: Store,
  cell: { id: string; label: string; missionId?: string },
): Promise<Mission> {
  if (cell.missionId) {
    const existing = await store.getMission(cell.missionId);
    if (existing) return existing;
  }
  const now = new Date().toISOString();
  return store.upsertMission({
    id: randomUUID(),
    location: cell.label,
    country: displayCountry("NL"),
    sector: placeCellSector(),
    subsector: PLACE_CELL_SUBSECTOR,
    goal: `HandyHouseHelp shortlist for ${cell.label}.`,
    notes: `hhh-shortlist:${cell.id}`,
    search_plan_version: DEFAULT_SEARCH_PLAN_VERSION,
    discoveryBrief: {
      approach: "Browser search, then local organisation sites, then a website check.",
      candidateListTypes: [],
      successCriteria: "Up to three companies that passed the website check.",
      producer: "ExternalAI",
      updatedAt: now,
    },
    phases,
    producer: "ExternalAI",
    origin: "human",
    createdAt: now,
    updatedAt: now,
    v: 1,
  });
}

export async function ensureShortlistCell(
  store: Store,
  cells: PlaceCellStore,
  place: {
    postcode4?: string;
    gemeente?: string;
    woonplaats?: string;
    placeLabel: string;
    lat: number;
    lon: number;
  },
): Promise<PlaceCell> {
  const slug = countrySlug("NL");
  const existing = (await cells.list()).find((cell) => {
    if (cell.countrySlug !== slug) return false;
    if (place.postcode4 && cell.postcode4 === place.postcode4) return true;
    if (!place.postcode4 && place.gemeente && cell.gemeente?.toLowerCase() === place.gemeente.toLowerCase()) {
      return true;
    }
    return false;
  });
  const mission = await ensureMission(store, {
    id: existing?.id ?? randomUUID(),
    label: place.placeLabel,
    missionId: existing?.missionId,
  });
  const now = new Date().toISOString();
  return cells.upsert(
    PlaceCellSchema.parse({
      ...(existing ?? {}),
      id: existing?.id ?? randomUUID(),
      country: displayCountry("NL"),
      countrySlug: slug,
      label: place.placeLabel,
      address: "",
      postcode4: place.postcode4,
      gemeente: place.gemeente,
      woonplaats: place.woonplaats,
      lat: place.lat,
      lon: place.lon,
      radiusKm: existing?.radiusKm ?? 15,
      missionId: mission.id,
      finishedStages: existing?.finishedStages ?? [],
      ecology: existing?.ecology ?? { ov: [], sport: [], festivity: [] },
      candidates: existing?.candidates ?? [],
      notes: existing?.notes ?? [],
      updatedAt: now,
    }),
  );
}

function trustFor(
  row: StoredAssessment,
  place: {
    postcode4?: string;
    gemeente?: string;
    woonplaats?: string;
    tradeId: string;
  },
  observedAt: string,
): PartnerTrust {
  const facts: PartnerFact[] = [
    {
      kind: "website",
      sourceUrl: row.website,
      observedAt,
      expiresAt: factExpiry(observedAt),
    },
  ];
  if (row.signal === "in_category" && row.sourceUrl) {
    facts.push({
      kind: "list_mention",
      sourceUrl: row.sourceUrl,
      observedAt,
      expiresAt: factExpiry(observedAt),
      sourceName: row.sourceName,
    });
  }
  return PartnerTrustSchema.parse({
    status: row.assessment.status,
    tradeId: place.tradeId,
    postcode4: place.postcode4,
    gemeente: place.gemeente,
    woonplaats: place.woonplaats,
    score: row.assessment.score,
    matchNote: row.assessment.matchNote,
    elementCodes: row.assessment.elementCodes,
    categorySignal: row.signal,
    facts,
  });
}

export async function storeShortlistCompanies(args: {
  store: Store;
  cells: PlaceCellStore;
  place: {
    postcode4?: string;
    gemeente?: string;
    woonplaats?: string;
    placeLabel: string;
    lat: number;
    lon: number;
    tradeId: string;
  };
  rows: StoredAssessment[];
}): Promise<Map<string, string>> {
  const cell = await ensureShortlistCell(args.store, args.cells, args.place);
  const mission = await args.store.getMission(cell.missionId);
  if (!mission) throw new Error("Shortlist mission is missing");
  const companies = await args.store.listByMission("companies", mission.id);
  const ids = new Map<string, string>();
  const now = new Date().toISOString();
  for (const row of args.rows) {
    const trust = trustFor(row, args.place, now);
    const indexes = buildCompanyIndexes(companies);
    let matchAt = findCompanyMatchIndex(
      { name: row.name, website_url: row.website, region: args.place.placeLabel },
      indexes,
    );
    if (matchAt == null) {
      const needle = row.name.trim().toLowerCase();
      const byName = companies.findIndex((company) => company.name.trim().toLowerCase() === needle);
      if (byName >= 0) matchAt = byName;
    }
    const assessed = row.assessment;
    const contexts = assessed.serviceContexts as ServiceContext[];
    if (matchAt != null) {
      const prev = companies[matchAt]!;
      const next = CompanySchema.parse({
        ...prev,
        region: prev.region || args.place.placeLabel,
        category: args.place.tradeId,
        website_url: row.website,
        specialism: assessed.specialism || prev.specialism,
        capabilities: assessed.capabilities.length ? assessed.capabilities : prev.capabilities,
        serviceContexts: contexts.length ? contexts : prev.serviceContexts,
        audienceMode: assessed.audienceMode ?? prev.audienceMode,
        servicedElementCodes: assessed.elementCodes.length
          ? assessed.elementCodes
          : prev.servicedElementCodes,
        profileSnippet: assessed.profileSnippet || prev.profileSnippet,
        profileSourceUrl: row.website,
        profileHarvestedAt: now,
        profileProducer: "ExternalAI",
        list_membership: row.sourceName
          ? [...new Set([...(prev.list_membership ?? []), row.sourceName])]
          : prev.list_membership,
        localAuthenticity: {
          verdict: assessed.verdict,
          reasons: assessed.reasons,
          checkedAt: now,
        },
        partnerTrust: trust,
        placeCellId: cell.id,
        updatedAt: now,
      });
      companies[matchAt] = await args.store.upsert("companies", next);
      ids.set(row.website, next.id);
      continue;
    }
    const created = CompanySchema.parse({
      id: randomUUID(),
      missionId: mission.id,
      producer: "ExternalAI",
      createdAt: now,
      updatedAt: now,
      v: 1,
      name: row.name,
      address: "",
      region: args.place.placeLabel,
      sector: placeCellSector(),
      category: args.place.tradeId,
      website_url: row.website,
      specialism: assessed.specialism,
      capabilities: assessed.capabilities,
      serviceContexts: contexts,
      audienceMode: assessed.audienceMode,
      servicedElementCodes: assessed.elementCodes,
      profileSnippet: assessed.profileSnippet,
      profileSourceUrl: row.website,
      profileHarvestedAt: assessed.profileSnippet ? now : undefined,
      profileProducer: assessed.profileSnippet ? "ExternalAI" : undefined,
      list_membership: row.sourceName ? [row.sourceName] : [],
      status: "candidate",
      kvk_gate: "unchecked",
      localAuthenticity: {
        verdict: assessed.verdict,
        reasons: assessed.reasons,
        checkedAt: now,
      },
      partnerTrust: trust,
      placeCellId: cell.id,
    });
    companies.push(await args.store.upsert("companies", created));
    ids.set(row.website, created.id);
  }
  return ids;
}

export async function storeFoundCompanies(args: {
  store: Store;
  cells: PlaceCellStore;
  place: {
    postcode4?: string;
    gemeente?: string;
    woonplaats?: string;
    placeLabel: string;
    lat: number;
    lon: number;
    tradeId: string;
  };
  rows: GeminiFoundCompany[];
  observedAt: string;
}): Promise<{ ids: Map<string, string>; withheld: string[] }> {
  const cell = await ensureShortlistCell(args.store, args.cells, args.place);
  const mission = await args.store.getMission(cell.missionId);
  if (!mission) throw new Error("Shortlist mission is missing");
  const companies = await args.store.listByMission("companies", mission.id);
  const ids = new Map<string, string>();
  const withheld: string[] = [];
  for (const row of args.rows) {
    const indexes = buildCompanyIndexes(companies);
    let matchAt = findCompanyMatchIndex(
      { name: row.name, website_url: row.website, region: args.place.placeLabel, email: row.email },
      indexes,
    );
    if (matchAt == null) {
      const needle = row.name.trim().toLowerCase();
      const byName = companies.findIndex((company) => company.name.trim().toLowerCase() === needle);
      if (byName >= 0) matchAt = byName;
    }
    const prev = matchAt != null ? companies[matchAt] : undefined;
    if (prev?.localAuthenticity?.verdict === "fake_local") {
      withheld.push(`${row.name}: fake_local`);
      continue;
    }
    const trust = PartnerTrustSchema.parse({
      status: "gevonden",
      tradeId: args.place.tradeId,
      postcode4: args.place.postcode4,
      gemeente: args.place.gemeente,
      woonplaats: args.place.woonplaats,
      score: row.sourceCount,
      matchNote: row.matchNote,
      elementCodes: prev?.partnerTrust?.elementCodes ?? [],
      categorySignal: "in_category",
      facts: foundFacts(row, args.observedAt),
    });
    const membership = [...new Set(row.hits.map((hit) => hit.sourceName).filter(Boolean))];
    if (prev && matchAt != null) {
      const next = CompanySchema.parse({
        ...prev,
        region: prev.region || args.place.placeLabel,
        category: args.place.tradeId,
        address: row.address || prev.address,
        website_url: row.website || prev.website_url,
        phone: row.phone || prev.phone,
        email: row.email || prev.email,
        list_membership: [...new Set([...(prev.list_membership ?? []), ...membership])],
        partnerTrust: trust,
        placeCellId: cell.id,
        updatedAt: args.observedAt,
      });
      companies[matchAt] = await args.store.upsert("companies", next);
      ids.set(row.name, next.id);
      continue;
    }
    const created = CompanySchema.parse({
      id: randomUUID(),
      missionId: mission.id,
      producer: "ExternalAI",
      createdAt: args.observedAt,
      updatedAt: args.observedAt,
      v: 1,
      name: row.name,
      address: row.address,
      region: args.place.placeLabel,
      sector: placeCellSector(),
      category: args.place.tradeId,
      website_url: row.website || undefined,
      phone: row.phone || undefined,
      email: row.email || undefined,
      list_membership: membership,
      status: "candidate",
      kvk_gate: "unchecked",
      partnerTrust: trust,
      placeCellId: cell.id,
    });
    companies.push(await args.store.upsert("companies", created));
    ids.set(row.name, created.id);
  }
  return { ids, withheld };
}

export async function markFoundKnockout(args: {
  store: Store;
  companyId: string;
  verdict: "real_local" | "thin_local" | "fake_local" | "unknown";
  reasons: string[];
  checkedAt: string;
}): Promise<void> {
  const companies = await loadTrustedCompanies(args.store);
  const prev = companies.find((company) => company.id === args.companyId);
  if (!prev) return;
  const next = CompanySchema.parse({
    ...prev,
    localAuthenticity: {
      verdict: args.verdict,
      reasons: args.reasons,
      checkedAt: args.checkedAt,
    },
    updatedAt: args.checkedAt,
  });
  await args.store.upsert("companies", next);
}

export function cardsFromStored(args: {
  ids: Map<string, string>;
  rows: StoredAssessment[];
  place: string;
  tradeId: HhhShortlistCompany["tradeId"];
  observedAt: string;
}): HhhShortlistCompany[] {
  const cards: HhhShortlistCompany[] = [];
  for (const row of args.rows) {
    if (!row.assessment.pass) continue;
    if (row.assessment.status !== "geverifieerd" && row.assessment.status !== "lokaal_verbonden") {
      continue;
    }
    const id = args.ids.get(row.website);
    if (!id) continue;
    const evidence: HhhShortlistCompany["evidence"] = [
      { kind: "website", url: row.website, observedAt: args.observedAt },
    ];
    if (row.signal === "in_category" && row.sourceUrl) {
      evidence.push({
        kind: "list_mention",
        url: row.sourceUrl,
        observedAt: args.observedAt,
        sourceName: row.sourceName,
      });
    }
    cards.push({
      id,
      name: row.name,
      place: args.place,
      website: row.website,
      tradeId: args.tradeId,
      status: row.assessment.status,
      score: row.assessment.score,
      matchNote: row.assessment.matchNote,
      evidence,
    });
  }
  return cards;
}
