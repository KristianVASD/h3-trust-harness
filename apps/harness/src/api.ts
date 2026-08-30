import type {
  AccessBarrier,
  BarrierFulfillment,
  CollectionName,
  Company,
  ExportBundle,
  Hypothesis,
  JournalEntry,
  Mission,
  MissionCoverage,
  MissionSource,
  NationLandscape,
  Observation,
  SearchPlan,
  Source,
} from "@h3-trust/schema";
import { getAccessToken } from "./lib/api-auth";
import {
  SEARCH_SESSION_HEADER,
  getSearchSessionId,
} from "./lib/search-session";

const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      [SEARCH_SESSION_HEADER]: getSearchSessionId(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json() as Promise<T>;
}

export type SearchSessionState = {
  sessionId: string;
  searchCount: number;
  remaining: number;
  limit: number;
  unlimited?: boolean;
  ok?: boolean;
  error?: string;
};

export type SearchDemandRow = {
  id: string;
  session_id: string | null;
  user_id: string | null;
  what: string;
  location: string;
  country: string | null;
  parsed_sector: string | null;
  matched_mission_id: string | null;
  outcome:
    | "hit"
    | "no_match"
    | "empty_companies"
    | "ambiguous"
    | "quota_blocked";
  created_at: string;
};

export type SearchDemandAggregate = {
  key: string;
  what: string;
  location: string;
  country: string | null;
  count: number;
  lastAt: string;
  outcomes: Partial<Record<SearchDemandRow["outcome"], number>>;
  matchedMissionId: string | null;
};

