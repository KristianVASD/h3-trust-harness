import type {
  Company,
  Mission,
  MissionCoverage,
  Review,
  SearchPlan,
  Source,
} from "@h3-trust/schema";

function baseUrl(): string {
  return (process.env.H3_API_BASE ?? "http://localhost:8787").replace(/\/$/, "");
}

function token(): string {
  return (process.env.H3_WORKER_TOKEN ?? "").trim();
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  const bearer = token();
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  const res = await fetch(`${baseUrl()}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${init?.method ?? "GET"} ${path} ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const h3 = {
  getMission: (id: string) => request<Mission>(`/api/missions/${id}`),
  getSources: (missionId: string) =>
    request<Source[]>(`/api/missions/${missionId}/sources`),
  getCompanies: (missionId: string) =>
    request<Company[]>(`/api/missions/${missionId}/companies`),
  getCoverage: (missionId: string) =>
    request<MissionCoverage>(`/api/missions/${missionId}/coverage`),
  getReviews: (missionId: string) =>
    request<Review[]>(`/api/missions/${missionId}/reviews`),
  getSearchPlan: (version: string) =>
    request<SearchPlan>(`/api/searchplans/${encodeURIComponent(version)}`),
  discover: (
    missionId: string,
    gap: { layer: string; category: string; nuance_rule?: string },
  ) =>
    request<unknown>(`/api/missions/${missionId}/omega/discover`, {
      method: "POST",
      body: JSON.stringify(gap),
    }),
  probe: (missionId: string, sourceId: string) =>
    request<unknown>(`/api/missions/${missionId}/omega/probe`, {
      method: "POST",
      body: JSON.stringify({ sourceId }),
    }),
  extract: (missionId: string, sourceId: string) =>
    request<unknown>(`/api/missions/${missionId}/sources/${sourceId}/extract`, {
      method: "POST",
      body: "{}",
    }),
  harvest: (missionId: string, companyId: string) =>
    request<unknown>(
      `/api/missions/${missionId}/companies/${companyId}/harvest`,
      { method: "POST", body: "{}" },
    ),
};
