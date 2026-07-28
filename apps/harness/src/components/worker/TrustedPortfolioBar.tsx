import { Link } from "react-router-dom";
import { TRUSTED_LIST_UNLOCK } from "../../lib/worker";
import type { MissionCoverage } from "@h3-trust/schema";

export function TrustedPortfolioBar({
  missionId,
  trustedCount,
  gapCount,
  totalCategories,
  alignQueue,
  coverage,
}: {
  missionId: string;
  trustedCount: number;
  gapCount: number;
  totalCategories: number;
  alignQueue: number;
  coverage: MissionCoverage | null;
}) {
  const completeness = coverage?.completenessScore ?? 0;
  const ready = coverage?.readyForSearch ?? false;
  const unlockPct = Math.min(
    100,
    Math.round((trustedCount / TRUSTED_LIST_UNLOCK) * 100),
  );
  const unlocked = trustedCount >= TRUSTED_LIST_UNLOCK;

  return (
    <div className="trusted-portfolio-bar">
      <div className="trusted-portfolio-top">
        <div>
          <strong>
            {trustedCount}/{TRUSTED_LIST_UNLOCK} trusted lists
          </strong>
          <span className="muted">
            {" "}
            · {gapCount}/{totalCategories} gaps open
            {alignQueue > 0 ? ` · ${alignQueue} awaiting align` : ""}
            {" · "}
            completeness {completeness}%
          </span>
          <span
            className={`worker-ready-chip ${ready ? "ready" : "not-ready"}`}
            title={coverage?.readyReason ?? ""}
          >
            {ready ? "ready for search" : "not ready"}
          </span>
        </div>
        {unlocked ? (
          <Link className="btn small" to={`/work/${missionId}/extract`}>
            Extract unlocked →
          </Link>
        ) : (
          <span className="muted">
            Extract unlocks at {TRUSTED_LIST_UNLOCK} CARA-approved lists
          </span>
        )}
      </div>
      <div className="trusted-portfolio-track" aria-hidden>
        <div
          className={`trusted-portfolio-fill ${unlocked ? "unlocked" : ""}`}
          style={{ width: `${Math.max(unlockPct, completeness)}%` }}
        />
      </div>
    </div>
  );
}
