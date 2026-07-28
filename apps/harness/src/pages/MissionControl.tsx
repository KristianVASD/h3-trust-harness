import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { v4 as uuid } from "uuid";
import { DEFAULT_SEARCH_PLAN_VERSION, type Mission } from "@h3-trust/schema";
import { api } from "../api";
import { ProducerBadge, StatusChip } from "../components/Badges";

const MODE_KEY = "h3-harness-mode";
type UiMode = "worker" | "investigator";

const defaultPhases: Mission["phases"] = [
  { key: "observation", status: "active" },
  { key: "hypothesis", status: "waiting" },
  { key: "evidence", status: "waiting" },
  { key: "cara", status: "waiting" },
  { key: "patterns", status: "waiting" },
  { key: "companies", status: "waiting" },
  { key: "deep_check", status: "waiting" },
];

function readMode(): UiMode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    if (v === "investigator" || v === "worker") return v;
  } catch {
    /* ignore */
  }
  return "worker";
}

export function MissionControl() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<UiMode>(readMode);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    location: "Haarlemmermeer",
    country: "Netherlands",
    sector: "Home Maintenance",
    subsector: "Painters",
    goal: "Find trustworthy local painters and validate source reliability.",
    notes: "",
  });

  function switchMode(next: UiMode) {
    setMode(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      /* ignore */
    }
  }

  async function load() {
    try {
      setError(null);
      setMissions(await api.listMissions());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load missions");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function missionPath(id: string) {
    return mode === "worker" ? `/work/${id}/brief` : `/missions/${id}`;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const mission: Mission = {
        id: uuid(),
        ...form,
        notes: form.notes || undefined,
        search_plan_version: DEFAULT_SEARCH_PLAN_VERSION,
        discoveryBrief: {
          approach: "",
          candidateListTypes: ["registry", "local_business_association"],
          successCriteria:
            "≥5 CARA-accepted/adjusted lists before company deep-check",
          producer: "Human",
          updatedAt: now,
        },
        phases: defaultPhases,
        producer: "Human",
        createdAt: now,
        updatedAt: now,
        v: 1,
      };
      await api.createMission(mission);
      setForm((f) => ({ ...f, notes: "" }));
      await load();
      navigate(missionPath(mission.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create mission");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(missionId: string, label: string) {
    if (
      !window.confirm(
        `Delete mission “${label}” and all its journal, observations, sources, companies, reviews?\nThis cannot be undone.`,
      )
    ) {
      return;
    }
    try {
      setError(null);
      await api.deleteMission(missionId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete mission");
    }
  }

  const isWorker = mode === "worker";

  return (
    <div>
      <div className="mode-toggle" role="group" aria-label="UI mode">
        <button
          type="button"
          className={`mode-toggle-btn ${isWorker ? "active" : ""}`}
          onClick={() => switchMode("worker")}
        >
          Data Worker
        </button>
        <button
          type="button"
          className={`mode-toggle-btn ${!isWorker ? "active" : ""}`}
          onClick={() => switchMode("investigator")}
        >
          Investigator
        </button>
        <Link className="mode-toggle-btn" to="/search">
          Search
        </Link>
      </div>

      <p className="thesis">
        {isWorker ? (
          <>
            <strong>Data Worker.</strong> Brief → Gaps → Probe → Align → Extract →
            Profile → Coverage → Search — a straight production path. Notebook and
            reviews stay on Investigation.
          </>
        ) : (
          <>
            <strong>The Harness never decides.</strong> It structures investigations,
            preserves evidence, captures human reasoning, and accumulates validated
            knowledge. You are the investigator today — OmegaClaw can be one tomorrow.
          </>
        )}
      </p>

      {error ? <div className="error">{error}</div> : null}

      <div className="grid-missions">
        <section className="panel">
          <h2>{isWorker ? "Jobs" : "Missions"}</h2>
          <p className="hint">
            {isWorker
              ? "Open a data job. Brief → Gaps → Probe → Align → Extract → Profile → Coverage → Search."
              : "Open an investigation notebook. Production runs in Data Worker."}
          </p>
          {missions.length === 0 ? (
            <div className="empty">
              {isWorker
                ? "No jobs yet. Start one with Painters · Haarlemmermeer defaults."
                : "No missions yet. Create one to begin."}
            </div>
          ) : (
            missions.map((m) => (
              <div key={m.id} className="mission-card" style={{ position: "relative" }}>
                <Link to={missionPath(m.id)} style={{ display: "block" }}>
                  <h3>
                    {m.location} · {m.subsector}
                  </h3>
                  <p className="muted">{m.goal}</p>
                  <div className="mission-meta">
                    <ProducerBadge producer={m.producer} />
                    <StatusChip label={m.country} />
                    <StatusChip label={m.sector} />
                    {m.phases
                      .filter((p) => p.status === "active")
                      .map((p) => (
                        <StatusChip key={p.key} label={p.key} tone="active" />
                      ))}
                  </div>
                </Link>
                <div className="row" style={{ marginTop: "0.75rem" }}>
                  <Link className="btn small" to={missionPath(m.id)}>
                    {isWorker ? "Open job" : "Open"}
                  </Link>
                  {isWorker ? (
                    <Link
                      className="btn secondary small"
                      to={`/missions/${m.id}`}
                    >
                      ← Investigation
                    </Link>
                  ) : (
                    <Link
                      className="btn small"
                      to={`/work/${m.id}/brief`}
                    >
                      ⚡ Data Worker
                    </Link>
                  )}
                  <button
                    type="button"
                    className="btn danger small"
                    onClick={() =>
                      void onDelete(m.id, `${m.location} · ${m.subsector}`)
                    }
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </section>

        <section className="panel">
          <h2>{isWorker ? "New data job" : "New mission"}</h2>
          <p className="hint">
            {isWorker
              ? "Defaults to Painters · Haarlemmermeer — change if you need another region × sector."
              : "Mission Control — start research, not a chat."}
          </p>
          <form className="form-stack" onSubmit={onSubmit}>
            <div className="split-2">
              <label>
                Location
                <input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  required
                />
              </label>
              <label>
                Country
                <input
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                  required
                />
              </label>
            </div>
            <div className="split-2">
              <label>
                Sector
                <input
                  value={form.sector}
                  onChange={(e) => setForm({ ...form, sector: e.target.value })}
                  required
                />
              </label>
              <label>
                Subsector
                <input
                  value={form.subsector}
                  onChange={(e) => setForm({ ...form, subsector: e.target.value })}
                  required
                />
              </label>
            </div>
            <label>
              Mission goal
              <textarea
                value={form.goal}
                onChange={(e) => setForm({ ...form, goal: e.target.value })}
                required
              />
            </label>
            <label>
              Notes (optional)
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </label>
            <button className="btn" type="submit" disabled={saving}>
              {saving
                ? "Creating…"
                : isWorker
                  ? "Start data job"
                  : "Start investigation"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
