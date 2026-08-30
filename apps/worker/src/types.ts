export type WorkerCommand =
  | "discover"
  | "probe"
  | "extract"
  | "harvest"
  | "coverage"
  | "search"
  | "full_mission"
  | "nation_map";

export type WorkerStatus =
  | "queued"
  | "running"
  | "waiting_human"
  | "succeeded"
  | "failed"
  | "cancelled";

export type WorkerRun = {
  id: string;
  mission_id: string | null;
  command: WorkerCommand;
  target_type: string | null;
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

export type WorkerEventLevel = "debug" | "info" | "warn" | "error" | "success";

export type EngineAction =
  | "discover"
  | "probe"
  | "extract"
  | "harvest"
  | "coverage"
  | "search"
  | "align"
  | "done";

export type EngineDecision = {
  action: EngineAction;
  sourceId?: string;
  companyId?: string;
  gap?: { layer: string; category: string; nuance_rule?: string };
  lesson?: string;
  reason?: string;
};
