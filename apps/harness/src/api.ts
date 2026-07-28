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

export const api = {
  health: () =>
    request<{
      ok: boolean;
      storeDriver?: string;
      authRequired?: boolean;
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
  listMissions: () => request<Mission[]>("/missions"),
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