export type CoverageMissionRow = {
  id: string;
  location: string;
  country: string;
  sector: string;
  subsector: string;
  companyCount: number;
  trustedCount: number;
  listNames?: string[];
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

export type WorkerCommand =
  | "discover"
  | "probe"
  | "extract"
  | "harvest"
  | "coverage"
  | "search"
  | "full_mission"
  | "nation_map";

export type WorkerTargetType =
  | "mission"
  | "source"
  | "company"
  | "gap"
  | "search"
  | "country";

export type ControlDoorRow = {
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
  lastRun: {
    id: string;
    status: WorkerStatus;
    progress_pct: number;
    current_action: string | null;
    updated_at: string;
  } | null;
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
};

export type ListStyleGroup = {
  layer: string;
  category: string;
  title: string;
  sources: ListStyleSource[];
};

export type WorkerStatus =
  | "queued"
  | "running"
  | "waiting_human"
  | "succeeded"
  | "failed"
  | "cancelled";

export type WorkerRun = {
  id: string;
  mission_id: string | null;
  command: WorkerCommand;
  target_type: WorkerTargetType | null;
  target_id: string | null;
  status: WorkerStatus;
  phase: string | null;
  step_index: number;
  step_total: number;
  progress_pct: number;
  current_action: string | null;
  input: Record<string, unknown>;
  output_summary: Record<string, unknown>;
  cursor: Record<string, unknown>;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  heartbeat_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkerEvent = {
  id: string;
  run_id: string;
  mission_id: string | null;
  level: "debug" | "info" | "warn" | "error" | "success";
  event_type: string;
  step_name: string | null;
  message: string;
  data: Record<string, unknown>;
  created_at: string;
};

export type PackOnboardResult = {
  mission: Mission;
  createdMission: boolean;
  source: Source;
  created: number;
  updated: number;
  skipped: number;
  nationalPack: boolean;
  mixed?: boolean;
  createdUnknown?: number;
  clusterHits?: number;
  directoryMissionId?: string;
};

export const api = {
  health: () =>
    request<{
      ok: boolean;
      storeDriver?: string;
      authRequired?: boolean;
      hasServiceRole?: boolean;
      engineAvailable?: boolean;
    }>("/health"),
  me: () =>
    request<{
      authRequired: boolean;
      profile: unknown;
      canWrite?: boolean;
      isAdmin?: boolean;
    }>("/me"),
  updateMe: (patch: {
    display_name?: string;
    preferred_location?: string;
  }) =>
    request<{ profile: unknown }>("/me", {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  listVolunteers: () =>
    request<{ volunteers: Array<Record<string, unknown>> }>(
      "/admin/volunteers",
    ),
  approveVolunteer: (id: string) =>
    request<{ profile: unknown }>(`/admin/volunteers/${id}/approve`, {
      method: "POST",
      body: "{}",
    }),
  rejectVolunteer: (id: string) =>
    request<{ profile: unknown }>(`/admin/volunteers/${id}/reject`, {
      method: "POST",
      body: "{}",
    }),
  listWorkerRuns: (opts?: { missionId?: string; status?: string }) => {
    const params = new URLSearchParams();
    if (opts?.missionId) params.set("missionId", opts.missionId);
    if (opts?.status) params.set("status", opts.status);
    const q = params.toString();
    return request<{ runs: WorkerRun[] }>(
      `/admin/worker/runs${q ? `?${q}` : ""}`,
    );
  },
  getWorkerRun: (id: string) =>
    request<{ run: WorkerRun; events: WorkerEvent[] }>(
      `/admin/worker/runs/${id}`,
    ),
  listWorkerEvents: (id: string) =>
    request<{ events: WorkerEvent[] }>(`/admin/worker/runs/${id}/events`),
  enqueueWorkerRun: (body: {
    missionId?: string;
    command: WorkerCommand;
    targetType?: WorkerTargetType;
    targetId?: string;
    country?: string;
    model?: string;
  }) =>
    request<{ run: WorkerRun }>("/admin/worker/runs", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  cancelWorkerRun: (id: string) =>
    request<{ run: WorkerRun }>(`/admin/worker/runs/${id}/cancel`, {
      method: "POST",
      body: "{}",
    }),
  retryWorkerRun: (id: string) =>
    request<{ run: WorkerRun }>(`/admin/worker/runs/${id}/retry`, {
      method: "POST",
      body: "{}",
    }),
  getActiveWorkerRun: (missionId: string) =>
    request<{ run: WorkerRun | null }>(`/missions/${missionId}/worker/active`),
  searchSession: () =>
    request<SearchSessionState>("/search/session", {
      method: "POST",
      body: "{}",
    }),
  consumeSearch: () =>
    request<SearchSessionState>("/search/consume", {
      method: "POST",
      body: "{}",
    }),
  logSearchDemand: (body: {
    what: string;
    location: string;
    country?: string;
    parsed_sector?: string;
    matched_mission_id?: string;
    outcome?:
      | "hit"
      | "no_match"
      | "empty_companies"
      | "ambiguous"
      | "quota_blocked";
    /** Open/find mission only — do not count an ask or insert a demand row. */
    ensureOnly?: boolean;
  }) =>
    request<{
      ok: boolean;
      demand: SearchDemandRow | null;
      mission: Mission | null;
      missionCreated?: boolean;
      ensureOnly?: boolean;
    }>("/search/demand", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  listSearchDemands: (limit = 200) =>
    request<{
      demands: SearchDemandRow[];
      aggregates: SearchDemandAggregate[];
    }>(`/search/demands?limit=${limit}`),
  getMasterlist: (audience: "consumer" | "pro" | "hoa" | "apartment_owner" = "pro") =>
    request<{
      version: string;
      id: string;
      locale: string;
      updated: string;
      split_rule: string;
      audience: string;
      categories: Array<{ id: string; code: string; name: string; name_en: string; sort: number }>;
      trades: Array<{ id: string; name: string }>;
      elementCount: number;
      elements: Array<{
        code: string;
        name: string;
        name_en: string;
        aliases: string[];
        category: string;
        scope: Array<"C" | "P">;
      }>;
    }>(`/masterlist?audience=${audience}`),
  resolveMasterlist: (body: { terms?: string[]; text?: string }) =>
    request<{
      version: string;
      count: number;
      matched: number;
      needs_review: number;
      results: Array<
        | {
            status: "matched";
            input: string;
            code: string;
            element: { code: string; name: string; name_en: string };
            via: "code" | "name" | "alias";
          }
        | {
            status: "needs_review";
            input: string;
            proposals: Array<{
              code: string;
              name: string;
              reason: "ambiguous" | "suggest_alias";
            }>;
          }
      >;
    }>("/masterlist/resolve", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  listMissions: () => request<Mission[]>("/missions"),
  getCoverageDesk: () =>
    request<{ packs: CoveragePackRow[]; missions: CoverageMissionRow[] }>(
      "/control/coverage",
    ),
  listControlCountries: () =>
    request<{ countries: ControlCountryRow[] }>("/control/countries"),
  startControlCountry: (body: { country: string; map?: boolean }) =>
    request<{
      landscape: NationLandscape;
      created: boolean;
      run: WorkerRun | null;
    }>("/control/countries", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getControlCountry: (country: string) =>
    request<{
      country: string;
      countrySlug: string;
      landscape: NationLandscape;
      doors: ControlDoorRow[];
      directory: ControlDoorRow | null;
      jobs: ControlJobRow[];
      demands: SearchDemandAggregate[];
      latestRun: WorkerRun | null;
      events: WorkerEvent[];
    }>(`/control/countries/${encodeURIComponent(country)}`),
  getControlLandscape: (country: string) =>
    request<{ landscape: NationLandscape }>(
      `/control/countries/${encodeURIComponent(country)}/landscape`,
    ),
  putControlLandscape: (
    country: string,
    landscape: NationLandscape | { text: string } | { landscape: NationLandscape },
  ) =>
    request<{ landscape: NationLandscape }>(
      `/control/countries/${encodeURIComponent(country)}/landscape`,
      { method: "PUT", body: JSON.stringify(landscape) },
    ),
  getControlDoor: (country: string, tradeId: string) =>
    request<{
      country: string;
      countrySlug: string;
      tradeId: string;
      door: ControlDoorRow;
      groups: ListStyleGroup[];
      directorySources: ListStyleSource[];
      jobs: ControlJobRow[];
      demands: SearchDemandAggregate[];
      latestRun: WorkerRun | null;
      events: WorkerEvent[];
    }>(
      `/control/countries/${encodeURIComponent(country)}/doors/${encodeURIComponent(tradeId)}`,
    ),
  onboardPack: (body: {
    country: string;
    sector: string;
    subsector: string;
    location?: string;
    goal?: string;
    source: {
      name: string;
      url?: string;
      layer: "national" | "regional" | "local";
      category: string;
    };
    listLabel?: string;
    rows: Array<Record<string, string | undefined>>;
    mixed?: boolean;
    suggestedWeight?: number;
    defaultAudience?: string;
  }) =>
    request<PackOnboardResult>("/packs/onboard", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getMission: (id: string) => request<Mission>(`/missions/${id}`),
  createMission: (mission: Mission) =>
    request<Mission>("/missions", {
      method: "POST",
      body: JSON.stringify(mission),
    }),
  warmStartSources: (missionId: string) =>
    request<{ linked: number; sources: Source[] }>(
      `/missions/${missionId}/sources/warm-start`,
      { method: "POST", body: "{}" },
    ),
  discoverSources: (
    missionId: string,
    gap: { layer: string; category: string; nuance_rule?: string },
  ) =>
    request<{
      sources: Source[];
      skipped: Array<{ reason: string }>;
      output: { producer: string; candidates: unknown[] };
    }>(`/missions/${missionId}/omega/discover`, {
      method: "POST",
      body: JSON.stringify(gap),
    }),
  importOmegaJson: (
    missionId: string,
    body: {
      job: "discover" | "probe" | "extract" | "harvest" | "classify";
      payload: unknown;
    },
  ) =>
    request<{
      job: string;
      imported: number;
      skipped: Array<{ reason: string; detail?: string }>;
      sources?: Source[];
      companies?: Company[];
      warnings: string[];
    }>(`/missions/${missionId}/omega/import`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  probeSource: (missionId: string, sourceId: string) =>
    request<{ source: Source; output: unknown }>(
      `/missions/${missionId}/omega/probe`,
      {
        method: "POST",
        body: JSON.stringify({ sourceId }),
      },
    ),
  extractSource: (missionId: string, sourceId: string) =>
    request<{
      created: string[];
      companies: Company[];
      blocked: Array<{
        sourceId: string;
        barrierId: string;
        kind: string;
        what_human_does: string;
      }>;
      notes?: string;
    }>(`/missions/${missionId}/sources/${sourceId}/extract`, {
      method: "POST",
      body: "{}",
    }),
  harvestCompany: (missionId: string, companyId: string) =>
    request<
      | {
          ok: true;
          company: Company;
          harvest_confidence?: "high" | "medium" | "low";
          webpageTrustProbe?: {
            domain_age?: string;
            has_real_address?: boolean;
            has_contact?: boolean;
            notes?: string;
          };
        }
      | { ok: false; observationId: string; error: string }
    >(`/missions/${missionId}/companies/${companyId}/harvest`, {
      method: "POST",
      body: "{}",
    }),
  fulfillBarrier: (
    missionId: string,
    sourceId: string,
    barrierId: string,
    fulfillment: BarrierFulfillment,
  ) =>
    request<{
      barrier: AccessBarrier;
      source: Source;
      createdCompanyIds: string[];
      companies: Company[];
    }>(
      `/missions/${missionId}/sources/${sourceId}/barriers/${barrierId}/fulfill`,
      {
        method: "POST",
        body: JSON.stringify({ fulfillment }),
      },
    ),
  declineBarrier: (
    missionId: string,
    sourceId: string,
    barrierId: string,
    args: { reason: string; by: string },
  ) =>
    request<{ barrier: AccessBarrier; source: Source }>(
      `/missions/${missionId}/sources/${sourceId}/barriers/${barrierId}/decline`,
      {
        method: "POST",
        body: JSON.stringify(args),
      },
    ),
  getCoverage: (missionId: string) =>
    request<MissionCoverage>(`/missions/${missionId}/coverage`),
  updateMission: (mission: Mission) =>
    request<Mission>(`/missions/${mission.id}`, {
      method: "PUT",
      body: JSON.stringify(mission),
    }),
  deleteMission: (id: string) =>
    request<{ ok: boolean }>(`/missions/${id}`, { method: "DELETE" }),
  listJournal: (missionId: string) =>
    request<JournalEntry[]>(`/missions/${missionId}/journal`),
  listObservations: (missionId: string) =>
    request<Observation[]>(`/missions/${missionId}/observations`),
  listHypotheses: (missionId: string) =>
    request<Hypothesis[]>(`/missions/${missionId}/hypotheses`),
  listSources: (missionId: string) =>
    request<Source[]>(`/missions/${missionId}/sources`),
  listAllSources: () => request<Source[]>("/sources"),
  listCompanies: (missionId: string) =>
    request<Company[]>(`/missions/${missionId}/companies`),
  importCompanies: (
    missionId: string,
    body: {
      sourceId: string;
      listLabel: string;
      rows: Array<{
        name: string;
        address?: string;
        region?: string;
        sector?: string;
        kvk_number?: string;
        website_url?: string;
        specialism?: string;
        phone?: string;
        email?: string;
      }>;
      producer?: "Human" | "ImportedDataset";
      mixed?: boolean;
      place?: string;
      defaultAudience?: string;
    },
  ) =>
    request<{
      created: number;
      updated: number;
      skipped: number;
      companies: Company[];
      warnings: string[];
      createdUnknown?: number;
      clusterHits?: number;
      mixed?: boolean;
    }>(`/missions/${missionId}/companies/import`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  listDirectoryCompanies: (country: string, sourceId?: string) => {
    const params = new URLSearchParams({ country });
    if (sourceId) params.set("sourceId", sourceId);
    return request<{
      mission: Mission | null;
      companies: Company[];
      unknown: number;
      potentials: number;
    }>(`/directory/companies?${params}`);
  },
  promoteDirectoryCompany: (
    companyId: string,
    body: { country: string; subsector: string; reviewer?: string; reason?: string },
  ) =>
    request<{ company: Company; mission: Mission }>(
      `/directory/companies/${companyId}/promote`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  peelMixedOnly: (
    missionId: string,
    sourceId?: string,
  ) =>
    request<{
      peeled: number;
      keptDoubles: number;
      skipped: number;
      directoryMissionId: string;
      mixedSourceNames: string[];
    }>(`/missions/${missionId}/companies/peel-mixed`, {
      method: "POST",
      body: JSON.stringify(sourceId ? { sourceId } : {}),
    }),
  exportHhhLeads: (country?: string, subsector?: string) => {
    const params = new URLSearchParams();
    if (country) params.set("country", country);
    if (subsector) params.set("subsector", subsector);
    return request<{ count: number; leads: unknown[] }>(
      `/export/hhh-leads?${params}`,
    );
  },
  listLinkableSources: (excludeMissionId: string, q = "") => {
    const params = new URLSearchParams({
      excludeMission: excludeMissionId,
      ...(q ? { q } : {}),
    });
    return request<Source[]>(`/sources/linkable?${params}`);
  },
  linkSource: (missionId: string, sourceId: string) =>
    request<{ source: Source; link: MissionSource }>(
      `/missions/${missionId}/sources/link`,
      {
        method: "POST",
        body: JSON.stringify({ sourceId, producer: "Human" }),
      },
    ),
  createInMission: <T>(
    missionId: string,
    collection: Exclude<CollectionName, "missions" | "patterns">,
    entity: T,
  ) =>
    request<T>(`/missions/${missionId}/${collection}`, {
      method: "POST",
      body: JSON.stringify(entity),
    }),
  updateEntity: <T extends { id: string }>(
    collection: Exclude<CollectionName, "missions" | "patterns">,
    entity: T,
  ) =>
    request<T>(`/${collection}/${entity.id}`, {
      method: "PUT",
      body: JSON.stringify(entity),
    }),
  exportMission: (missionId: string) =>
    request<ExportBundle>(`/missions/${missionId}/export`),
  listSearchPlans: () =>
    request<{ versions: string[]; latest: string }>("/searchplans"),
  getSearchPlan: (version: string) =>
    request<SearchPlan>(`/searchplans/${encodeURIComponent(version)}`),
};
