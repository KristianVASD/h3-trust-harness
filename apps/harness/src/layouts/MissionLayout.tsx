import { useMemo } from "react";
import { NavLink, Outlet, useParams } from "react-router-dom";
import { useMissionData } from "../hooks/useMissionData";
import { ProcesIndicator } from "../components/ProcesIndicator";
import { ProducerBadge, StatusChip } from "../components/Badges";
import { nextIncompleteWorkerStep } from "../lib/worker";

/**
 * Investigator desk — notebook + reviews.
 * Production (discover → harvest → search) lives in Data Worker.
 */
export function MissionLayout() {
  const { missionId = "" } = useParams();
  const data = useMissionData(missionId);
  const { mission, error, sources, companies, catalogue, searchPlan } = data;

  const workerStep = useMemo(
    () =>
      nextIncompleteWorkerStep({
        mission,
        sources,
        companies,
        planEntries: searchPlan?.entries ?? [],
        catalogue,
      }),
    [mission, sources, companies, searchPlan, catalogue],
  );

  if (!mission && !error) {
    return (
      <p className="muted" style={{ padding: "2rem" }}>
        Loading mission…
      </p>
    );
  }

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `mission-nav-link${isActive ? " active" : ""}`;

  return (
    <div className="mission-shell">
      <header className="mission-header">
        <div className="mission-header-top">
          <NavLink to="/control" className="btn secondary small">
            ← Mission Control
          </NavLink>
          <NavLink
            to={`/work/${missionId}/${workerStep}`}
            className="btn small"
          >
            Open Data Worker
          </NavLink>
        </div>

        <p className="mission-eyebrow">Investigation</p>
        <h1 className="mission-title">
          {mission ? `${mission.location} · ${mission.subsector}` : "Mission"}
        </h1>
        {mission ? <p className="muted mission-goal">{mission.goal}</p> : null}

        {mission ? (
          <div className="mission-meta" style={{ marginBottom: "0.85rem" }}>
            <ProducerBadge producer={mission.producer} />
            <StatusChip label={mission.country} />
            <StatusChip label={mission.sector} />
          </div>
        ) : null}

        <nav className="mission-nav" aria-label="Investigator sections">
          <div className="mission-nav-group">
            <span className="mission-nav-label">Notebook</span>
            <NavLink className={navClass} end to={`/missions/${missionId}`}>
              Workspace
            </NavLink>
          </div>
          <div className="mission-nav-group">
            <span className="mission-nav-label">Reviews</span>
            <NavLink
              className={navClass}
              to={`/missions/${missionId}/cara?target=source`}
            >
              Align sources
            </NavLink>
            <NavLink
              className={navClass}
              to={`/missions/${missionId}/cara?target=company`}
            >
              Align companies
            </NavLink>
          </div>
          <div className="mission-nav-group">
            <span className="mission-nav-label">Desk</span>
            <NavLink className={navClass} to={`/missions/${missionId}/signals`}>
              Signals
            </NavLink>
            <NavLink
              className={navClass}
              to={`/missions/${missionId}/situation`}
            >
              Situation
            </NavLink>
            <NavLink className={navClass} to={`/missions/${missionId}/graph`}>
              Memory
            </NavLink>
          </div>
        </nav>

        {mission ? (
          <ProcesIndicator
            mission={mission}
            sources={data.sources}
            catalogue={data.catalogue}
            companies={data.companies}
            searchPlan={data.searchPlan}
          />
        ) : null}
      </header>

      {error ? <div className="error">{error}</div> : null}

      <main className="mission-content">
        <Outlet context={data} />
      </main>
    </div>
  );
}
