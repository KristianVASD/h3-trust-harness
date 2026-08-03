import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { v4 as uuid } from "uuid";
import { DEFAULT_SEARCH_PLAN_VERSION, type Mission } from "@h3-trust/schema";
import { api, type SearchDemandAggregate } from "../api";
import { ProducerBadge, StatusChip } from "../components/Badges";
import { useCanInteract } from "../hooks/useCanInteract";

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

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function MissionControl() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { canInteract, isPending, needsLogin } = useCanInteract();
  const [mode, setMode] = useState<UiMode>(readMode);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [demands, setDemands] = useState<SearchDemandAggregate[]>([]);
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
      const [missionList, demandFeed] = await Promise.all([
        api.listMissions(),
        api.listSearchDemands(300),
      ]);
      setMissions(missionList);
      setDemands(demandFeed.aggregates);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load missions");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const location = searchParams.get("location");
    const country = searchParams.get("country");
    const subsector = searchParams.get("subsector") || searchParams.get("what");
    if (!location && !subsector && !country) return;
    setForm((f) => ({
      ...f,
      location: location?.trim() || f.location,
      country: country?.trim() || f.country,
      subsector: subsector?.trim() || f.subsector,
      goal: `Find trustworthy ${(subsector || f.subsector).toLowerCase()} in ${location || f.location}${country ? ` (${country})` : ""} and validate source reliability.`,
      notes: "Prefilled from worldwide search demand.",
    }));
  }, [searchParams]);

  function missionPath(id: string) {
    return mode === "worker" ? `/work/${id}/brief` : `/missions/${id}`;
  }

  function applyDemand(d: SearchDemandAggregate) {
    setForm({
      location: d.location,
      country: d.country || "Unspecified",
      sector: "Home Maintenance",
      subsector: d.what,
      goal: `Find trustworthy ${d.what.toLowerCase()} in ${d.location}${d.country ? ` (${d.country})` : ""} and validate source reliability.`,
      notes: `From search demand · ${d.count}× asked · last ${formatWhen(d.lastAt)}`,
    });
    document.getElementById("new-mission-form")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canInteract) {
      setError(
        needsLogin
          ? "Sign in as an approved CURAD volunteer to create missions."
          : isPending
            ? "Awaiting admin approval — you cannot create missions yet."
            : "You cannot create missions with this account.",
      );
      return;
    }
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
  const demandList = [...demands].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return b.lastAt.localeCompare(a.lastAt);
  });

  function demandCountForMission(m: Mission): number {
    const fromAgg = demands.find((d) => {
      if (d.matchedMissionId && d.matchedMissionId === m.id) return true;
      const samePlace =
        d.location.trim().toLowerCase() === m.location.trim().toLowerCase();
      const sameCountry =
        (d.country || "").trim().toLowerCase() ===
        (m.country || "").trim().toLowerCase();
      const trade = m.subsector.replace(/\s*\([^)]*\)\s*/g, "").trim();
      const want = d.what.trim().toLowerCase();
      const sameTrade =
        trade.toLowerCase() === want || trade.toLowerCase().includes(want);
      return samePlace && sameCountry && sameTrade;
    });
    return fromAgg?.count ?? m.demandCount ?? 0;
  }

  const sortedMissions = [...missions].sort((a, b) => {
    const ad = demandCountForMission(a);
    const bd = demandCountForMission(b);
    if (bd !== ad) return bd - ad;
    const al = a.lastSearchedAt ?? a.updatedAt;
    const bl = b.lastSearchedAt ?? b.updatedAt;
    return bl.localeCompare(al);
  });

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

      <section className="panel demand-panel" aria-labelledby="demand-heading">
        <h2 id="demand-heading">Worldwide search demand</h2>
        <p className="hint">
          Each Single Search counts once and opens or bumps a mission —
          including anonymous visitors. No login required to record the need.
        </p>
        {demandList.length === 0 ? (
          <div className="empty">
            No search demand yet. As soon as someone searches worldwide, it
            appears here and under Jobs.
          </div>
        ) : (
          <div className="demand-list">
            {demandList.slice(0, 40).map((d) => {
              const misses =
                (d.outcomes.no_match ?? 0) +
                (d.outcomes.empty_companies ?? 0) +
                (d.outcomes.quota_blocked ?? 0);
              const hits = d.outcomes.hit ?? 0;
              return (
                <article key={d.key} className="demand-card">
                  <div className="demand-card-main">
                    <h3>
                      {d.location}
                      {d.country ? `, ${d.country}` : ""} · {d.what}
                    </h3>
                    <p className="muted">
                      {d.count}× asked · last {formatWhen(d.lastAt)}
                      {misses ? ` · ${misses} unmet/blocked` : ""}
                      {hits ? ` · ${hits} catalogue hits` : ""}
                    </p>
                  </div>
                  <div className="row demand-card-actions">
                    {d.matchedMissionId ? (
                      <Link
                        className="btn secondary small"
                        to={missionPath(d.matchedMissionId)}
                      >
                        Open mission
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      className="btn small"
                      onClick={() => applyDemand(d)}
                    >
                      Prefill new job
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid-missions">
        <section className="panel">
          <h2>{isWorker ? "Jobs" : "Missions"}</h2>
          <p className="hint">
            {isWorker
              ? "Jobs include missions opened from worldwide search demand (sorted by demand)."
              : "Open an investigation notebook. Production runs in Data Worker."}
          </p>
          {sortedMissions.length === 0 ? (
            <div className="empty">
              {isWorker
                ? "No jobs yet. Start one from demand above or the form."
                : "No missions yet. Create one to begin."}
            </div>
          ) : (
            sortedMissions.map((m) => {
              const asks = demandCountForMission(m);
              return (
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
                    {m.origin === "search_demand" ? (
                      <StatusChip label="from search" tone="active" />
                    ) : null}
                    {asks > 0 ? (
                      <StatusChip
                        label={`${asks}× demand`}
                        tone="active"
                      />
                    ) : null}
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
              );
            })
          )}
        </section>

        <section className="panel" id="new-mission-form">
          <h2>{isWorker ? "New data job" : "New mission"}</h2>
          <p className="hint">
            {isWorker
              ? "Prefill from worldwide demand, or start Painters · Haarlemmermeer defaults."
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
            <button className="btn" type="submit" disabled={saving || !canInteract}>
              {saving
                ? "Creating…"
                : !canInteract
                  ? "Approved CURAD only"
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
