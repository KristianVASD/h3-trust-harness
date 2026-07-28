import { useMemo } from "react";
import { NavLink, useParams } from "react-router-dom";
import {
  resolveSourceGaps,
  type Company,
  type Mission,
  type Review,
  type SearchPlan,
  type Source,
} from "@h3-trust/schema";
import {
  countTrustedLists,
  deriveWorkerStepState,
  nextIncompleteWorkerStep,
} from "../lib/worker";

interface Props {
  mission: Mission;
  sources: Source[];
  catalogue: Source[];
  companies: Company[];
  reviews: Review[];
  searchPlan: SearchPlan | null;
}

function countNeedsProfileLocal(companies: Company[]): number {
  return companies.filter(
    (c) => c.capabilities.length === 0 && !(c.profileSnippet ?? "").trim(),
  ).length;
}

/**
 * Coverage-aware summary strip — counts + next Worker step.
 * Replaces the old observation → deep_check phase theatre.
 */
export function ProcesIndicator({
  mission,
  sources,
  catalogue,
  companies,
  reviews,
  searchPlan,
}: Props) {
  const { missionId = "" } = useParams();

  const stats = useMemo(() => {
    const planEntries = searchPlan?.entries ?? [];
    const derived = deriveWorkerStepState({
      mission,
      sources,
      companies,
      planEntries,
      catalogue,
    });
    const nextStep = nextIncompleteWorkerStep({
      mission,
      sources,
      companies,
      planEntries,
      catalogue,
    });

    const gapRows = resolveSourceGaps(
      catalogue,
      mission.location,
      mission.sector,
      planEntries,
    );
    const gapCount = gapRows.filter((r) => r.status === "gap").length;
    const trustedCount = countTrustedLists(sources);
    const thinProfiles = countNeedsProfileLocal(companies);

    const reviewedCompanyIds = new Set(
      reviews.filter((r) => r.targetType === "company").map((r) => r.targetId),
    );
    const caraCompanyQueue = companies.filter(
      (c) =>
        (c.status === "candidate" || c.status === "target") &&
        !reviewedCompanyIds.has(c.id),
    ).length;

    const stepLabel =
      nextStep.charAt(0).toUpperCase() + nextStep.slice(1).replace("-", " ");

    return {
      gapCount,
      totalCategories: gapRows.length,
      trustedCount,
      alignQueue: derived.alignQueue,
      thinProfiles,
      caraCompanyQueue,
      coverageScore: derived.coverage?.completenessScore ?? null,
      ready: Boolean(derived.coverage?.readyForSearch),
      nextStep,
      nextAction: `Continue in Data Worker · ${stepLabel}`,
      nextLink: `/work/${missionId}/${nextStep}`,
    };
  }, [mission, sources, catalogue, companies, reviews, searchPlan, missionId]);

  return (
    <div className="proces-indicator">
      <div className="proces-tellers">
        <NavLink
          to={`/work/${missionId}/gaps`}
          className="teller teller-gaps"
          title="Open gaps in Data Worker"
        >
          {stats.gapCount}/{stats.totalCategories} gaps
        </NavLink>
        <NavLink
          to={`/work/${missionId}/align`}
          className="teller teller-cara-source"
          title="Align queue"
        >
          {stats.alignQueue} align
        </NavLink>
        <NavLink
          to={`/work/${missionId}/brief`}
          className="teller teller-trusted"
          title="Trusted lists"
        >
          {stats.trustedCount} trusted
        </NavLink>
        <NavLink
          to={`/work/${missionId}/profile`}
          className="teller teller-profile"
          title="Thin profiles"
        >
          {stats.thinProfiles} thin
        </NavLink>
        <NavLink
          to={`/missions/${missionId}/cara?target=company`}
          className="teller teller-cara-company"
          title="Company align queue"
        >
          {stats.caraCompanyQueue} co. review
        </NavLink>
        {stats.coverageScore != null ? (
          <NavLink
            to={`/work/${missionId}/coverage`}
            className="teller teller-coverage"
            title="Mission coverage"
          >
            {stats.coverageScore}%
            {stats.ready ? " ready" : ""}
          </NavLink>
        ) : null}
      </div>

      <div className="proces-next">
        <NavLink to={stats.nextLink} className="next-action">
          → {stats.nextAction}
        </NavLink>
      </div>
    </div>
  );
}
