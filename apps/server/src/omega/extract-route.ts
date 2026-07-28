/**
 * Phase 6 — Gated extract orchestration.
 * Runs runExtractGated, persists Ω companies from unlocked sources only.
 */
import type { FileStore } from "@h3-trust/store";
import type { Company, Mission, Source } from "@h3-trust/schema";
import type { ExtractOutput } from "@h3-trust/schema/omega";
import {
  buildExtractCompanyRecords,
  runExtractGated,
  type BlockedSourceRef,
} from "./adapter.js";

export type ExtractRouteResult = {
  created: string[];
  companies: Company[];
  blocked: BlockedSourceRef[];
  notes?: string;
  output: ExtractOutput & { blocked: BlockedSourceRef[] };
};

export async function runExtractForSource(
  store: FileStore,
  missionId: string,
  sourceId: string,
): Promise<ExtractRouteResult> {
  const mission = await store.getMission(missionId);
  if (!mission) {
    throw new ExtractRouteError("Mission not found", 404);
  }

  const missionSources = await store.listByMission("sources", missionId);
  const source = missionSources.find((s) => s.id === sourceId);
  if (!source) {
    throw new ExtractRouteError("Source not found on this mission", 404);
  }

  if (source.status !== "accepted" && source.status !== "adjusted") {
    throw new ExtractRouteError("source not accepted", 400);
  }
  if (!source.extractionGuide) {
    throw new ExtractRouteError("source not probed (no extraction guide)", 400);
  }

  const existing = await store.listByMission("companies", missionId);
  const existingCompanyNames = existing.map((c) => c.name);

  const result = await runExtractGated(
    {
      missionId,
      sources: [
        {
          id: source.id,
          url: source.url,
          sourceFields: source.sourceFields ?? [],
          extractionGuide: source.extractionGuide,
        },
      ],
      context: missionContext(mission),
      existingCompanyNames,
    },
    missionSources,
  );

  const drafts = buildExtractCompanyRecords(result, missionId, source);
  const companies: Company[] = [];
  for (const draft of drafts) {
    companies.push(await store.upsert("companies", draft));
  }

  return {
    created: companies.map((c) => c.id),
    companies,
    blocked: result.blocked,
    notes: result.discoveryNotes,
    output: result,
  };
}

function missionContext(mission: Mission) {
  return {
    country: mission.country,
    location: mission.location,
    sector: mission.sector,
    subsector: mission.subsector,
    goal: mission.goal,
  };
}

export class ExtractRouteError extends Error {
  status: 400 | 404 | 500;
  constructor(message: string, status: 400 | 404 | 500) {
    super(message);
    this.name = "ExtractRouteError";
    this.status = status;
  }
}

/** Re-export for callers that need Source typing. */
export type { Source };
