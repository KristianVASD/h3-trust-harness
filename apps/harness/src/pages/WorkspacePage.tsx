import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { v4 as uuid } from "uuid";
import type {
  Hypothesis,
  HypothesisStatus,
  JournalEntry,
  Mission,
  Observation,
} from "@h3-trust/schema";
import { api } from "../api";
import type { MissionData } from "../hooks/useMissionData";
import { ProducerBadge, StatusChip } from "../components/Badges";
import { countTrustedLists } from "../lib/worker";

type Tab = "journal" | "observations" | "hypotheses";

export function WorkspacePage() {
  const { missionId = "" } = useParams();
  const data = useOutletContext<MissionData>();
  const {
    mission,
    journal,
    observations,
    hypotheses,
    sources,
    companies,
    reload,
  } = data;

  const [tab, setTab] = useState<Tab>("journal");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [coverageScore, setCoverageScore] = useState<number | null>(null);

  const trustedCount = useMemo(() => countTrustedLists(sources), [sources]);
  const thinCompanies = useMemo(
    () =>
      companies.filter(
        (c) =>
          c.capabilities.length === 0 && !(c.profileSnippet ?? "").trim(),
      ).length,
    [companies],
  );
  const topSources = useMemo(
    () =>
      sources
        .filter((s) => s.status === "accepted" || s.status === "adjusted")
        .slice(0, 3),
    [sources],
  );
  const topCompanies = useMemo(() => companies.slice(0, 3), [companies]);

  useEffect(() => {
    if (!missionId) return;
    void api
      .getCoverage(missionId)
      .then((c) => setCoverageScore(c.completenessScore))
      .catch(() => setCoverageScore(null));
  }, [missionId, sources.length, companies.length]);

  async function exportBundle() {
    if (!missionId) return;
    setBusy(true);
    try {
      const bundle = await api.exportMission(missionId);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `h3-trust-${missionId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  if (!mission) {
    return <p className="muted">Loading workspace…</p>;
  }

  return (
    <div>
      <div className="row" style={{ marginBottom: "1rem", justifyContent: "space-between" }}>
        <div className="worker-step-intro" style={{ margin: 0, padding: 0 }}>
          <h2 style={{ margin: 0 }}>Notebook</h2>
          <p className="hint" style={{ margin: "0.25rem 0 0" }}>
            Journal, observations, and hypotheses. Production (lists → companies)
            runs in Data Worker.
          </p>
        </div>
        <button
          className="btn secondary small"
          type="button"
          onClick={() => void exportBundle()}
          disabled={busy}
        >
          Export investigation
        </button>
      </div>

      {localError ? <div className="error">{localError}</div> : null}

      <MissionSummaryCard
        mission={mission}
        missionId={missionId}
        trustedCount={trustedCount}
        companyCount={companies.length}
        thinCompanies={thinCompanies}
        coverageScore={coverageScore}
        topSources={topSources.map((s) => s.name)}
        topCompanies={topCompanies.map((c) => c.name)}
      />

      <div className="workspace" style={{ marginTop: "1rem" }}>
        <nav className="side-nav panel">
          <p className="notebook-hint muted">
            Append-only notes. Tasks can be marked done.
          </p>
          {(
            [
              ["journal", "Journal & tasks", journal.length],
              ["observations", "Observations", observations.length],
              ["hypotheses", "Hypotheses", hypotheses.length],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              className={`nav-link${tab === key ? " active" : ""}`}
              onClick={() => setTab(key)}
            >
              {label}
              <span className="mono" style={{ float: "right", opacity: 0.6 }}>
                {count}
              </span>
            </button>
          ))}
        </nav>

        <div className="workspace-layout">
          <section className="panel">
            <h2>
              {tab === "journal" && "Journal"}
              {tab === "observations" && "Observations"}
              {tab === "hypotheses" && "Hypotheses"}
            </h2>
            <p className="hint">
              {tab === "journal" &&
                "Notes and tasks. Producer stamped on every entry."}
              {tab === "observations" && "Facts only — no judgement, no score."}
              {tab === "hypotheses" &&
                "Ideas under test. Rejected ones stay — that is knowledge."}
            </p>

            {tab === "journal" && (
              <JournalList items={journal} onChanged={reload} />
            )}
            {tab === "observations" && (
              <ObservationList items={observations} />
            )}
            {tab === "hypotheses" && (
              <HypothesisList items={hypotheses} onChanged={reload} />
            )}
          </section>

          <section className="panel">
            <h2>Add</h2>
            <p className="hint">Writes as Producer · Human.</p>
            {tab === "journal" && (
              <JournalForm missionId={missionId} onSaved={reload} />
            )}
            {tab === "observations" && (
              <ObservationForm missionId={missionId} onSaved={reload} />
            )}
            {tab === "hypotheses" && (
              <HypothesisForm missionId={missionId} onSaved={reload} />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function MissionSummaryCard({
  mission,
  missionId,
  trustedCount,
  companyCount,
  thinCompanies,
  coverageScore,
  topSources,
  topCompanies,
}: {
  mission: Mission;
  missionId: string;
  trustedCount: number;
  companyCount: number;
  thinCompanies: number;
  coverageScore: number | null;
  topSources: string[];
  topCompanies: string[];
}) {
  const brief = mission.discoveryBrief;

  return (
    <section className="panel mission-summary-card">
      <div className="row" style={{ justifyContent: "space-between", gap: "0.75rem" }}>
        <div>
          <h2 style={{ margin: "0 0 0.25rem", fontSize: "1.15rem" }}>
            Mission overview
          </h2>
          <p className="muted" style={{ margin: 0, maxWidth: "36rem" }}>
            {mission.goal}
          </p>
        </div>
        <Link className="btn small" to={`/work/${missionId}/brief`}>
          Open Data Worker
        </Link>
      </div>

      <div className="mission-summary-grid">
        <div className="mission-summary-block">
          <h3>Discovery brief</h3>
          {brief?.approach ? (
            <p className="muted">{brief.approach}</p>
          ) : (
            <p className="muted">No brief yet — edit it in Data Worker · Brief.</p>
          )}
          {brief?.successCriteria ? (
            <p className="hint">Success: {brief.successCriteria}</p>
          ) : null}
          <Link className="btn secondary small" to={`/work/${missionId}/brief`}>
            Edit in Data Worker
          </Link>
        </div>

        <div className="mission-summary-block">
          <h3>Sources · {trustedCount} trusted</h3>
          {topSources.length ? (
            <p className="muted">{topSources.join(" · ")}</p>
          ) : (
            <p className="muted">No trusted lists yet.</p>
          )}
          <div className="row" style={{ gap: "0.35rem" }}>
            <Link className="btn secondary small" to={`/work/${missionId}/gaps`}>
              Gaps
            </Link>
            <Link className="btn secondary small" to={`/work/${missionId}/align`}>
              Align
            </Link>
          </div>
        </div>

        <div className="mission-summary-block">
          <h3>
            Companies · {companyCount}
            {coverageScore != null ? ` · ${coverageScore}%` : ""}
          </h3>
          {topCompanies.length ? (
            <p className="muted">
              {topCompanies.join(" · ")}
              {thinCompanies > 0 ? ` · ${thinCompanies} thin` : ""}
            </p>
          ) : (
            <p className="muted">No companies yet — extract in Data Worker.</p>
          )}
          <div className="row" style={{ gap: "0.35rem" }}>
            <Link
              className="btn secondary small"
              to={`/work/${missionId}/extract`}
            >
              Extract
            </Link>
            <Link
              className="btn secondary small"
              to={`/work/${missionId}/profile`}
            >
              Profile
            </Link>
            <Link
              className="btn secondary small"
              to={`/work/${missionId}/ranking`}
            >
              Ranking
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function JournalList({
  items,
  onChanged,
}: {
  items: JournalEntry[];
  onChanged: () => Promise<void>;
}) {
  if (!items.length) {
    return (
      <div className="empty">
        No journal entries yet. Add a note or task on the right.
      </div>
    );
  }

  async function toggleDone(item: JournalEntry) {
    if (item.kind !== "task") return;
    await api.updateEntity("journal", {
      ...item,
      done: !item.done,
      updatedAt: new Date().toISOString(),
    });
    await onChanged();
  }

  return (
    <div className="list">
      {items.map((item) => (
        <article key={item.id} className="item">
          <header>
            <h4>
              [{item.kind}] {item.title}
            </h4>
            <ProducerBadge producer={item.producer} />
          </header>
          <p>{item.body}</p>
          {item.kind === "task" ? (
            <div className="row" style={{ marginTop: "0.35rem" }}>
              <StatusChip
                label={item.done ? "Done" : "Open"}
                tone={item.done ? "done" : "waiting"}
              />
              <button
                type="button"
                className="btn secondary small"
                onClick={() => void toggleDone(item)}
              >
                Mark {item.done ? "open" : "done"}
              </button>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function ObservationList({ items }: { items: Observation[] }) {
  if (!items.length) {
    return (
      <div className="empty">
        No observations yet. Record a fact with an evidence URL.
      </div>
    );
  }
  return (
    <div className="list">
      {items.map((item) => (
        <article key={item.id} className="item">
          <header>
            <h4>{item.statement}</h4>
            <ProducerBadge producer={item.producer} />
          </header>
          {item.evidenceUrls.length ? (
            <p className="mono">{item.evidenceUrls.join(" · ")}</p>
          ) : null}
          {item.tags.length ? (
            <div className="mission-meta">
              {item.tags.map((t) => (
                <StatusChip key={t} label={t} />
              ))}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function HypothesisList({
  items,
  onChanged,
}: {
  items: Hypothesis[];
  onChanged: () => Promise<void>;
}) {
  if (!items.length) {
    return (
      <div className="empty">
        No hypotheses yet. Capture a claim under test.
      </div>
    );
  }

  async function setStatus(item: Hypothesis, status: HypothesisStatus) {
    await api.updateEntity("hypotheses", {
      ...item,
      status,
      updatedAt: new Date().toISOString(),
    });
    await onChanged();
  }

  return (
    <div className="list">
      {items.map((item) => (
        <article key={item.id} className="item">
          <header>
            <h4>{item.statement}</h4>
            <ProducerBadge producer={item.producer} />
          </header>
          {item.rationale ? <p>{item.rationale}</p> : null}
          <div className="mission-meta">
            <StatusChip
              label={item.status}
              tone={item.status === "Validated" ? "active" : "waiting"}
            />
          </div>
          <div className="item-actions">
            {(
              ["Draft", "Testing", "Validated", "Rejected", "Archived"] as const
            ).map((status) => (
              <button
                key={status}
                type="button"
                className="btn secondary small"
                onClick={() => void setStatus(item, status)}
                disabled={item.status === status}
              >
                {status}
              </button>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

function JournalForm({
  missionId,
  onSaved,
}: {
  missionId: string;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<"journal" | "note" | "task">("journal");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const now = new Date().toISOString();
    await api.createInMission(missionId, "journal", {
      id: uuid(),
      missionId,
      producer: "Human" as const,
      kind,
      title,
      body,
      done: kind === "task" ? false : undefined,
      createdAt: now,
      updatedAt: now,
      v: 1,
    });
    setTitle("");
    setBody("");
    await onSaved();
  }

  return (
    <form className="form-stack" onSubmit={submit}>
      <label>
        Kind
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
        >
          <option value="journal">Journal</option>
          <option value="note">Note</option>
          <option value="task">Task</option>
        </select>
      </label>
      <label>
        Title
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </label>
      <label>
        Body
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
        />
      </label>
      <button className="btn" type="submit">
        Save entry
      </button>
    </form>
  );
}

function ObservationForm({
  missionId,
  onSaved,
}: {
  missionId: string;
  onSaved: () => Promise<void>;
}) {
  const [statement, setStatement] = useState("");
  const [url, setUrl] = useState("");
  const [tags, setTags] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const now = new Date().toISOString();
    await api.createInMission(missionId, "observations", {
      id: uuid(),
      missionId,
      producer: "Human" as const,
      statement,
      evidenceUrls: url ? [url] : [],
      evidenceIds: [],
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      createdAt: now,
      updatedAt: now,
      v: 1,
    });
    setStatement("");
    setUrl("");
    setTags("");
    await onSaved();
  }

  return (
    <form className="form-stack" onSubmit={submit}>
      <label>
        Fact (no judgement)
        <textarea
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          required
        />
      </label>
      <label>
        Evidence URL
        <input value={url} onChange={(e) => setUrl(e.target.value)} />
      </label>
      <label>
        Tags (comma-separated)
        <input value={tags} onChange={(e) => setTags(e.target.value)} />
      </label>
      <button className="btn" type="submit">
        Record observation
      </button>
    </form>
  );
}

function HypothesisForm({
  missionId,
  onSaved,
}: {
  missionId: string;
  onSaved: () => Promise<void>;
}) {
  const [statement, setStatement] = useState("");
  const [rationale, setRationale] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const now = new Date().toISOString();
    await api.createInMission(missionId, "hypotheses", {
      id: uuid(),
      missionId,
      producer: "Human" as const,
      statement,
      status: "Draft" as const,
      observationIds: [],
      rationale: rationale || undefined,
      createdAt: now,
      updatedAt: now,
      v: 1,
    });
    setStatement("");
    setRationale("");
    await onSaved();
  }

  return (
    <form className="form-stack" onSubmit={submit}>
      <label>
        Hypothesis
        <textarea
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          required
        />
      </label>
      <label>
        Rationale
        <textarea
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
        />
      </label>
      <button className="btn" type="submit">
        Add hypothesis
      </button>
    </form>
  );
}
