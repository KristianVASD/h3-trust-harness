import { h3 } from "./h3-api.js";
import { logJobOutput, previewForEvent } from "./job-log.js";
import { liveDiscover } from "./live-discover.js";
import { liveExtract } from "./live-extract.js";
import { liveProbe } from "./live-probe.js";
import { heartbeat, writeEvent } from "./progress.js";
import { allowLocalCommunity } from "./scope.js";
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
    const model = typeof run.input.model === "string" ? run.input.model : undefined;
    let result: unknown;
    if (step === "discover") {
      if (!decision.gap) throw new Error("discover needs a gap");
      const [mission, sources] = await Promise.all([
        h3.getMission(missionId),
        h3.getSources(missionId),
      ]);
      const live = await liveDiscover({
        mission,
        gap: decision.gap,
        sources,
        model,
        allowLocalCommunity: allowLocalCommunity(run.input),
      });
      await logJobOutput({ runId: run.id, step: "discover", payload: live.payload });
      result = await h3.importOmega(missionId, "discover", live.payload);
    } else if (step === "probe") {
      if (!decision.sourceId) throw new Error("probe needs sourceId");
      const [mission, sources] = await Promise.all([
        h3.getMission(missionId),
        h3.getSources(missionId),
      ]);
      const source = sources.find((s) => s.id === decision.sourceId);
      if (!source) throw new Error("source not found");
      const payload = await liveProbe({ mission, source, model });
      await logJobOutput({ runId: run.id, step: "probe", payload });
      result = await h3.importOmega(missionId, "probe", payload);
    } else if (step === "extract") {
      if (!decision.sourceId) throw new Error("extract needs sourceId");
      const sources = await h3.getSources(missionId);
      const source = sources.find((s) => s.id === decision.sourceId);
      if (!source) throw new Error("source not found");
      const live = await liveExtract({ source });
      await logJobOutput({ runId: run.id, step: "extract", payload: live });
      result = await h3.importOmega(missionId, "extract", live.payload);
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
      data: { action: step, resultPreview: previewForEvent(result) },
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
