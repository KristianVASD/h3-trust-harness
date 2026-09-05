import { loadRootEnv } from "./load-env.js";
import {
  DEFAULT_OPENROUTER_MODEL,
  isRateLimitError,
  openRouterCooldownMs,
} from "./openrouter.js";
import { startPromptDesk } from "./prompt-desk.js";
import { claimNextQueuedRun, markStatus, requeueRun, writeEvent } from "./progress.js";
import { processRun } from "./run-full-mission.js";
import type { WorkerRun } from "./types.js";

loadRootEnv();

const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 5000) || 5000;
const MODEL = process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL;
const REQUESTED = Math.max(1, Number(process.env.WORKER_CONCURRENCY ?? 1) || 1);
const CONCURRENCY = MODEL.includes(":free") ? 1 : REQUESTED;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function handleRun(run: WorkerRun): Promise<void> {
  console.log(`Claimed ${run.id} ${run.command} mission=${run.mission_id}`);
  try {
    await processRun(run);
    console.log(`Finished ${run.id}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isRateLimitError(err)) {
      console.warn(`Run ${run.id} requeued — model quota: ${message.slice(0, 180)}`);
      await writeEvent(run, {
        event_type: "strategy_note",
        level: "warn",
        message: "OpenRouter rate-limited — run put back in queue",
        data: { lesson: message.slice(0, 400) },
      });
      await requeueRun(run.id, message);
      return;
    }
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

  startPromptDesk();
  console.log("H3 worker listening for queued runs");
  console.log(`H3_API_BASE=${process.env.H3_API_BASE ?? "http://localhost:8787"}`);
  console.log(`OPENROUTER_MODEL=${MODEL}`);
  console.log(`WORKER_CONCURRENCY=${CONCURRENCY}${MODEL.includes(":free") && REQUESTED > 1 ? " (capped — free model)" : ""}`);
  console.log(
    (process.env.OPENROUTER_DECIDE ?? "").trim() === "1"
      ? "Decide uses OpenRouter"
      : "Decide uses heuristic (set OPENROUTER_DECIDE=1 to spend model quota on routing)",
  );
  if (!process.env.OPENROUTER_API_KEY) {
    console.log("OPENROUTER_API_KEY unset — discover/rate need a key; scrape still runs");
  }

  const inflight = new Set<Promise<void>>();
  while (true) {
    try {
      const cool = openRouterCooldownMs();
      if (cool > 0 && inflight.size === 0) {
        console.warn(`OpenRouter cool-down ${Math.round(cool / 1000)}s — not claiming`);
        await sleep(Math.min(cool, 15_000));
        continue;
      }
      while (inflight.size < CONCURRENCY && openRouterCooldownMs() === 0) {
        const run = await claimNextQueuedRun();
        if (!run) break;
        const task = handleRun(run).finally(() => {
          inflight.delete(task);
        });
        inflight.add(task);
      }
      if (inflight.size === 0) {
        await sleep(POLL_MS);
        continue;
      }
      await Promise.race(inflight);
    } catch (err) {
      console.error("Worker loop error:", err instanceof Error ? err.message : err);
      await sleep(POLL_MS);
    }
  }
}

void main();
