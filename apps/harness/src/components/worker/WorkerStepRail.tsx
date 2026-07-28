import { NavLink, useParams } from "react-router-dom";
import {
  WORKER_STEPS,
  type WorkerStepId,
  type WorkerStepState,
} from "../../lib/worker";

export function WorkerStepRail({
  current,
  stepStates,
}: {
  current: WorkerStepId;
  stepStates: WorkerStepState[];
}) {
  const { missionId = "" } = useParams();
  const byId = new Map(stepStates.map((s) => [s.id, s]));

  return (
    <nav className="worker-step-rail" aria-label="Data worker steps">
      {WORKER_STEPS.map((step) => {
        const state = byId.get(step.id);
        const enabled = state?.enabled ?? false;
        const settled = state?.settled ?? false;
        const active = step.id === current;
        const meta = state?.todoLabel ?? "";

        if (!enabled) {
          return (
            <span
              key={step.id}
              className="worker-step disabled"
              title="Complete earlier steps first"
              aria-disabled="true"
            >
              <span className="worker-step-num">{step.short}</span>
              <span className="worker-step-label">{step.label}</span>
              {meta ? <span className="worker-step-meta">{meta}</span> : null}
            </span>
          );
        }

        return (
          <NavLink
            key={step.id}
            to={`/work/${missionId}/${step.id}`}
            className={`worker-step ${active ? "active" : ""} ${settled && !active ? "done" : ""}`}
          >
            <span className="worker-step-num">
              {settled && !active ? "✓" : step.short}
            </span>
            <span className="worker-step-label">{step.label}</span>
            {meta ? <span className="worker-step-meta">{meta}</span> : null}
          </NavLink>
        );
      })}
    </nav>
  );
}
