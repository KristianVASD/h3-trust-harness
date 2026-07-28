import { Link, useOutletContext, useParams } from "react-router-dom";
import { resolveSourceGaps } from "@h3-trust/schema";
import type { MissionData } from "../../hooks/useMissionData";

export function WorkerBriefPage() {
  const { missionId = "" } = useParams();
  const { mission, catalogue, sources, searchPlan } = useOutletContext<MissionData>();

  if (!mission) {
    return <p className="muted">Loading…</p>;
  }

  const planEntries = searchPlan?.entries ?? [];
  const gaps = resolveSourceGaps(
    catalogue.length ? catalogue : sources,
    mission.location,
    mission.sector,
    planEntries,
  );
  const openGaps = gaps.filter((g) => g.status === "gap").length;

  return (
    <div className="worker-step-page">
      <div className="worker-step-intro">
        <h2>Brief</h2>
        <p className="hint">
          Confirm the job scope. Open gaps come from the search plan × catalogue
          coverage — fill them next.
        </p>
      </div>

      <div className="panel" style={{ marginBottom: "1rem" }}>
        <p style={{ margin: "0 0 0.5rem" }}>
          <strong>Location:</strong> {mission.location}, {mission.country}
        </p>
        <p style={{ margin: "0 0 0.5rem" }}>
          <strong>Sector:</strong> {mission.sector} / {mission.subsector}
        </p>
        <p style={{ margin: "0 0 0.5rem" }}>
          <strong>Goal:</strong> {mission.goal}
        </p>
        <p style={{ margin: "0 0 0.5rem" }}>
          <strong>Search plan:</strong> {searchPlan?.version ?? "—"}
          {searchPlan?.label ? ` · ${searchPlan.label}` : ""}
        </p>
        <p style={{ margin: 0 }}>
          <strong>Open gaps:</strong> {openGaps} of {gaps.length} plan cells
        </p>
      </div>

      {planEntries.length > 0 ? (
        <div className="panel" style={{ marginBottom: "1rem" }}>
          <h3 style={{ marginTop: 0 }}>Search plan cells</h3>
          <ul className="muted" style={{ margin: 0, paddingLeft: "1.2rem" }}>
            {planEntries.map((e) => {
              const cell = gaps.find(
                (g) => g.layer === e.layer && g.category === e.category,
              );
              const status = cell?.status ?? "gap";
              return (
                <li key={`${e.layer}::${e.category}`}>
                  <strong>
                    {e.layer} · {e.category}
                  </strong>
                  {" — "}
                  {status === "covered" ? "covered" : "open gap"}
                  {e.nuance_rule ? (
                    <span className="muted"> · {e.nuance_rule}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="muted">No search plan loaded for this mission.</p>
      )}

      <div className="worker-step-footer">
        <Link className="btn" to={`/work/${missionId}/gaps`}>
          Confirm → Gaps
        </Link>
      </div>
    </div>
  );
}
