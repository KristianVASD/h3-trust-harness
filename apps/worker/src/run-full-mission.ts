import type { SearchPlan } from "@h3-trust/schema";
import { decideNextStep } from "./decide.js";
import { h3 } from "./h3-api.js";
import { getRun, heartbeat, loadRecentLessons, markStatus, writeEvent } from "./progress.js";
import { processNationMap } from "./run-nation-map.js";
import { executeDecision } from "./run-step.js";
import type { WorkerRun } from "./types.js";

const DEFAULT_MAX_STEPS = 24;

async function loadPlan(version: string | undefined): Promise<SearchPlan | null> {
  if (!version) return null;
  try {
    return await h3.getSearchPlan(version);
  } catch {
    return null;
  }
}

export async function processRun(run: WorkerRun): Promise<void> {
  if (run.command === "nation_harvest") {
    await markStatus(run.id, "succeeded", {
      currentAction: "Fan-out already queued",
      progressPct: 100,
      outputSummary: { childRunIds: run.input.childRunIds ?? [] },
    });
    return;
  }
  if (run.command === "nation_map") {
    await processNationMap(run);
    return;
  }

  const missionId = run.mission_id;
  if (!missionId) {
    await markStatus(run.id, "failed", {
      currentAction: "No mission_id",
      error: "Run has no mission_id",
      progressPct: 0,
    });
    return;
  }

  await heartbeat(run.id, "Loading mission context", { phase: "context" });
  const [mission, sources, companies, coverage, reviews] = await Promise.all([
    h3.getMission(missionId),
    h3.getSources(missionId),
    h3.getCompanies(missionId),
    h3.getCoverage(missionId),
    h3.getReviews(missionId).catch(() => []),
  ]);
  const plan = await loadPlan(mission.search_plan_version);
  const lessons = await loadRecentLessons(missionId);

  await writeEvent(run, {
    event_type: "context_loaded",
    message: "Loaded mission context",
    data: {
      sourceCount: sources.length,
      companyCount: companies.length,
      coverage,
    },
  });

  const maxSteps =
    run.command === "full_mission"
      ? Number(run.input.maxSteps ?? run.step_total ?? DEFAULT_MAX_STEPS) ||
        DEFAULT_MAX_STEPS
      : 1;
  const model =
    typeof run.input.model === "string" ? run.input.model : undefined;

  let stepIndex = run.step_index || 0;
  const summaries: Array<Record<string, unknown>> = [];
  const attemptedGaps = new Set<string>();

  while (stepIndex < maxSteps) {
    const live = await getRun(run.id);
    if (!live || live.status === "cancelled") {
      await writeEvent(run, {
        event_type: "cancelled",
        level: "warn",
        message: "Run cancelled; stopping",
      });
      return;
    }

    const [freshSources, freshCompanies, freshCoverage] = await Promise.all([
      h3.getSources(missionId),
      h3.getCompanies(missionId),
      h3.getCoverage(missionId),
    ]);

    const { decision, via } = await decideNextStep({
      command: run.command,
      targetId: run.target_id,
      model,
      mission,
      sources: freshSources,
      companies: freshCompanies,
      coverage: freshCoverage,
      plan,
      reviews,
      lessons,
      allowLocalCommunity: run.input.allowLocalCommunity === true,
      attemptedGaps,
    });

    await writeEvent(run, {
      event_type: "decision",
      step_name: decision.action,
      message: `Next step: ${decision.action} (${via})`,
      data: { ...decision, via },
    });

    const pct = Math.min(99, Math.round(((stepIndex + 1) / maxSteps) * 100));
    await heartbeat(run.id, `Running ${decision.action}`, {
      step_index: stepIndex + 1,
      progress_pct: pct,
      phase: decision.action,
      cursor: { stepIndex, action: decision.action },
    });

    const result = await executeDecision(run, missionId, decision);
    summaries.push(result.summary);
    stepIndex += 1;
    if (decision.action === "discover" && decision.gap) {
      attemptedGaps.add(`${decision.gap.layer}:${decision.gap.category}`);
    }

    if (result.waitingHuman) {
      await markStatus(run.id, "waiting_human", {
        currentAction: decision.reason ?? "Waiting for human",
        progressPct: pct,
        outputSummary: { steps: summaries },
      });
      return;
    }
    if (result.done || run.command !== "full_mission") {
      await markStatus(run.id, "succeeded", {
        currentAction: "Succeeded",
        progressPct: 100,
        outputSummary: { steps: summaries },
      });
      await writeEvent(run, {
        event_type: "run_succeeded",
        level: "success",
        message: "Run succeeded",
        data: { steps: summaries },
      });
      return;
    }
  }

  await markStatus(run.id, "succeeded", {
    currentAction: "Step cap reached",
    progressPct: 100,
    outputSummary: { steps: summaries, capped: true },
  });
  await writeEvent(run, {
    event_type: "run_succeeded",
    level: "success",
    message: `Stopped after ${maxSteps} steps`,
    data: { capped: true },
  });
}
