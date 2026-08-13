import {
  computeMissionCoverage,
  isBlockingBarrier,
  resolveSourceGaps,
  type Company,
  type Mission,
  type MissionCoverage,
  type SearchPlanEntry,
  type Source,
} from "@h3-trust/schema";

/** Matches Discovery Brief success criteria — Extract unlocks at this count. */
export const TRUSTED_LIST_UNLOCK = 5;

export function countTrustedLists(sources: Source[]): number {
  return sources.filter(
    (s) => s.status === "accepted" || s.status === "adjusted",
  ).length;
}

export function isTrustedSource(source: Source): boolean {
  return source.status === "accepted" || source.status === "adjusted";
}

export function countBlockingBarriers(sources: Source[]): number {
  return sources.filter(
    (s) => s.accessBarrier && isBlockingBarrier(s.accessBarrier),
  ).length;
}

export type WorkerStepId =
  | "brief"
  | "gaps"
  | "probe"
  | "align"
  | "extract"
  | "profile"
  | "coverage"
  | "search";

export const WORKER_STEPS: {
  id: WorkerStepId;
  label: string;
  short: string;
}[] = [
  { id: "brief", label: "Brief", short: "1" },
  { id: "gaps", label: "Gaps", short: "2" },
  { id: "probe", label: "Probe", short: "3" },
  { id: "align", label: "Align (optional)", short: "4" },
  { id: "extract", label: "Extract", short: "5" },
  { id: "profile", label: "Profile", short: "6" },
  { id: "coverage", label: "Coverage", short: "7" },
  { id: "search", label: "Search", short: "8" },
];

/** Legacy 4-step paths → new spine. */
export const WORKER_LEGACY_REDIRECTS: Record<string, WorkerStepId> = {
  sources: "gaps",
  cara: "align",
  import: "extract",
  results: "coverage",
};

export function stepFromPath(pathname: string): WorkerStepId {
  const seg = pathname.split("/").filter(Boolean).pop() ?? "brief";
  if (seg in WORKER_LEGACY_REDIRECTS) {
    return WORKER_LEGACY_REDIRECTS[seg]!;
  }
  if (WORKER_STEPS.some((s) => s.id === seg)) {
    return seg as WorkerStepId;
  }
  return "brief";
}

export type WorkerStepState = {
  id: WorkerStepId;
  enabled: boolean;
  todoLabel: string;
  /** Soft “done” feel when the step’s primary todo is cleared. */
  settled: boolean;
};

function countUnprobed(sources: Source[]): number {
  return sources.filter(
    (s) =>
      s.probeStatus !== "probed" &&
      (s.status === "candidate" ||
        s.status === "draft" ||
        s.status === "pending_review" ||
        s.probeStatus === "unprobed" ||
        s.probeStatus === "probe-failed"),
  ).length;
}

function countAlignQueue(sources: Source[]): number {
  const caraQueue = sources.filter(
    (s) => s.status === "draft" || s.status === "pending_review",
  ).length;
  const probedCandidates = sources.filter(
    (s) => s.probeStatus === "probed" && s.status === "candidate",
  ).length;
  return caraQueue + probedCandidates;
}

function countGuidedTrusted(sources: Source[]): number {
  return sources.filter(
    (s) =>
      isTrustedSource(s) &&
      s.extractionGuide != null,
  ).length;
}

function countNeedsProfile(companies: Company[]): number {
  return companies.filter(
    (c) =>
      c.capabilities.length === 0 && !(c.profileSnippet ?? "").trim(),
  ).length;
}

/**
 * Per-step enable flags + todo labels derived from coverage / gaps / queues.
 */
