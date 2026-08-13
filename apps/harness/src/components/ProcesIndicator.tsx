import { useMemo } from "react";
import { NavLink, useParams } from "react-router-dom";
import type {
  Company,
  Mission,
  SearchPlan,
  Source,
} from "@h3-trust/schema";
import { nextWorkerAction } from "../lib/worker";

interface Props {
  mission: Mission;
  sources: Source[];
  catalogue: Source[];
  companies: Company[];
  searchPlan: SearchPlan | null;
}

/**
 * Quiet pointer into Data Worker — not a second production rail.
 */
export function ProcesIndicator({
  mission,
  sources,
  catalogue,
  companies,
  searchPlan,
}: Props) {
  const { missionId = "" } = useParams();

  const next = useMemo(
    () =>
      nextWorkerAction({
        mission,
        sources,
        companies,
        planEntries: searchPlan?.entries ?? [],
        catalogue,
      }),
    [mission, sources, companies, searchPlan, catalogue],
  );

  return (
    <div className="proces-indicator">
      <div className="proces-next">
        <NavLink
          to={`/work/${missionId}/${next.id}`}
          className="next-action"
        >
          → Data Worker · {next.label}
        </NavLink>
        <span className="muted" style={{ marginLeft: "0.5rem" }}>
          {next.detail}
        </span>
      </div>
    </div>
  );
}
