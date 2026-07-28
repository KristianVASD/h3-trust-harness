import { useMemo } from "react";
import { NavLink, Outlet, useParams, useLocation } from "react-router-dom";
import { useMissionData } from "../hooks/useMissionData";
import { WorkerStepRail } from "../components/worker/WorkerStepRail";
import { TrustedPortfolioBar } from "../components/worker/TrustedPortfolioBar";
import {
  deriveWorkerStepState,
  stepFromPath,
} from "../lib/worker";

/**
 * Data Worker shell — Brief → Gaps → Probe → Align → Extract → Profile → Coverage → Search.
 * Investigator UI stays on /missions/:id/*.
 */
export function WorkerLayout() {
  const { missionId = "" } = useParams();
  const location = useLocation();
  const data = useMissionData(missionId);
  const { mission, error, sources, catalogue, companies, searchPlan } = data;

  const current = stepFromPath(location.pathname);

  const derived = useMemo(
    () =>
      deriveWorkerStepState({
        mission,
        sources,
        companies,
        planEntries: searchPlan?.entries ?? [],
        catalogue,
      }),
    [mission, sources, companies, searchPlan, catalogue],
  );

  if (!mission && !error) {
    return <p className="muted" style={{ padding: "2rem" }}>Loading job…</p>;
  }

  return (
    <div className="worker-shell">
      <header className="worker-header">
        <div className="worker-header-top">
          <NavLink to="/" className="btn secondary small">
            ← Home
          </NavLink>
          <NavLink
            to={`/missions/${missionId}`}
            className="btn secondary small"
            title="Open full investigator UI"
          >
            ← Investigation
          </NavLink>
        </div>

        <p className="worker-eyebrow">Data Worker</p>
        <h1 className="worker-title">
          {mission ? `${mission.location} · ${mission.subsector}` : "Job"}
        </h1>
        {mission ? <p className="muted worker-goal">{mission.goal}</p> : null}

        <WorkerStepRail current={current} stepStates={derived.steps} />

        {mission ? (
          <TrustedPortfolioBar
            missionId={missionId}
            trustedCount={derived.trustedCount}
            gapCount={derived.gapCount}
            totalCategories={derived.totalCategories}
            alignQueue={derived.alignQueue}
            coverage={derived.coverage}
          />
        ) : null}
      </header>

      {error ? <div className="error">{error}</div> : null}

      <main className="worker-content">
        <Outlet context={data} />
      </main>
    </div>
  );
}
