/**
 * Phase 3 — Gaps → discover orchestration.
 * Loads mission context + recent Ω feedback, runs the adapter, persists candidates.
 */
import type { Store } from "@h3-trust/store";
import type { Mission, Review, Source } from "@h3-trust/schema";
import {
  DiscoverGapSchema,
  type DiscoverGap,
  type DiscoverOutput,
} from "@h3-trust/schema/omega";
import {
  buildDiscoverSourceRecords,
  runOcCommand,
  type DiscoverSkipped,
} from "./adapter.js";

export type DiscoverRouteResult = {
  output: DiscoverOutput;
  sources: Source[];
  skipped: DiscoverSkipped[];
};

export async function runDiscoverForMission(
  store: Store,
  missionId: string,
  rawGap: unknown,
): Promise<DiscoverRouteResult> {
  const mission = await store.getMission(missionId);
  if (!mission) {
    throw new DiscoverRouteError("Mission not found", 404);
  }

  let gap: DiscoverGap;
  try {
    gap = DiscoverGapSchema.parse(rawGap);
  } catch (err) {
    throw new DiscoverRouteError(
      err instanceof Error ? err.message : "Invalid gap payload",
      400,
    );
  }

  const missionSources = await store.listByMission("sources", missionId);
  const cellNames = missionSources
    .filter((s) => s.category === gap.category && s.scope === gap.layer)
    .map((s) => s.name);
  const allNames = missionSources.map((s) => s.name);
  const existingSourceNames = Array.from(new Set([...cellNames, ...allNames]));

  const reviews = await store.listByMission("reviews", missionId);
  const pendingFeedback = reviews.filter(
    (r) => r.reactsToProducer === "OmegaClaw" && !r.fedBackToOmega,
  );
  const recentFeedback = pendingFeedback.map((r) => ({
    decision: r.action,
    reason: r.reason,
  }));

  const output = await runOcCommand("discover", {
    missionId,
    gap,
    context: missionContext(mission),
    existingSourceNames,
    recentFeedback,
  });

  const { sources: drafts, skipped } = buildDiscoverSourceRecords(
    output,
    missionId,
  );

  const sources: Source[] = [];
  for (const draft of drafts) {
    sources.push(await store.createSourceInMission(missionId, draft));
  }

  for (const review of pendingFeedback) {
    await store.upsert("reviews", {
      ...review,
      fedBackToOmega: true,
      updatedAt: new Date().toISOString(),
    } satisfies Review);
  }

  return { output, sources, skipped };
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

export class DiscoverRouteError extends Error {
  status: 400 | 404 | 500;
  constructor(message: string, status: 400 | 404 | 500) {
    super(message);
    this.name = "DiscoverRouteError";
    this.status = status;
  }
}
