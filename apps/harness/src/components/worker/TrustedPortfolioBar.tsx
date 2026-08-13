import { Link } from "react-router-dom";
import type { MissionCoverage } from "@h3-trust/schema";

export function TrustedPortfolioBar({
  missionId,
  trustedCount,
  gapCount,
  totalCategories,
  alignQueue,
  coverage,
  companyCount,
}: {
  missionId: string;
  trustedCount: number;
  gapCount: number;
  totalCategories: number;
  alignQueue: number;
  coverage: MissionCoverage | null;
  companyCount: number;
}) {
  const completeness = coverage?.completenessScore ?? 0;
  const ready = companyCount > 0;

  return (
    <div className="trusted-portfolio-bar">
      <div className="trusted-portfolio-top">
        <div>
          <strong>
            {companyCount} compan{companyCount === 1 ? "y" : "ies"}
          </strong>
          <span className="muted">
            {" "}
            · {trustedCount} trusted list{trustedCount === 1 ? "" : "s"}
            {" · "}
            {gapCount}/{totalCategories} plan gaps
            {alignQueue > 0 ? ` · ${alignQueue} optional align` : ""}
            {" · "}
            completeness {completeness}%
          </span>
          <span
            className={`worker-ready-chip ${ready ? "ready" : "not-ready"}`}
            title={
              ready
                ? "Companies in this job are searchable"
                : "Import a list to make this job searchable"
            }
          >
            {ready ? "searchable" : "needs companies"}
          </span>
        </div>
        {companyCount === 0 ? (
          <Link className="btn small" to={`/work/${missionId}/extract`}>
            Import CSV →
          </Link>
        ) : (
          <Link className="btn small" to={`/work/${missionId}/search`}>
            Preview search →
          </Link>
        )}
      </div>
      <div className="trusted-portfolio-track" aria-hidden>
        <div
          className={`trusted-portfolio-fill ${ready ? "unlocked" : ""}`}
          style={{ width: `${Math.max(ready ? 100 : 8, completeness)}%` }}
        />
      </div>
    </div>
  );
}
