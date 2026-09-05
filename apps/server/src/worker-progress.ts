export const WORKER_COMMANDS = [
  "discover",
  "probe",
  "extract",
  "harvest",
  "coverage",
  "search",
  "full_mission",
  "nation_map",
  "nation_harvest",
  "place_test",
] as const;
export type WorkerCommand = (typeof WORKER_COMMANDS)[number];

export const WORKER_TARGET_TYPES = [
  "mission",
  "source",
  "company",
  "gap",
  "search",
  "country",
] as const;
export type WorkerTargetType = (typeof WORKER_TARGET_TYPES)[number];

export const WORKER_STATUSES = [
  "queued",
  "running",
  "waiting_human",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export type WorkerStatus = (typeof WORKER_STATUSES)[number];

export const WORKER_EVENT_LEVELS = [
  "debug",
  "info",
  "warn",
  "error",
  "success",
] as const;
export type WorkerEventLevel = (typeof WORKER_EVENT_LEVELS)[number];

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
  level: WorkerEventLevel;
  event_type: string;
  step_name: string | null;
  message: string;
  data: Record<string, unknown>;
  created_at: string;
};

export function isWorkerCommand(value: string): value is WorkerCommand {
  return (WORKER_COMMANDS as readonly string[]).includes(value);
}

export function isWorkerTargetType(value: string): value is WorkerTargetType {
  return (WORKER_TARGET_TYPES as readonly string[]).includes(value);
}

export function isWorkerStatus(value: string): value is WorkerStatus {
  return (WORKER_STATUSES as readonly string[]).includes(value);
}
