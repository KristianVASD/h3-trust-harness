import {
  isBlockingBarrier,
  resolveSourceGaps,
  type Company,
  type Mission,
  type MissionCoverage,
  type Review,
  type SearchPlan,
  type Source,
} from "@h3-trust/schema";
import { completeJson, DEFAULT_OPENROUTER_MODEL, parseJsonObject } from "./openrouter.js";
import { loadPrompt } from "./load-prompt.js";
import { isCommunityCategory } from "./scope.js";
import { isJunkCompanyName, isRegistryOrSearchWall } from "./source-guards.js";
import type { EngineAction, EngineDecision, WorkerCommand } from "./types.js";

const ACTIONS = new Set<EngineAction>([
  "discover",
  "probe",
  "extract",
  "harvest",
  "coverage",
  "search",
  "align",
  "done",
]);

function needsProfile(company: Company): boolean {
  if (isJunkCompanyName(company.name)) return false;
  return company.capabilities.length === 0 && !(company.profileSnippet ?? "").trim();
}

function firstGap(
  mission: Mission,
  sources: Source[],
  plan: SearchPlan | null,
  allowLocal: boolean,
): EngineDecision["gap"] | undefined {
  if (!plan) {
    return { layer: "national", category: "quality_mark" };
  }
  const rows = resolveSourceGaps(
    sources,
    mission.location,
    mission.sector,
    plan.entries,
  );
  const gap = rows.find((r) => {
    if (r.status !== "gap") return false;
    if (!allowLocal && (r.layer === "local" || r.layer === "regional")) {
      if (isCommunityCategory(r.category)) return false;
      if (r.layer === "local") return false;
    }
    if (!allowLocal && isCommunityCategory(r.category)) return false;
    return true;
  });
  if (!gap) return undefined;
  return {
    layer: gap.layer,
    category: gap.category,
    nuance_rule: gap.nuance_rule,
  };
}

function firstUnprobed(sources: Source[]): Source | undefined {
  return sources.find(
    (s) =>
      s.probeStatus !== "probed" &&
      (s.status === "candidate" ||
        s.status === "draft" ||
        s.status === "pending_review" ||
        s.probeStatus === "unprobed" ||
        s.probeStatus === "probe-failed"),
  );
}

function firstExtractable(sources: Source[], companies: Company[]): Source | undefined {
  const used = new Set(companies.flatMap((c) => c.source_ids));
  const eligible = (s: Source) =>
    s.status !== "rejected" &&
    Boolean(s.extractionGuide) &&
    !isRegistryOrSearchWall(s) &&
    !(s.accessBarrier && isBlockingBarrier(s.accessBarrier));
  return (
    sources.find((s) => eligible(s) && !used.has(s.id)) ??
    sources.find((s) => eligible(s))
  );
}

export function heuristicDecision(args: {
  command: WorkerCommand;
  targetId?: string | null;
  mission: Mission;
  sources: Source[];
  companies: Company[];
  plan: SearchPlan | null;
  allowLocalCommunity?: boolean;
}): EngineDecision {
  const { command, targetId, mission, sources, companies, plan } = args;
  const gap = firstGap(mission, sources, plan, args.allowLocalCommunity === true);
  const unprobed = firstUnprobed(sources);
  const extractable = firstExtractable(sources, companies);
  const thin = companies.find(needsProfile);
  const blocked = sources.find(
    (s) => s.accessBarrier && isBlockingBarrier(s.accessBarrier),
  );
  const alignQueue = sources.filter(
    (s) =>
      s.status === "draft" ||
      s.status === "pending_review" ||
      (s.probeStatus === "probed" && s.status === "candidate"),
  );

  if (command === "discover") {
    return { action: "discover", gap, reason: "Commanded discover" };
  }
  if (command === "probe") {
    const source = targetId
      ? sources.find((s) => s.id === targetId)
      : unprobed ?? sources[0];
    return {
      action: "probe",
      sourceId: source?.id,
      reason: "Commanded probe",
    };
  }
  if (command === "extract") {
    const source = targetId
      ? sources.find((s) => s.id === targetId)
      : extractable ?? sources[0];
    return {
      action: "extract",
      sourceId: source?.id,
      reason: "Commanded extract",
    };
  }
  if (command === "harvest") {
    const company = targetId
      ? companies.find((c) => c.id === targetId)
      : thin ?? companies[0];
    return {
      action: "harvest",
      companyId: company?.id,
      reason: "Commanded harvest",
    };
  }
  if (command === "coverage") {
    return { action: "coverage", reason: "Commanded coverage refresh" };
  }
  if (command === "search") {
    return { action: "search", reason: "Search is a human/visitor surface" };
  }

  if (gap) {
    return { action: "discover", gap, reason: "Open coverage gap" };
  }
  if (unprobed) {
    return { action: "probe", sourceId: unprobed.id, reason: "Unprobed source" };
  }
  if (blocked) {
    return {
      action: "align",
      sourceId: blocked.id,
      reason: "Blocking access barrier needs a human",
    };
  }
  if (extractable) {
    return {
      action: "extract",
      sourceId: extractable.id,
      reason: "Probed source ready to extract",
    };
  }
  if (thin) {
    return { action: "harvest", companyId: thin.id, reason: "Thin company profile" };
  }
  if (alignQueue.length > 0) {
    return {
      action: "align",
      sourceId: alignQueue[0]?.id,
      reason: "CURAD alignment queue",
    };
  }
  return { action: "done", reason: "No automated step left" };
}

