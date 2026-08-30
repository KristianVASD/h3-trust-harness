import { loadRootEnv } from "./load-env.js";
import { claimNextQueuedRun, markStatus, writeEvent } from "./progress.js";
import { processRun } from "./run-full-mission.js";

loadRootEnv();

const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 5000) || 5000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const missing: string[] = [];
  if (!process.env.SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!process.env.H3_WORKER_TOKEN) missing.push("H3_WORKER_TOKEN");
  if (missing.length) {
    console.error(`Missing env: ${missing.join(", ")}`);
    process.exit(1);
  }

  console.log("H3 worker listening for queued runs");
  console.log(`H3_API_BASE=${process.env.H3_API_BASE ?? "http://localhost:8787"}`);
  if (!process.env.OPENROUTER_API_KEY) {
    console.log("OPENROUTER_API_KEY unset — using heuristic decisions");
  }

  while (true) {
    try {
      const run = await claimNextQueuedRun();
      if (!run) {
        await sleep(POLL_MS);
        continue;
      }
      console.log(`Claimed ${run.id} ${run.command} mission=${run.mission_id}`);
      try {
        await processRun(run);
        console.log(`Finished ${run.id}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Run ${run.id} failed:`, message);
        await writeEvent(run, {
          event_type: "step_failed",
          level: "error",
          message,
          data: {
            lesson: "Store this failure and use it before retrying similar targets.",
          },
        });
        await markStatus(run.id, "failed", {
          currentAction: "Failed",
          error: message,
        });
      }
    } catch (err) {
      console.error("Worker loop error:", err instanceof Error ? err.message : err);
      await sleep(POLL_MS);
    }
  }
}

void main();
