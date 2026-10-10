import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CompanySchema,
  DEFAULT_SEARCH_PLAN_VERSION,
  PLACE_CELL_SUBSECTOR,
  PlaceCellSchema,
  SourceSchema,
  buildCompanyIndexes,
  cellCoversPoint,
  cellIsFresh,
  countrySlug,
  displayCountry,
  findCompanyMatchIndex,
  minimizePublicContact,
  placeCellSector,
  type Company,
  type Mission,
  type PlaceCell,
  type Source,
  type SourceCategory,
} from "@h3-trust/schema";
import type { Store } from "@h3-trust/store";
import type { WorkerRun } from "./worker-progress.js";
import { geocodeNl, type GeoHit } from "./pdok-geocode.js";
import type { PlaceCellStore } from "./place-cell-store.js";

const defaultPhases: Mission["phases"] = [
  { key: "observation", status: "active" },
  { key: "hypothesis", status: "waiting" },
  { key: "evidence", status: "waiting" },
  { key: "cara", status: "waiting" },
  { key: "patterns", status: "waiting" },
  { key: "companies", status: "waiting" },
  { key: "deep_check", status: "waiting" },
];

export type AddressSeedInput = {
  name: string;
  url?: string;
  category: SourceCategory;
  scope?: "local" | "regional" | "national";
  suggestedWeight?: number;
};

export type AddressCompanyInput = {
  name: string;
  address?: string;
  region?: string;
  category?: string;
  website_url?: string;
  phone?: string;
  email?: string;
  specialism?: string;
  capabilities?: string[];
  serviceContexts?: Company["serviceContexts"];
  audienceMode?: Company["audienceMode"];
  servicedElementCodes?: string[];
  profileSnippet?: string;
  profileSourceUrl?: string;
  sourceNames?: string[];
  localAuthenticity?: Company["localAuthenticity"];
  countryChecks?: Company["countryChecks"];
  trustProposal?: Company["trustProposal"];
  kvk_number?: string;
};

async function cachedGeocode(
  cells: PlaceCellStore,
  query: string,
  kind: "adres" | "woonplaats",
): Promise<GeoHit | null> {
  const key = `${kind}:${query.trim().toLowerCase()}`;
  const hit = await cells.getGeo(key);
  if (hit) return hit;
  const fresh = await geocodeNl(query, kind);
  if (fresh) await cells.putGeo(key, fresh);
  return fresh;
}

async function ensureCellMission(
  store: Store,
  cell: { id: string; country: string; label: string; missionId?: string },
): Promise<Mission> {
  if (cell.missionId) {
    const existing = await store.getMission(cell.missionId);
    if (existing) return existing;
  }
  const missions = await store.listMissions();
  const reused = missions.find(
    (m) =>
      m.subsector === PLACE_CELL_SUBSECTOR &&
      countrySlug(m.country) === countrySlug(cell.country) &&
      m.location.trim().toLowerCase() === cell.label.trim().toLowerCase(),
  );
  if (reused) return reused;
  const now = new Date().toISOString();
  return store.upsertMission({
    id: randomUUID(),
    location: cell.label,
    country: displayCountry(cell.country),
    sector: placeCellSector(),
    subsector: PLACE_CELL_SUBSECTOR,
    goal: `Local network around ${cell.label}. Grown by address search, not a national extract.`,
    notes: `place-cell:${cell.id}`,
    search_plan_version: DEFAULT_SEARCH_PLAN_VERSION,
    discoveryBrief: {
      approach: "Address search: local ecology, then website match, then the country map.",
      candidateListTypes: [],
      successCriteria: "Companies for this place, with a provisional trust trail.",
      producer: "ExternalAI",
      updatedAt: now,
    },
    phases: defaultPhases,
    producer: "ExternalAI",
    origin: "human",
    createdAt: now,
    updatedAt: now,
    v: 1,
  });
}

