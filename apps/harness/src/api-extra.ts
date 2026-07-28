import type {
  ConfidenceProposal,
  Evidence,
  Finding,
  Review,
  Signal,
} from "@h3-trust/schema";
import { getAccessToken } from "./lib/api-auth";

const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
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

export async function listEvidence(missionId: string) {
  return request<Evidence[]>(`/missions/${missionId}/evidence`);
}

export async function listSignals(missionId: string) {
  return request<Signal[]>(`/missions/${missionId}/signals`);
}

export async function listReviews(missionId: string) {
  return request<Review[]>(`/missions/${missionId}/reviews`);
}

export async function listFindings(missionId: string) {
  return request<Finding[]>(`/missions/${missionId}/findings`);
}

export async function listConfidence(missionId: string) {
  return request<ConfidenceProposal[]>(
    `/missions/${missionId}/confidenceProposals`,
  );
}

export async function createEntity<T>(
  missionId: string,
  collection: string,
  entity: T,
) {
  return request<T>(`/missions/${missionId}/${collection}`, {
    method: "POST",
    body: JSON.stringify(entity),
  });
}

export async function updateEntity<T extends { id: string }>(
  collection: string,
  entity: T,
) {
  return request<T>(`/${collection}/${entity.id}`, {
    method: "PUT",
    body: JSON.stringify(entity),
  });
}
