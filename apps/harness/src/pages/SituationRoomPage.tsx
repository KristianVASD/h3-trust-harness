import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type {
  Company,
  Hypothesis,
  JournalEntry,
  Observation,
  Review,
  Source,
} from "@h3-trust/schema";
import { api } from "../api";
import { listReviews } from "../api-extra";
import { StatusChip } from "../components/Badges";

export function SituationRoomPage() {
  const { missionId = "" } = useParams();
  const [sources, setSources] = useState<Source[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [hypotheses, setHypotheses] = useState<Hypothesis[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      api.listSources(missionId),
      api.listCompanies(missionId),
      api.listObservations(missionId),
      api.listHypotheses(missionId),
      api.listJournal(missionId),
      listReviews(missionId),
    ])
      .then(([s, c, o, h, j, r]) => {
        setSources(s);
        setCompanies(c);
        setObservations(o);
        setHypotheses(h);
        setJournal(j);
        setReviews(r);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Load failed"));
  }, [missionId]);

  const metrics = useMemo(() => {
    const pending = sources.filter(
      (s) => s.status === "draft" || s.status === "pending_review",
    ).length;
    const sourceCandidates = sources.filter((s) => s.status === "candidate").length;
    const trusted = sources.filter(
      (s) => s.status === "accepted" || s.status === "adjusted",
    ).length;
    const reused = sources.filter(
      (s) => s.first_seen_mission !== missionId,
    ).length;
    const rejectedHyp = hypotheses.filter((h) => h.status === "Rejected").length;
    const weak = sources.filter(
      (s) => (s.suggestedConfidence ?? s.suggestedWeight ?? 100) < 50,
    ).length;
    const missingEvidence = observations.filter(
      (o) => !o.evidenceUrls.length && !o.evidenceIds.length,
    ).length;
    const candidates = companies.filter((c) => c.status === "candidate").length;
    const kvkFail = companies.filter((c) => c.kvk_gate === "fail").length;
    const blacklisted = companies.filter((c) => c.blacklist_flags.length > 0)
      .length;
    return {
      pending,
      sourceCandidates,
      trusted,
      reused,
      rejectedHyp,
      weak,
      missingEvidence,
      candidates,
      kvkFail,
      blacklisted,
    };
  }, [sources, hypotheses, observations, companies, missionId]);

  const bars = [
    { label: "Trusted lists (CARA)", value: metrics.trusted, max: 5 },
    { label: "Source candidates (triage)", value: metrics.sourceCandidates, max: 8 },
    { label: "Sources (portfolio)", value: sources.length, max: 12 },
    { label: "Observation", value: observations.length, max: 10 },
    { label: "Hypothesis", value: hypotheses.length, max: 8 },
    { label: "Companies", value: companies.length, max: 20 },
    { label: "CARA reviews", value: reviews.length, max: 10 },
    { label: "Journal", value: journal.length, max: 10 },
  ];

  return (
    <div>
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "1.8rem",
          marginTop: 0,
        }}
      >
        Situation Room
      </h1>
      <p className="muted">
        Phase 0: build a suitable list portfolio first. Reuse proves the method transfers.
      </p>

      {error ? <div className="error">{error}</div> : null}

      <section className="panel" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Data Worker status</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          Linear production line — gaps, CARA lists, import, ranked results.
        </p>
        <div className="mission-meta" style={{ marginBottom: "0.75rem" }}>
          <StatusChip
            label={`${metrics.trusted}/5 trusted lists`}
            tone={metrics.trusted >= 5 ? "done" : "waiting"}
          />
          <StatusChip
            label={`${metrics.pending} in CARA queue`}
            tone={metrics.pending ? "active" : "waiting"}
          />
          <StatusChip
            label={`${metrics.sourceCandidates} candidates`}
            tone={metrics.sourceCandidates ? "active" : "waiting"}
          />
          <StatusChip
            label={`${companies.length} companies`}
            tone={companies.length ? "active" : "waiting"}
          />
        </div>
        <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
          <Link className="btn small" to={`/work/${missionId}/brief`}>
            Open Data Worker
          </Link>
          <Link className="btn secondary small" to={`/work/${missionId}/align`}>
            Align queue
          </Link>
          <Link className="btn secondary small" to={`/work/${missionId}/ranking`}>
            Ranking
          </Link>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Source reuse</h2>
        <p style={{ marginBottom: 0, fontSize: "1.15rem" }}>
          <strong className="mono">
            {metrics.reused} of {sources.length}
          </strong>{" "}
          sources in this mission reused from earlier missions
        </p>
        <p className="hint">
          X = first_seen_mission ≠ this mission. That is the generalisation proof.
        </p>
      </section>

      <div className="workspace-layout">
        <section className="panel">
          <h2>Phase progress</h2>
          <div className="list">
            {bars.map((b) => {
              const pct = Math.min(100, Math.round((b.value / b.max) * 100));
              return (
                <div key={b.label}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <strong>{b.label}</strong>
                    <span className="mono">{b.value}</span>
                  </div>
                  <div
                    style={{
                      height: 10,
                      background: "var(--paper-2)",
                      border: "1px solid var(--line)",
                      marginTop: 4,
                    }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: "100%",
                        background: "var(--teal)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel">
          <h2>Needs attention</h2>
          <div className="list">
            <Issue
              label="Source candidates (triage)"
              count={metrics.sourceCandidates}
              to={`/work/${missionId}/gaps`}
            />
            <Issue
              label="Needs human review (sources)"
              count={metrics.pending}
              to={`/work/${missionId}/align`}
            />
            <Issue
              label="Trusted lists (accepted/adjusted)"
              count={metrics.trusted}
              to={`/work/${missionId}/align`}
            />
            <Issue
              label="Company candidates"
              count={metrics.candidates}
              to={`/missions/${missionId}`}
            />
            <Issue label="KvK gate fail" count={metrics.kvkFail} />
            <Issue label="Blacklist flags set" count={metrics.blacklisted} />
            <Issue label="Rejected hypotheses" count={metrics.rejectedHyp} />
            <Issue label="Missing evidence on observations" count={metrics.missingEvidence} />
            <Issue label="Weak suggested confidence" count={metrics.weak} />
          </div>
          <div className="mission-meta" style={{ marginTop: "1rem" }}>
            <StatusChip label={`${sources.length} sources`} tone="active" />
            <StatusChip label={`${companies.length} companies`} tone="active" />
            <StatusChip label={`${observations.length} observations`} />
            <StatusChip label={`${hypotheses.length} hypotheses`} />
            <StatusChip label={`${reviews.length} reviews`} />
          </div>
        </section>
      </div>
    </div>
  );
}

function Issue({
  label,
  count,
  to,
}: {
  label: string;
  count: number;
  to?: string;
}) {
  const body = (
    <article className="item">
      <header>
        <h4>{label}</h4>
        <span className="mono" style={{ fontSize: "1.1rem" }}>
          {count}
        </span>
      </header>
    </article>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}
