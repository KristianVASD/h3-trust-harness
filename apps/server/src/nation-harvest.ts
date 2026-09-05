import {
  HOME_MAINTENANCE_SECTOR,
  TRADE_IDS,
  type TradeId,
} from "@h3-trust/schema";
import type { Store } from "@h3-trust/store";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureNationalPack, ensurePlaceMission } from "./pack-onboard-route.js";
import type { WorkerRun } from "./worker-progress.js";

const NATION_MAX_STEPS = 24;
const PLACE_MAX_STEPS = 16;

export async function enqueueNationHarvest(args: {
  admin: SupabaseClient;
  store: Store;
  country: string;
  model?: string;
}): Promise<{ parent: WorkerRun; children: WorkerRun[] }> {
  const country = args.country.trim() || "Netherlands";
  const children: WorkerRun[] = [];
  const childIds: string[] = [];

  for (const tradeId of TRADE_IDS) {
    const { mission } = await ensureNationalPack(args.store, {
      country,
      sector: HOME_MAINTENANCE_SECTOR,
      subsector: tradeId,
    });
    const run = await insertRun(args.admin, {
      missionId: mission.id,
      command: "full_mission",
      targetType: "mission",
      currentAction: `Queued ${tradeId} · ${country}`,
      stepTotal: NATION_MAX_STEPS,
      input: {
        model: args.model,
        country,
        tradeId,
        maxSteps: NATION_MAX_STEPS,
        scope: "national_sector",
        allowLocalCommunity: false,
      },
    });
    children.push(run);
    childIds.push(run.id);
  }

  const parent = await insertRun(args.admin, {
    missionId: null,
    command: "nation_harvest",
    targetType: "country",
    targetId: country,
    currentAction: `Fan-out ${TRADE_IDS.length} doors · ${country}`,
    stepTotal: TRADE_IDS.length,
    status: "succeeded",
    progressPct: 100,
    input: {
      model: args.model,
      country,
      childRunIds: childIds,
      scope: "national_sector",
    },
  });

  return { parent, children };
}

export async function enqueuePlaceTest(args: {
  admin: SupabaseClient;
  store: Store;
  country: string;
  location: string;
  tradeId?: TradeId;
  model?: string;
}): Promise<{ run: WorkerRun; missionId: string; created: boolean }> {
  const country = args.country.trim() || "Netherlands";
  const location = args.location.trim() || "Alkmaar";
  const tradeId = args.tradeId ?? "paint";
  const { mission, created } = await ensurePlaceMission(args.store, {
    country,
    location,
    sector: HOME_MAINTENANCE_SECTOR,
    subsector: tradeId,
  });
  const run = await insertRun(args.admin, {
    missionId: mission.id,
    command: "full_mission",
    targetType: "mission",
    currentAction: `Queued place test · ${location} · ${tradeId}`,
    stepTotal: PLACE_MAX_STEPS,
    input: {
      model: args.model,
      country,
      location,
      tradeId,
      maxSteps: PLACE_MAX_STEPS,
      scope: "place_test",
      allowLocalCommunity: true,
    },
  });
  return { run, missionId: mission.id, created };
}

async function insertRun(
  admin: SupabaseClient,
  row: {
    missionId: string | null;
    command: string;
    targetType: string;
    targetId?: string;
    currentAction: string;
    stepTotal: number;
    status?: "queued" | "succeeded";
    progressPct?: number;
    input: Record<string, unknown>;
  },
): Promise<WorkerRun> {
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("worker_runs")
    .insert({
      mission_id: row.missionId,
      command: row.command,
      target_type: row.targetType,
      target_id: row.targetId ?? null,
      status: row.status ?? "queued",
      current_action: row.currentAction,
      input: row.input,
      step_total: row.stepTotal,
      progress_pct: row.progressPct ?? 0,
      finished_at: row.status === "succeeded" ? now : null,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to enqueue worker run");
  }
  return data as WorkerRun;
}
