import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { Mission } from "@h3-trust/schema";
import {
  api,
  type WorkerCommand,
  type WorkerRun,
  type WorkerStatus,
} from "../api";

const COMMANDS: WorkerCommand[] = [
  "full_mission",
  "nation_harvest",
  "place_test",
  "nation_map",
  "discover",
  "probe",
  "extract",
  "harvest",
  "coverage",
  "search",
];

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

export function AdminEnginePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const missionFromUrl = searchParams.get("missionId") ?? "";

  const [missions, setMissions] = useState<Mission[]>([]);
  const [runs, setRuns] = useState<WorkerRun[]>([]);
  const [engineAvailable, setEngineAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState<WorkerStatus | "">("");
  const [form, setForm] = useState({
    missionId: missionFromUrl,
    command: "full_mission" as WorkerCommand,
    targetId: "",
    model: "",
  });

  useEffect(() => {
    if (missionFromUrl) {
      setForm((f) => ({ ...f, missionId: missionFromUrl }));
    }
  }, [missionFromUrl]);

  const load = useCallback(async () => {
    try {
      const health = await api.health();
      setEngineAvailable(health.engineAvailable ?? health.hasServiceRole ?? false);
      const [missionList, runList] = await Promise.all([
        api.listMissions(),
        api.listWorkerRuns({
          missionId: missionFromUrl || undefined,
          status: statusFilter || undefined,
        }),
      ]);
      setMissions(missionList);
      setRuns(runList.runs);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load";
      setError(message);
      if (message.includes("engine_unavailable") || message.includes("503")) {
        setEngineAvailable(false);
      }
    }
  }, [missionFromUrl, statusFilter]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 8000);
    return () => window.clearInterval(t);
  }, [load]);

  const missionLabel = useMemo(() => {
    const map = new Map(missions.map((m) => [m.id, `${m.location} · ${m.subsector}`]));
    return (id: string | null) => (id ? map.get(id) ?? id.slice(0, 8) : "—");
  }, [missions]);

  async function onStart(e: FormEvent) {
    e.preventDefault();
    const fanOut =
      form.command === "nation_harvest" ||
      form.command === "place_test" ||
      form.command === "nation_map";
    if (!fanOut && !form.missionId) {
      setError("Pick a mission.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { run } = await api.enqueueWorkerRun({
        missionId: fanOut ? undefined : form.missionId,
        command: form.command,
        targetId: form.targetId.trim() || undefined,
        model: form.model.trim() || undefined,
        country: "Netherlands",
        location: form.command === "place_test" ? "Alkmaar" : undefined,
        tradeId: form.command === "place_test" ? "paint" : undefined,
      });
      navigate(`/admin/engine/${run.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enqueue");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <h1>Engine</h1>
      <p className="hint">
        Steer OpenRouter through H3. The Vercel app queues a run; a local worker
        claims it, discovers/probes/scrapes locally, and writes progress here.
        <code>nation_harvest</code> fans out 12 sector doors (no local community).
        <code>place_test</code> queues Alkmaar + surroundings.
      </p>

      {engineAvailable === false ? (
        <p className="error">
          Engine requires Supabase. Set SUPABASE_URL and
          SUPABASE_SERVICE_ROLE_KEY, then run the worker_progress migration.
        </p>
      ) : null}
      {error ? <p className="error">{error}</p> : null}

      <form className="stack" onSubmit={(e) => void onStart(e)}>
        <h2>Start engine run</h2>
        <label>
          Mission
          <select
            value={form.missionId}
            onChange={(e) => setForm((f) => ({ ...f, missionId: e.target.value }))}
          >
            <option value="">Select a job…</option>
            {missions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.location} · {m.subsector}
              </option>
            ))}
          </select>
        </label>
        <label>
          Command
          <select
            value={form.command}
            onChange={(e) =>
              setForm((f) => ({ ...f, command: e.target.value as WorkerCommand }))
            }
          >
            {COMMANDS.map((cmd) => (
              <option key={cmd} value={cmd}>
                {cmd}
              </option>
            ))}
          </select>
        </label>
        <label>
          Target id (optional source or company)
          <input
            value={form.targetId}
            onChange={(e) => setForm((f) => ({ ...f, targetId: e.target.value }))}
            placeholder="uuid"
          />
        </label>
        <label>
          OpenRouter model override (optional)
          <input
            value={form.model}
            onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
            placeholder="minimax/minimax-m3:free"
          />
        </label>
        <button className="btn" type="submit" disabled={busy || engineAvailable === false}>
          {busy ? "Queuing…" : "Start engine run"}
        </button>
      </form>

      <section style={{ marginTop: "1.5rem" }}>
        <h2>Runs</h2>
        <label>
          Status filter
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as WorkerStatus | "")}
          >
            <option value="">all</option>
            <option value="queued">queued</option>
            <option value="running">running</option>
            <option value="waiting_human">waiting_human</option>
            <option value="succeeded">succeeded</option>
            <option value="failed">failed</option>
            <option value="cancelled">cancelled</option>
          </select>
        </label>
        {runs.length === 0 ? (
          <p className="empty">No runs yet. Queue one above, then start the local worker.</p>
        ) : (
          <div className="stack" style={{ marginTop: "0.75rem" }}>
            {runs.map((run) => (
              <div key={run.id} className="card-row">
                <div>
                  <strong>
                    {run.command} · {run.status}
                  </strong>
                  <div className="muted">
                    {missionLabel(run.mission_id)} · {run.progress_pct}%
                    {run.current_action ? ` · ${run.current_action}` : ""}
                  </div>
                  <div className="muted">
                    {run.status === "queued" && !run.heartbeat_at
                      ? "waiting for local worker"
                      : `last beat ${formatWhen(run.heartbeat_at)}`}
                    {" · created "}
                    {formatWhen(run.created_at)}
                  </div>
                </div>
                <Link className="btn small" to={`/admin/engine/${run.id}`}>
                  Open
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