export async function enqueueAddressSearch(args: {
  admin: SupabaseClient;
  store: Store;
  cells: PlaceCellStore;
  country: string;
  address: string;
  postcode?: string;
  place?: string;
  model?: string;
}): Promise<{ cell: PlaceCell; run: WorkerRun; reused: boolean }> {
  const country = args.country.trim() || "Netherlands";
  const line = [args.address, args.postcode, args.place].filter(Boolean).join(" ").trim();
  if (!line) throw new Error("Address is required");
  const geo = await cachedGeocode(args.cells, line, "adres");
  if (!geo) throw new Error(`No PDOK hit for “${line}”`);

  const existing = await args.cells.list();
  const cover = existing.find(
    (cell) =>
      countrySlug(cell.country) === countrySlug(country) &&
      cellCoversPoint(cell, geo.lat, geo.lon),
  );
  const reused = Boolean(cover && cellIsFresh(cover.updatedAt));
  const label = geo.woonplaats || geo.gemeente || args.place || geo.label || "place";
  const mission = await ensureCellMission(args.store, {
    id: cover?.id ?? randomUUID(),
    country,
    label,
    missionId: cover?.missionId,
  });
  const now = new Date().toISOString();
  const cell = await args.cells.upsert(
    PlaceCellSchema.parse({
      ...(cover ?? {}),
      id: cover?.id ?? randomUUID(),
      country: displayCountry(country),
      countrySlug: countrySlug(country),
      label,
      address: line,
      postcode4: geo.postcode4,
      gemeente: geo.gemeente,
      woonplaats: geo.woonplaats,
      lat: geo.lat,
      lon: geo.lon,
      radiusKm: cover?.radiusKm ?? 15,
      missionId: mission.id,
      finishedStages: reused ? cover?.finishedStages ?? [] : [],
      ecology: cover?.ecology ?? { ov: [], sport: [], festivity: [] },
      candidates: cover?.candidates ?? [],
      notes: cover?.notes ?? [],
      updatedAt: now,
    }),
  );

  const { data, error } = await args.admin
    .from("worker_runs")
    .insert({
      mission_id: mission.id,
      command: "address_search",
      target_type: "mission",
      target_id: cell.id,
      status: "queued",
      current_action: `Queued address search · ${label}`,
      input: {
        cellId: cell.id,
        country: cell.country,
        address: line,
        model: args.model,
        reused,
      },
      step_total: 9,
      progress_pct: 0,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to enqueue address search");
  }
  return { cell, run: data as WorkerRun, reused };
}

export async function geocodeCached(
  cells: PlaceCellStore,
  query: string,
  kind: "adres" | "woonplaats",
): Promise<GeoHit | null> {
  return cachedGeocode(cells, query, kind);
}

function uniq(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export async function applyAddressSnapshot(args: {
  store: Store;
  cells: PlaceCellStore;
  cell: PlaceCell;
  sources?: AddressSeedInput[];
  companies?: AddressCompanyInput[];
}): Promise<{ cell: PlaceCell; created: number; updated: number }> {
  const mission = await args.store.getMission(args.cell.missionId);
  if (!mission) throw new Error("Place cell mission is missing");
  const now = new Date().toISOString();
  const sourceIds = new Map<string, string>();
  const existingSources = await args.store.listByMission("sources", mission.id);
  for (const source of existingSources) sourceIds.set(source.name.toLowerCase(), source.id);

  for (const seed of args.sources ?? []) {
    const key = seed.name.toLowerCase();
    if (sourceIds.has(key)) continue;
    const source = SourceSchema.parse({
      id: randomUUID(),
      producer: "ExternalAI",
      createdAt: now,
      updatedAt: now,
      v: 1,
      first_seen_mission: mission.id,
      name: seed.name,
      type: seed.category === "trade_fair" ? "municipality" : "association",
      category: seed.category,
      scope: seed.scope ?? "local",
      region: args.cell.woonplaats || args.cell.label,
      url: seed.url,
      listUrl: seed.url,
      status: "candidate",
      suggestedWeight: seed.suggestedWeight,
      reason: "Address search seed",
      discoveredVia: "address_search",
    }) as Source;
    const saved = await args.store.createSourceInMission(mission.id, source);
    sourceIds.set(key, saved.id);
  }

  const companies = await args.store.listByMission("companies", mission.id);
  let created = 0;
  let updated = 0;
  for (const row of args.companies ?? []) {
    const contact = minimizePublicContact({
      phone: row.phone,
      email: row.email,
    });
    const indexes = buildCompanyIndexes(companies);
    let matchAt = findCompanyMatchIndex(
      {
        name: row.name,
        website_url: row.website_url,
        email: contact.email,
        address: row.address,
        region: row.region,
        kvk_number: row.kvk_number,
      },
      indexes,
    );
    if (matchAt == null) {
      const needle = row.name.trim().toLowerCase();
      const byName = companies.findIndex((c) => c.name.trim().toLowerCase() === needle);
      if (byName >= 0) matchAt = byName;
    }
    const linked = (row.sourceNames ?? [])
      .map((name) => sourceIds.get(name.toLowerCase()))
      .filter((id): id is string => Boolean(id));
    if (matchAt != null) {
      const prev = companies[matchAt]!;
      const next = CompanySchema.parse({
        ...prev,
        address: prev.address || row.address || "",
        region: prev.region || row.region || args.cell.label,
        category: row.category || prev.category,
        website_url: prev.website_url || row.website_url,
        phone: contact.phone ?? prev.phone,
        email: contact.email ?? prev.email,
        specialism: row.specialism || prev.specialism,
        capabilities: row.capabilities?.length ? row.capabilities : prev.capabilities,
        serviceContexts: row.serviceContexts?.length ? row.serviceContexts : prev.serviceContexts,
        audienceMode: row.audienceMode ?? prev.audienceMode,
        servicedElementCodes: row.servicedElementCodes?.length
          ? row.servicedElementCodes
          : prev.servicedElementCodes,
        profileSnippet: row.profileSnippet || prev.profileSnippet,
        profileSourceUrl: row.profileSourceUrl || prev.profileSourceUrl,
        profileHarvestedAt: row.profileSnippet ? now : prev.profileHarvestedAt,
        profileProducer: row.profileSnippet ? "ExternalAI" : prev.profileProducer,
        source_ids: uniq([...(prev.source_ids ?? []), ...linked]),
        list_membership: uniq([...(prev.list_membership ?? []), ...(row.sourceNames ?? [])]),
        localAuthenticity: row.localAuthenticity ?? prev.localAuthenticity,
        countryChecks: row.countryChecks?.length ? row.countryChecks : prev.countryChecks,
        trustProposal: row.trustProposal ?? prev.trustProposal,
        placeCellId: args.cell.id,
        updatedAt: now,
      });
      companies[matchAt] = await args.store.upsert("companies", next);
      updated += 1;
      continue;
    }
    const createdRow = CompanySchema.parse({
      id: randomUUID(),
      missionId: mission.id,
      producer: "ExternalAI",
      createdAt: now,
      updatedAt: now,
      v: 1,
      name: row.name,
      address: row.address ?? "",
      region: row.region || args.cell.woonplaats || args.cell.label,
      sector: placeCellSector(),
      category: row.category ?? "",
      website_url: row.website_url,
      phone: contact.phone,
      email: contact.email,
      specialism: row.specialism,
      capabilities: row.capabilities ?? [],
      serviceContexts: row.serviceContexts ?? [],
      audienceMode: row.audienceMode,
      servicedElementCodes: row.servicedElementCodes ?? [],
      profileSnippet: row.profileSnippet,
      profileSourceUrl: row.profileSourceUrl,
      profileHarvestedAt: row.profileSnippet ? now : undefined,
      profileProducer: row.profileSnippet ? "ExternalAI" : undefined,
      source_ids: linked,
      list_membership: row.sourceNames ?? [],
      status: "candidate",
      kvk_number: row.kvk_number,
      kvk_gate: "unchecked",
      localAuthenticity: row.localAuthenticity,
      countryChecks: row.countryChecks ?? [],
      trustProposal: row.trustProposal,
      placeCellId: args.cell.id,
    });
    companies.push(await args.store.upsert("companies", createdRow));
    created += 1;
  }

  const cell = await args.cells.upsert(args.cell);
  return { cell, created, updated };
}