export function deriveWorkerStepState(args: {
  mission: Mission | null;
  sources: Source[];
  companies: Company[];
  planEntries: SearchPlanEntry[];
  catalogue?: Source[];
}): {
  steps: WorkerStepState[];
  coverage: MissionCoverage | null;
  gapCount: number;
  totalCategories: number;
  trustedCount: number;
  alignQueue: number;
  unprobedCount: number;
} {
  const { mission, sources, companies, planEntries, catalogue } = args;
  const loaded = mission != null;

  const gapRows = mission
    ? resolveSourceGaps(
        catalogue ?? sources,
        mission.location,
        mission.sector,
        planEntries,
      )
    : [];
  const gapCount = gapRows.filter((r) => r.status === "gap").length;
  const totalCategories = gapRows.length;

  const coverage = loaded
    ? computeMissionCoverage({ sources, companies, planEntries })
    : null;

  const trustedCount = countTrustedLists(sources);
  const unprobedCount = countUnprobed(sources);
  const alignQueue = countAlignQueue(sources);
  const guidedTrusted = countGuidedTrusted(sources);
  const needsProfile = countNeedsProfile(companies);
  const candidateCount = sources.filter((s) => s.status === "candidate").length;
  const barrierCount = countBlockingBarriers(sources);

  const probeEnabled =
    loaded &&
    (unprobedCount > 0 ||
      candidateCount > 0 ||
      sources.some((s) => s.probeStatus === "probe-failed"));
  const extractEnabled = loaded && sources.length > 0;
  const profileEnabled = loaded && companies.length > 0;

  const steps: WorkerStepState[] = [
    {
      id: "brief",
      enabled: loaded,
      todoLabel: loaded ? `${gapCount} gaps` : "",
      settled: loaded,
    },
    {
      id: "gaps",
      enabled: loaded,
      todoLabel: gapCount > 0 ? `${gapCount} open` : "filled",
      settled: loaded && gapCount === 0,
    },
    {
      id: "probe",
      enabled: probeEnabled || (loaded && sources.some((s) => s.probeStatus === "probed")),
      todoLabel:
        unprobedCount > 0
          ? `${unprobedCount} unprobed`
          : sources.some((s) => s.probeStatus === "probed")
            ? "probed"
            : "",
      settled: loaded && unprobedCount === 0 && sources.some((s) => s.probeStatus === "probed"),
    },
    {
      id: "align",
      enabled: loaded,
      todoLabel:
        alignQueue > 0 ? `${alignQueue} queue · optional` : "optional",
      settled: true,
    },
    {
      id: "extract",
      enabled: extractEnabled,
      todoLabel:
        barrierCount > 0
          ? `${barrierCount} barrier${barrierCount === 1 ? "" : "s"}`
          : guidedTrusted > 0
            ? `${guidedTrusted} guided`
            : trustedCount > 0
              ? `${trustedCount} trusted`
              : "",
      settled: loaded && companies.length > 0 && barrierCount === 0,
    },
    {
      id: "profile",
      enabled: profileEnabled,
      todoLabel:
        companies.length === 0
          ? "optional"
          : needsProfile > 0
            ? `${needsProfile} thin · optional`
            : `${companies.length} co`,
      settled: true,
    },
    {
      id: "coverage",
      enabled: loaded,
      todoLabel: coverage
        ? `${coverage.completenessScore}%`
        : "",
      settled: Boolean(coverage?.readyForSearch),
    },
    {
      id: "search",
      enabled: loaded,
      todoLabel: companies.length > 0 ? "ready" : "needs companies",
      settled: loaded && companies.length > 0,
    },
  ];

  // Probe: if no sources at all, keep enabled so empty state is reachable after gaps
  if (loaded && sources.length === 0) {
    const probe = steps.find((s) => s.id === "probe");
    if (probe) probe.enabled = true;
  }

  return {
    steps,
    coverage,
    gapCount,
    totalCategories,
    trustedCount,
    alignQueue,
    unprobedCount,
  };
}

export type WorkerNextAction = {
  id: WorkerStepId;
  label: string;
  detail: string;
};

/** Production next click — Align / Profile / remaining gaps are not brakes. */
export function nextWorkerAction(args: {
  mission: Mission | null;
  sources: Source[];
  companies: Company[];
  planEntries: SearchPlanEntry[];
  catalogue?: Source[];
}): WorkerNextAction {
  if (!args.mission) {
    return { id: "brief", label: "Open brief", detail: "Loading job…" };
  }
  if (args.sources.length === 0) {
    return {
      id: "gaps",
      label: "Add a source list",
      detail: "Warm-start the catalogue or onboard a CSV pack from Mission Control.",
    };
  }
  if (args.companies.length === 0) {
    return {
      id: "extract",
      label: "Import companies",
      detail: "Paste or upload the source CSV. Align is optional.",
    };
  }
  return {
    id: "search",
    label: "Preview search",
    detail: `${args.companies.length} companies are searchable from this job.`,
  };
}

/** First unsettled enabled worker step — used by Investigator “Open Data Worker” CTA. */
export function nextIncompleteWorkerStep(args: {
  mission: Mission | null;
  sources: Source[];
  companies: Company[];
  planEntries: SearchPlanEntry[];
  catalogue?: Source[];
}): WorkerStepId {
  return nextWorkerAction(args).id;
}
