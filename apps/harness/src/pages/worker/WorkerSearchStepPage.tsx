import { Link, useOutletContext, useParams } from "react-router-dom";
import {
  computeListCoverage,
  computeMissionCoverage,
  computeResultCoverage,
  explainResultCoverage,
} from "@h3-trust/schema";
import type { MissionData } from "../../hooks/useMissionData";

/**
 * Thin Search step — mission-scoped preview + link to full Single Search.
 * Phase 8: per-result coverageConfidence meter.
 */
export function WorkerSearchStepPage() {
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

  const ranked = [...companies]
    .map((c) => {
      const list = computeListCoverage(c, sources, companies);
      const coverageConfidence = computeResultCoverage(c, coverage);
      const why = explainResultCoverage(c, coverage);
      return { company: c, list, coverageConfidence, why };
    })
    .sort((a, b) => b.list.score - a.list.score)
    .slice(0, 5);

  const q = encodeURIComponent(
    `${mission.subsector} in ${mission.location}`,
  );

  return (
    <div className="worker-step-page">
      <div className="worker-step-intro">
        <h2>Search</h2>
        <p className="hint">
          Ranked answer from this job. Full Single Search reads the whole
          country × sector pack, filtered by town.
        </p>
        <p>
          <span
            className={`worker-ready-chip ${companies.length ? "ready" : "not-ready"}`}
            title={
              companies.length
                ? "Companies in this job are searchable"
                : "Import a list to search"
            }
          >
            {companies.length ? "searchable" : "needs companies"}
          </span>
          <span className="muted">
            {" "}
            · completeness {coverage.completenessScore}%
          </span>
        </p>
      </div>

      {!companies.length ? (
        <div className="panel worker-thin-warning" style={{ marginBottom: "1rem" }}>
          Import a source CSV to rank companies. Align is optional.
        </div>
      ) : null}

      <div className="panel" style={{ marginBottom: "1rem" }}>
        <h3 style={{ marginTop: 0 }}>Top 5 in this mission</h3>
        {ranked.length === 0 ? (
          <p className="muted">No companies to rank yet.</p>
        ) : (
          <ol style={{ margin: 0, paddingLeft: "1.2rem" }}>
            {ranked.map(({ company, list, coverageConfidence, why }) => (
              <li key={company.id} style={{ marginBottom: "0.75rem" }}>
                <strong>{company.name}</strong>
                <span className="muted">
                  {" "}
                  · evidence {list.score}
                </span>
                <div
                  className="worker-result-confidence"
                  title={why}
                >
                  <span className="muted" style={{ fontSize: "0.78rem" }}>
                    coverageConfidence {coverageConfidence}
                  </span>
                  <div
                    className="worker-result-confidence-bar"
                    role="meter"
                    aria-valuenow={coverageConfidence}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={why}
                  >
                    <div
                      className="worker-result-confidence-fill"
                      style={{ width: `${coverageConfidence}%` }}
                    />
                  </div>
                </div>
                {company.profileSnippet ? (
                  <div className="muted" style={{ fontSize: "0.8rem" }}>
                    {company.profileSnippet.slice(0, 80)}…
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="worker-step-footer">
        <Link className="btn secondary" to={`/work/${missionId}/coverage`}>
          ← Coverage
        </Link>
        <Link className="btn" to={`/search?q=${q}`}>
          Open Single Search →
        </Link>
        <Link className="btn secondary" to={`/work/${missionId}/ranking`}>
          Full results table
        </Link>
      </div>
    </div>
  );
}
