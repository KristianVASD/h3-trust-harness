import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { WebSocket } from "ws";
import type { WorkerEventLevel, WorkerRun, WorkerStatus } from "./types.js";

if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket =
    WebSocket;
}

let db: SupabaseClient | null = null;

export function getDb(): SupabaseClient {
  if (db) return db;
  const url = process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return db;
}

export async function claimNextQueuedRun(): Promise<WorkerRun | null> {
  const client = getDb();
  const { data: queued, error } = await client
    .from("worker_runs")
    .select("*")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`claim list: ${error.message}`);
  if (!queued) return null;

  const now = new Date().toISOString();
  const { data: claimed, error: claimErr } = await client
    .from("worker_runs")
    .update({
      status: "running",
      started_at: now,
      heartbeat_at: now,
      current_action: "Claimed",
      updated_at: now,
    })
    .eq("id", queued.id)
    .eq("status", "queued")
    .select("*")
    .maybeSingle();
  if (claimErr) throw new Error(`claim update: ${claimErr.message}`);
  return (claimed as WorkerRun | null) ?? null;
}

export async function getRun(id: string): Promise<WorkerRun | null> {
  const { data, error } = await getDb()
    .from("worker_runs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`get run: ${error.message}`);
  return (data as WorkerRun | null) ?? null;
}

const lastBeat = new Map<string, { at: number; action: string }>();

export async function heartbeat(
  runId: string,
  currentAction: string,
  extra: Partial<{
    progress_pct: number;
    step_index: number;
    phase: string;
    cursor: Record<string, unknown>;
  }> = {},
): Promise<void> {
  const prev = lastBeat.get(runId);
  const nowMs = Date.now();
  if (prev && prev.action === currentAction && nowMs - prev.at < 15_000) {
    return;
  }
  lastBeat.set(runId, { at: nowMs, action: currentAction });
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    heartbeat_at: now,
    current_action: currentAction,
    updated_at: now,
  };
  if (extra.progress_pct !== undefined) patch.progress_pct = extra.progress_pct;
  if (extra.step_index !== undefined) patch.step_index = extra.step_index;
  if (extra.phase !== undefined) patch.phase = extra.phase;
  if (extra.cursor !== undefined) patch.cursor = extra.cursor;
  const { error } = await getDb()
    .from("worker_runs")
    .update(patch)
    .eq("id", runId);
  if (error) console.warn(`heartbeat: ${error.message}`);
}

export async function requeueRun(runId: string, reason: string): Promise<void> {
  lastBeat.delete(runId);
  const now = new Date().toISOString();
  const { error } = await getDb()
    .from("worker_runs")
    .update({
      status: "queued",
      current_action: "Waiting for model quota",
      error: reason.slice(0, 500),
      finished_at: null,
      updated_at: now,
    })
    .eq("id", runId);
  if (error) throw new Error(`requeue: ${error.message}`);
}

export async function markStatus(
  runId: string,
  status: WorkerStatus,
  args: {
    currentAction?: string;
    error?: string | null;
    progressPct?: number;
    outputSummary?: Record<string, unknown>;
  } = {},
): Promise<void> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status,
    updated_at: now,
    heartbeat_at: now,
  };
  if (args.currentAction !== undefined) patch.current_action = args.currentAction;
  if (args.error !== undefined) patch.error = args.error;
  if (args.progressPct !== undefined) patch.progress_pct = args.progressPct;
  if (args.outputSummary !== undefined) patch.output_summary = args.outputSummary;
  if (
    status === "succeeded" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "waiting_human"
  ) {
    patch.finished_at = now;
  }
  const { error } = await getDb().from("worker_runs").update(patch).eq("id", runId);
  if (error) throw new Error(`mark ${status}: ${error.message}`);
}

export async function writeEvent(
  run: WorkerRun,
  args: {
    event_type: string;
    message: string;
    level?: WorkerEventLevel;
    step_name?: string;
    data?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await getDb().from("worker_events").insert({
    run_id: run.id,
    mission_id: run.mission_id,
    level: args.level ?? "info",
    event_type: args.event_type,
    step_name: args.step_name ?? null,
    message: args.message,
    data: args.data ?? {},
  });
  if (error) console.warn(`event: ${error.message}`);
}

export async function loadRecentLessons(
  missionId: string,
  limit = 20,
): Promise<Array<{ event_type: string; message: string; data: Record<string, unknown> }>> {
  const { data, error } = await getDb()
    .from("worker_events")
    .select("event_type, message, data")
    .eq("mission_id", missionId)
    .in("event_type", ["lesson", "step_failed", "strategy_note"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`lessons: ${error.message}`);
  return (data ?? []) as Array<{
    event_type: string;
    message: string;
    data: Record<string, unknown>;
  }>;
}