function fromModel(raw: Record<string, unknown>): EngineDecision | null {
  const action = typeof raw.action === "string" ? raw.action : "";
  if (!ACTIONS.has(action as EngineAction)) return null;
  const gapRaw = raw.gap && typeof raw.gap === "object" ? (raw.gap as Record<string, unknown>) : null;
  const gap =
    gapRaw &&
    typeof gapRaw.layer === "string" &&
    typeof gapRaw.category === "string"
      ? {
          layer: gapRaw.layer,
          category: gapRaw.category,
          nuance_rule:
            typeof gapRaw.nuance_rule === "string" ? gapRaw.nuance_rule : undefined,
        }
      : undefined;
  return {
    action: action as EngineAction,
    sourceId: typeof raw.sourceId === "string" ? raw.sourceId : undefined,
    companyId: typeof raw.companyId === "string" ? raw.companyId : undefined,
    gap,
    lesson: typeof raw.lesson === "string" ? raw.lesson : undefined,
    reason: typeof raw.reason === "string" ? raw.reason : undefined,
  };
}

export async function decideNextStep(args: {
  command: WorkerCommand;
  targetId?: string | null;
  model?: string;
  mission: Mission;
  sources: Source[];
  companies: Company[];
  coverage: MissionCoverage;
  plan: SearchPlan | null;
  reviews: Review[];
  lessons: Array<{ event_type: string; message: string; data: Record<string, unknown> }>;
  allowLocalCommunity?: boolean;
}): Promise<{ decision: EngineDecision; via: "openrouter" | "heuristic" }> {
  const fallback = heuristicDecision(args);
  const key = (process.env.OPENROUTER_API_KEY ?? "").trim();
  if (!key) {
    return { decision: fallback, via: "heuristic" };
  }

  const pendingFeedback = args.reviews.filter(
    (r) => r.reactsToProducer === "OmegaClaw" && !r.fedBackToOmega,
  );
  const user = JSON.stringify(
    {
      command: args.command,
      targetId: args.targetId ?? null,
      mission: {
        id: args.mission.id,
        location: args.mission.location,
        country: args.mission.country,
        sector: args.mission.sector,
        subsector: args.mission.subsector,
        goal: args.mission.goal,
      },
      coverage: args.coverage,
      sources: args.sources.map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        category: s.category,
        scope: s.scope,
        probeStatus: s.probeStatus,
        hasGuide: Boolean(s.extractionGuide),
        barrier: s.accessBarrier?.kind ?? null,
      })),
      companies: args.companies.map((c) => ({
        id: c.id,
        name: c.name,
        thin: needsProfile(c),
        source_ids: c.source_ids,
      })),
      pendingFeedback: pendingFeedback.map((r) => ({
        action: r.action,
        reason: r.reason,
        targetType: r.targetType,
      })),
      recentLessons: args.lessons.slice(0, 12),
      heuristicHint: fallback,
      allowLocalCommunity: args.allowLocalCommunity === true,
      scope: args.allowLocalCommunity ? "place_test" : "national_sector",
    },
    null,
    2,
  );

  try {
    const raw = await completeJson({
      model:
        args.model ||
        process.env.OPENROUTER_MODEL ||
        DEFAULT_OPENROUTER_MODEL,
      system: loadPrompt("decide"),
      user,
    });
    const parsed = fromModel(parseJsonObject(raw));
    if (parsed) return { decision: parsed, via: "openrouter" };
  } catch (err) {
    fallback.lesson = `OpenRouter fallback: ${err instanceof Error ? err.message : String(err)}`;
  }
  return { decision: fallback, via: "heuristic" };
}
