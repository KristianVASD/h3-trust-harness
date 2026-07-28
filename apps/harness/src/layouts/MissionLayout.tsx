import { NavLink, Outlet, useParams } from "react-router-dom";
import { useMissionData } from "../hooks/useMissionData";
import { ProcesIndicator } from "../components/ProcesIndicator";

/**
 * Shared layout for all /missions/:missionId/* routes.
 * Renders mission name, process indicator, navigation, and page via <Outlet>.
 */
export function MissionLayout() {
  const { missionId = "" } = useParams();
  const data = useMissionData(missionId);
  const { mission, error } = data;

  if (!mission && !error) {
    return <p className="muted" style={{ padding: "2rem" }}>Loading mission…</p>;
  }

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `btn secondary small${isActive ? " active" : ""}`;

  return (
    <div className="mission-layout">
      <header className="mission-header">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <div>
            <NavLink to="/" className="btn secondary small" style={{ marginBottom: "0.5rem" }}>
              ← Mission Control
            </NavLink>
            <h1 className="mission-title">
              {mission ? `${mission.location} · ${mission.subsector}` : "Mission"}
            </h1>
            {mission ? <p className="muted mission-goal">{mission.goal}</p> : null}
          </div>
          <div className="row" style={{ gap: "0.35rem", flexWrap: "wrap" }}>
            <NavLink className="btn small" to={`/work/${missionId}/brief`}>
              ⚡ Data Worker
            </NavLink>
            <NavLink className={navClass} end to={`/missions/${missionId}`}>
              Workspace
            </NavLink>
            <NavLink className={navClass} to={`/missions/${missionId}/triage`}>
              ☰ Triage
            </NavLink>
            <NavLink className={navClass} to={`/missions/${missionId}/cara?target=source`}>
              ◉ CARA sources
            </NavLink>
            <NavLink className={navClass} to={`/missions/${missionId}/cara?target=company`}>
              ◆ CARA companies
            </NavLink>
            <NavLink className={navClass} to={`/missions/${missionId}/signals`}>
              Signals
            </NavLink>
            <NavLink className={navClass} to={`/missions/${missionId}/situation`}>
              Situation Room
            </NavLink>
            <NavLink className={navClass} to={`/missions/${missionId}/graph`}>
              Graph
            </NavLink>
          </div>
        </div>

        {mission ? (
          <ProcesIndicator
            mission={mission}
            sources={data.sources}
            catalogue={data.catalogue}
            companies={data.companies}
            reviews={data.reviews}
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
