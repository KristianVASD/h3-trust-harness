/**
 * Phase 6 — Barrier fulfill / decline orchestration.
 * Human resolves an Ω-raised access barrier; manual-rows become Human companies.
 */
import {
  BarrierFulfillmentSchema,
  type AccessBarrier,
  type BarrierFulfillment,
  type Company,
  type Source,
} from "@h3-trust/schema";
import type { FileStore } from "@h3-trust/store";
import {
  buildDeclinedBarrier,
  buildFulfilledBarrier,
  buildHumanCompaniesFromFulfillment,
  storeSecretRef,
} from "./adapter.js";

export type FulfillRouteResult = {
  barrier: AccessBarrier;
  source: Source;
  createdCompanyIds: string[];
  companies: Company[];
};

export async function fulfillBarrierForSource(
  store: FileStore,
  missionId: string,
  sourceId: string,
  barrierId: string,
  rawFulfillment: unknown,
): Promise<FulfillRouteResult> {
  const mission = await store.getMission(missionId);
  if (!mission) {
    throw new BarrierRouteError("Mission not found", 404);
  }

  let fulfillment: BarrierFulfillment;
  try {
    fulfillment = BarrierFulfillmentSchema.parse(rawFulfillment);
  } catch (err) {
    throw new BarrierRouteError(
      err instanceof Error ? err.message : "Invalid fulfillment payload",
      400,
    );
  }

  const missionSources = await store.listByMission("sources", missionId);
  const source = missionSources.find((s) => s.id === sourceId);
  if (!source) {
    throw new BarrierRouteError("Source not found on this mission", 404);
  }
  if (!source.accessBarrier || source.accessBarrier.id !== barrierId) {
    throw new BarrierRouteError("barrier not found on source", 404);
  }

  const barrier = buildFulfilledBarrier(source.accessBarrier, fulfillment);
  const updated = await store.upsert("sources", {
    ...source,
    accessBarrier: barrier,
    updatedAt: new Date().toISOString(),
  });

  if (fulfillment.kind === "api-key" && fulfillment.api_key_ref) {
    await storeSecretRef(fulfillment.api_key_ref);
  }

  const drafts = buildHumanCompaniesFromFulfillment({
    missionId,
    source: updated,
    fulfillment,
  });
  const companies: Company[] = [];
  for (const draft of drafts) {
    companies.push(await store.upsert("companies", draft));
  }

  return {
    barrier,
    source: updated,
    createdCompanyIds: companies.map((c) => c.id),
    companies,
  };
}

export type DeclineRouteResult = {
  barrier: AccessBarrier;
  source: Source;
};

export async function declineBarrierForSource(
  store: FileStore,
  missionId: string,
  sourceId: string,
  barrierId: string,
  rawBody: unknown,
): Promise<DeclineRouteResult> {
  const mission = await store.getMission(missionId);
  if (!mission) {
    throw new BarrierRouteError("Mission not found", 404);
  }

  const body =
    rawBody && typeof rawBody === "object"
      ? (rawBody as { reason?: unknown; by?: unknown })
      : {};
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const by = typeof body.by === "string" ? body.by.trim() : "";
  if (!reason) {
    throw new BarrierRouteError("reason is required to decline a barrier", 400);
  }
  if (!by) {
    throw new BarrierRouteError("by (curator id) is required", 400);
  }

  const missionSources = await store.listByMission("sources", missionId);
  const source = missionSources.find((s) => s.id === sourceId);
  if (!source) {
    throw new BarrierRouteError("Source not found on this mission", 404);
  }
  if (!source.accessBarrier || source.accessBarrier.id !== barrierId) {
    throw new BarrierRouteError("barrier not found on source", 404);
  }

  const barrier = buildDeclinedBarrier(source.accessBarrier, reason, by);
  const updated = await store.upsert("sources", {
    ...source,
    accessBarrier: barrier,
    updatedAt: new Date().toISOString(),
  });

  return { barrier, source: updated };
}

export class BarrierRouteError extends Error {
  status: 400 | 404 | 500;
  constructor(message: string, status: 400 | 404 | 500) {
    super(message);
    this.name = "BarrierRouteError";
    this.status = status;
  }
}
