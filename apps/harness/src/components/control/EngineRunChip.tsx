import { Link } from "react-router-dom";
import type { WorkerEvent, WorkerRun } from "../../api";

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function EngineRunChip({
  run,
  events,
}: {
  run: WorkerRun | null;
  events: WorkerEvent[];
}) {
  if (!run) return null;
  return (
    <div>
      <p className="engine-run-chip">
        <strong>
          {run.status} · {run.progress_pct}%
        </strong>
        <span className="muted">
          {run.current_action || run.command}
          {run.step_total ? ` · step ${run.step_index}/${run.step_total}` : ""}
        </span>
        <Link className="btn secondary small" to={`/admin/engine/${run.id}`}>
          Open full run
        </Link>
      </p>
      <details className="worker-advanced">
        <summary>Engine log (last {events.length})</summary>
        {events.length === 0 ? (
          <p className="empty">No events yet.</p>
        ) : (
          <div className="stack">
            {events.map((ev) => (
              <div key={ev.id} className="card-row">
                <div>
                  <strong>
                    {ev.level} · {ev.event_type}
                    {ev.step_name ? ` · ${ev.step_name}` : ""}
                  </strong>
                  <div>{ev.message}</div>
                  <div className="muted">{formatWhen(ev.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </details>
    </div>
  );
}
