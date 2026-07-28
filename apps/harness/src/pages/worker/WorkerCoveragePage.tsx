import { Link, useOutletContext, useParams } from "react-router-dom";
import { computeMissionCoverage } from "@h3-trust/schema";
import type { MissionData } from "../../hooks/useMissionData";

export function WorkerCoveragePage() {
  const { missionId = "" } = useParams();
  const { mission, sources, companies, searchPlan } =
    useOutletContext<MissionData>();

  if (!mission) {
    return <p className="muted">Loading…</p>;
  }

  const coverage = computeMissionCoverage({
    sources,
    companies,
    planEntries: searchPlan?.entries ?? [],
  });

  const breakdown = coverage.breakdown ?? {};
  const breakdownEntries = Object.entries(breakdown);
  const breakdownTotal = Math.max(
    1,
    breakdownEntries.reduce((a, [, v]) => a + v, 0),
  );

  return (
    <div className="worker-step-page">
      <div className="worker-step-intro">
        <h2>Coverage</h2>
        <p className="hint">
          Mission completeness — explainable blend of plan fill, source depth,
          company breadth, profiles, and KvK quality. Barriers block readiness
          until a human fulfils them.
        </p>
      </div>

      <div className="panel">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            <span
              style={{
                fontSize: "2rem",
                fontWeight: 700,
                fontFamily: "var(--font-mono)",
              }}
            >
              {coverage.completenessScore}%
            </span>
            <span
              className={`worker-ready-chip ${coverage.readyForSearch ? "ready" : "not-ready"}`}
            >
              {coverage.readyForSearch ? "ready for search" : "not ready"}
            </span>
          </div>
          <p className="muted" style={{ margin: 0, maxWidth: "28rem" }}>
            {coverage.readyReason}
          </p>
        </div>

        <div
          className="worker-coverage-stack"
          aria-label="Coverage breakdown"
        >
          {breakdownEntries.map(([key, value]) => (
            <div
              key={key}
              className="worker-coverage-segment"
              style={{
                width: `${(value / breakdownTotal) * 100}%`,
              }}
              title={`${key}: ${value}`}
            >
              <span className="worker-coverage-segment-label">
                {key} {value}
              </span>
            </div>
          ))}
        </div>

        <div className="worker-coverage-breakdown">
          {breakdownEntries.map(([key, value]) => (
            <span key={key} className="worker-coverage-chip">
              {key} {value}
            </span>
          ))}
        </div>

        <p style={{ margin: "0.35rem 0" }}>
          <strong>Plan cells:</strong> {coverage.searchPlanCellsFilled}/
          {coverage.searchPlanCellsTotal} filled
        </p>
        <p style={{ margin: "0.35rem 0" }}>
          <strong>Sources:</strong> {coverage.sourcesAccepted} accepted ·{" "}
          {coverage.sourcesProbed} probed · {coverage.sourcesWithGuide} with
          guide · {coverage.sourcesBlockedByBarrier} blocked by barrier
        </p>
        <p style={{ margin: "0.35rem 0" }}>
          <strong>Companies:</strong> {coverage.companiesExtracted} extracted ·{" "}
          {coverage.companiesWithProfile} profiled · kvk pass{" "}
          {Math.round(coverage.kvkPassRate * 100)}%
        </p>
      </div>

      {!coverage.readyForSearch ? (
        <div
          className="panel worker-thin-warning"
          style={{ marginTop: "1rem" }}
        >
          <p style={{ marginTop: 0 }}>
            Chase the gaps that hold readiness back:
          </p>
          <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
            <Link className="btn secondary small" to={`/work/${missionId}/gaps`}>
              Gaps
            </Link>
            <Link className="btn secondary small" to={`/work/${missionId}/probe`}>
              Probe
            </Link>
            <Link className="btn secondary small" to={`/work/${missionId}/align`}>
              Align
            </Link>
            {coverage.sourcesBlockedByBarrier > 0 ? (
              <Link
                className="btn secondary small"
                to={`/work/${missionId}/extract`}
              >
                Barriers
              </Link>
            ) : null}
            <Link
              className="btn secondary small"
              to={`/work/${missionId}/profile`}
            >
              Profile
            </Link>
          </div>
        </div>
      ) : null}

      <div className="worker-step-footer">
        <Link className="btn secondary" to={`/work/${missionId}/profile`}>
          ← Profile
        </Link>
        <Link className="btn secondary" to={`/work/${missionId}/ranking`}>
          Ranking table
        </Link>
        <Link className="btn" to={`/work/${missionId}/search`}>
          Search →
        </Link>
      </div>
    </div>
  );
}
