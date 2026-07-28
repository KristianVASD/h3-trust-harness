/**
 * Phase 4 — Probe orchestration.
 * Runs runOcCommand("probe"), merges buildProbeSourcePatch onto the Source.
 */
import {
  DEFAULT_SEARCH_PLAN_VERSION,
  SOURCE_FIELD_KEYS,
  type Mission,
  type SearchPlan,
  type Source,
} from "@h3-trust/schema";
import type { FileStore } from "@h3-trust/store";
import type { ProbeOutput } from "@h3-trust/schema/omega";
import {
  buildProbeSourcePatch,
  runOcCommand,
  SOURCE_FIELD_KEYS as ADAPTER_FIELDS,
} from "./adapter.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ProbeRouteResult = {
  output: ProbeOutput;
  source: Source;
};

export async function runProbeForMission(
  store: FileStore,
  missionId: string,
  rawBody: unknown,
  loadPlan: (version: string) => Promise<SearchPlan | null>,
): Promise<ProbeRouteResult> {
  const mission = await store.getMission(missionId);
  if (!mission) {
    throw new ProbeRouteError("Mission not found", 404);
  }

  const sourceId =
    rawBody &&
    typeof rawBody === "object" &&
    "sourceId" in rawBody &&
    typeof (rawBody as { sourceId: unknown }).sourceId === "string"
      ? (rawBody as { sourceId: string }).sourceId
      : "";
  if (!UUID_RE.test(sourceId)) {
    throw new ProbeRouteError("sourceId (uuid) required", 400);
  }

  const missionSources = await store.listByMission("sources", missionId);
  const source = missionSources.find((s) => s.id === sourceId);
  if (!source) {
    throw new ProbeRouteError("Source not found on this mission", 404);
  }

  const nuance_rule = await resolveNuanceRule(mission, source, loadPlan);
  const fieldUniverse =
    ADAPTER_FIELDS.length > 0 ? [...ADAPTER_FIELDS] : [...SOURCE_FIELD_KEYS];

  try {
    const output = await runOcCommand("probe", {
      missionId,
      sourceId: source.id,
      url: source.url,
      category: source.category,
      nuance_rule,
      context: missionContext(mission),
      fieldUniverse,
    });

    const patch = buildProbeSourcePatch(output);
    const updated = await store.upsert("sources", {
      ...source,
      ...patch,
    });

    return { output, source: updated };
  } catch (err) {
    if (err instanceof ProbeRouteError) throw err;
    const message = err instanceof Error ? err.message : "Probe failed";
    try {
      await store.upsert("sources", {
        ...source,
        probeStatus: "probe-failed",
        updatedAt: new Date().toISOString(),
      });
    } catch {
      /* best-effort failure stamp */
    }
    throw new ProbeRouteError(message, 400);
  }
}

async function resolveNuanceRule(
  mission: Mission,
  source: Source,
  loadPlan: (version: string) => Promise<SearchPlan | null>,
): Promise<string | undefined> {
  const version = mission.search_plan_version || DEFAULT_SEARCH_PLAN_VERSION;
  const plan = await loadPlan(version);
  if (!plan) return undefined;
  const entry = plan.entries.find(
    (e) => e.layer === source.scope && e.category === source.category,
  );
  return entry?.nuance_rule;
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

export class ProbeRouteError extends Error {
  status: 400 | 404 | 500;
  constructor(message: string, status: 400 | 404 | 500) {
    super(message);
    this.name = "ProbeRouteError";
    this.status = status;
  }
}
