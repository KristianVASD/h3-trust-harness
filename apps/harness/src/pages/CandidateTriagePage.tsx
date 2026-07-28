import { Navigate, useParams } from "react-router-dom";

/**
 * Legacy Triage route — production intake lives in Data Worker · Gaps.
 * Kept as a redirect so old bookmarks / Mission Control links still work.
 */
export function CandidateTriagePage() {
  const { missionId = "" } = useParams();
  return <Navigate to={`/work/${missionId}/gaps`} replace />;
}
