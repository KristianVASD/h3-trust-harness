import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type WorkerEvent, type WorkerRun } from "../api";

const LESSON_TYPES = new Set(["lesson", "step_failed", "strategy_note"]);

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

export function AdminEngineRunPage() {
  const { runId = "" } = useParams();
  const navigate = useNavigate();
  const [run, setRun] = useState<WorkerRun | null>(null);
  const [events, setEvents] = useState<WorkerEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!runId) return;
    try {
      const res = await api.getWorkerRun(runId);
      setRun(res.run);
      setEvents(res.events);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load run");
    }
  }, [runId]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(t);
  }, [load]);

  const lessons = events.filter((e) => LESSON_TYPES.has(e.event_type));
  const recent = [...events].slice(-20).reverse();
  const canCancel =
    run &&
    (run.status === "queued" ||
      run.status === "running" ||
      run.status === "waiting_human");
  const canRetry = run && (run.status === "failed" || run.status === "cancelled");

  async function onCancel() {
    if (!run) return;
    setBusy(true);
    try {
      const res = await api.cancelWorkerRun(run.id);
      setRun(res.run);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRetry() {
    if (!run) return;
    setBusy(true);
    try {
      const res = await api.retryWorkerRun(run.id);
      navigate(`/admin/engine/${res.run.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setBusy(false);
    }
  }

  if (!run && !error) {
    return <main className="page">Loading run…</main>;
  }

  return (
    <main className="page">
      <p>
        <Link to="/admin/engine">← All runs</Link>
        {run?.mission_id ? (
          <>
            {" · "}
            <Link to={`/work/${run.mission_id}/brief`}>Data Worker</Link>
          </>
        ) : null}
      </p>
      <h1>Run {run ? run.command : ""}</h1>
      {error ? <p className="error">{error}</p> : null}
      {run ? (
        <>
          <p className="muted">
            {run.status} · {run.progress_pct}% · step {run.step_index}/
            {run.step_total}
            {run.current_action ? ` · ${run.current_action}` : ""}
          </p>
          <p className="muted">
            heartbeat {formatWhen(run.heartbeat_at)}
            {run.error ? ` · ${run.error}` : ""}
          </p>
          <div className="row">
            {canCancel ? (
              <button
                type="button"
                className="btn secondary small"
                disabled={busy}
                onClick={() => void onCancel()}
              >
                Cancel
              </button>
            ) : null}
            {canRetry ? (
              <button
                type="button"
                className="btn small"
                disabled={busy}
                onClick={() => void onRetry()}
              >
                Retry
              </button>
            ) : null}
          </div>

          <h2>Last events</h2>
          {recent.length === 0 ? (
            <p className="empty">No events yet. Start the local worker to claim this run.</p>
          ) : (
            <div className="stack">
              {recent.map((ev) => (
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

          <h2>Lessons</h2>
          {lessons.length === 0 ? (
            <p className="empty">No lessons yet.</p>
          ) : (
            <div className="stack">
              {lessons.map((ev) => (
                <div key={ev.id} className="card-row">
                  <div>
                    <strong>{ev.event_type}</strong>
                    <div>{ev.message}</div>
                    {typeof ev.data.lesson === "string" ? (
                      <div className="muted">{ev.data.lesson}</div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}
    </main>
  );
}
