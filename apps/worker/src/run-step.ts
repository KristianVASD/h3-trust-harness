import { h3 } from "./h3-api.js";
import { heartbeat, writeEvent } from "./progress.js";
import type { EngineDecision, WorkerRun } from "./types.js";

export async function executeDecision(
  run: WorkerRun,
  missionId: string,
  decision: EngineDecision,
): Promise<{ summary: Record<string, unknown>; waitingHuman?: boolean; done?: boolean }> {
  const step = decision.action;

  if (step === "done") {
    await writeEvent(run, {
      event_type: "decision",
      step_name: "done",
      level: "success",
      message: decision.reason ?? "No further automated step",
      data: decision,
    });
    return { summary: { action: "done" }, done: true };
  }

  if (step === "align" || step === "search") {
    await writeEvent(run, {
      event_type: "waiting_human",
      step_name: step,
      level: "warn",
      message:
        step === "search"
          ? "Search stays a human/visitor surface."
          : (decision.reason ?? "Waiting for CURAD / human alignment"),
      data: decision,
    });
    return { summary: { action: step }, waitingHuman: true };
  }

  await heartbeat(run.id, `Starting ${step}`);
  await writeEvent(run, {
    event_type: "step_started",
    step_name: step,
    message: `Starting ${step}${decision.sourceId ? ` ${decision.sourceId}` : ""}${decision.companyId ? ` ${decision.companyId}` : ""}`,
    data: decision,
  });

  try {
    let result: unknown;
    if (step === "discover") {
      if (!decision.gap) throw new Error("discover needs a gap");
      result = await h3.discover(missionId, decision.gap);
    } else if (step === "probe") {
      if (!decision.sourceId) throw new Error("probe needs sourceId");
      result = await h3.probe(missionId, decision.sourceId);
    } else if (step === "extract") {
      if (!decision.sourceId) throw new Error("extract needs sourceId");
      result = await h3.extract(missionId, decision.sourceId);
    } else if (step === "harvest") {
      if (!decision.companyId) throw new Error("harvest needs companyId");
      result = await h3.harvest(missionId, decision.companyId);
    } else if (step === "coverage") {
      result = await h3.getCoverage(missionId);
    } else {
      throw new Error(`Unsupported action ${step}`);
    }

    await writeEvent(run, {
      event_type: "step_succeeded",
      step_name: step,
      level: "success",
      message: `${step} completed`,
      data: { action: step, resultPreview: summarize(result) },
    });
    if (decision.lesson) {
      await writeEvent(run, {
        event_type: "lesson",
        step_name: step,
        level: "info",
        message: decision.lesson,
        data: { lesson: decision.lesson },
      });
    }
    return { summary: { action: step, ok: true } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await writeEvent(run, {
      event_type: "step_failed",
      step_name: step,
      level: "error",
      message,
      data: {
        action: step,
        lesson:
          decision.lesson ??
          "Store this failure and use it before retrying similar targets.",
      },
    });
    throw err;
  }
}

function summarize(value: unknown): unknown {
  if (value && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    const keys = Object.keys(rec).slice(0, 8);
    const out: Record<string, unknown> = {};
    for (const k of keys) {
      const v = rec[k];
      if (Array.isArray(v)) out[k] = { length: v.length };
      else if (v && typeof v === "object") out[k] = "{…}";
      else out[k] = v;
    }
    return out;
  }
  return value;
}
