import { useMemo } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { StatusChip } from "../components/Badges";
import type { MissionData } from "../hooks/useMissionData";

export function SituationRoomPage() {
  const { missionId = "" } = useParams();
  const {
    sources,
    companies,
    observations,
    hypotheses,
    journal,
    reviews,
    error,
  } = useOutletContext<MissionData>();

  const metrics = useMemo(() => {
    const pending = sources.filter(
      (s) => s.status === "draft" || s.status === "pending_review",
    ).length;
    const sourceCandidates = sources.filter((s) => s.status === "candidate")
      .length;
    const trusted = sources.filter(
      (s) => s.status === "accepted" || s.status === "adjusted",
    ).length;
    const reused = sources.filter(
      (s) => s.first_seen_mission !== missionId,
    ).length;
    const rejectedHyp = hypotheses.filter((h) => h.status === "Rejected")
      .length;
    const weak = sources.filter(
      (s) => (s.suggestedConfidence ?? s.suggestedWeight ?? 100) < 50,
    ).length;
    const missingEvidence = observations.filter(
      (o) => !o.evidenceUrls.length && !o.evidenceIds.length,
    ).length;
    const candidates = companies.filter((c) => c.status === "candidate")
      .length;
    const kvkFail = companies.filter((c) => c.kvk_gate === "fail").length;
    const blacklisted = companies.filter((c) => c.blacklist_flags.length > 0)
      .length;
    const thinProfiles = companies.filter(
      (c) =>
        c.capabilities.length === 0 && !(c.profileSnippet ?? "").trim(),
    ).length;
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
      thinProfiles,
    };
  }, [sources, hypotheses, observations, companies, missionId]);

  const bars = [
    { label: "Trusted lists", value: metrics.trusted, max: 5 },
    { label: "Align queue", value: metrics.pending, max: 8 },
    { label: "Sources (portfolio)", value: sources.length, max: 12 },
    { label: "Observation", value: observations.length, max: 10 },
    { label: "Hypothesis", value: hypotheses.length, max: 8 },
    { label: "Companies", value: companies.length, max: 20 },
    { label: "Thin profiles", value: metrics.thinProfiles, max: 20 },
    { label: "Reviews", value: reviews.length, max: 10 },
    { label: "Journal", value: journal.length, max: 10 },
  ];

  return (
    <div>
      <div className="worker-step-intro">
        <h2>Situation Room</h2>
        <p className="hint">
          Where to spend time next — production queues live in Data Worker;
          notebook attention stays here.
        </p>
      </div>

      {error ? <div className="error">{error}</div> : null}

      <section className="panel" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Data Worker status</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          Brief → Gaps → Probe → Align → Extract → Profile → Coverage → Search
        </p>
        <div className="mission-meta" style={{ marginBottom: "0.75rem" }}>
          <StatusChip
            label={`${metrics.trusted}/5 trusted lists`}
            tone={metrics.trusted >= 5 ? "done" : "waiting"}
          />
          <StatusChip
            label={`${metrics.pending} in align queue`}
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
          <Link className="btn secondary small" to={`/work/${missionId}/gaps`}>
            Gaps
          </Link>
          <Link className="btn secondary small" to={`/work/${missionId}/align`}>
            Align
          </Link>
          <Link
            className="btn secondary small"
            to={`/work/${missionId}/coverage`}
          >
            Coverage
          </Link>
          <Link
            className="btn secondary small"
            to={`/work/${missionId}/ranking`}
          >
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
          <h2>Progress</h2>
          <div className="list">
            {bars.map((b) => {
              const pct = Math.min(100, Math.round((b.value / b.max) * 100));
              return (
                <div key={b.label}>
                  <div
                    className="row"
                    style={{ justifyContent: "space-between" }}
                  >
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
              label="Open gaps / candidates"
              count={metrics.sourceCandidates}
              to={`/work/${missionId}/gaps`}
            />
            <Issue
              label="Needs human align (sources)"
              count={metrics.pending}
              to={`/work/${missionId}/align`}
            />
            <Issue
              label="Trusted lists (accepted/adjusted)"
              count={metrics.trusted}
              to={`/work/${missionId}/align`}
            />
            <Issue
              label="Thin company profiles"
              count={metrics.thinProfiles}
              to={`/work/${missionId}/profile`}
            />
            <Issue
              label="Company candidates"
              count={metrics.candidates}
              to={`/work/${missionId}/extract`}
            />
            <Issue
              label="Company reviews"
              count={metrics.candidates}
              to={`/missions/${missionId}/cara?target=company`}
            />
            <Issue label="KvK gate fail" count={metrics.kvkFail} />
            <Issue label="Blacklist flags set" count={metrics.blacklisted} />
            <Issue label="Rejected hypotheses" count={metrics.rejectedHyp} />
            <Issue
              label="Missing evidence on observations"
              count={metrics.missingEvidence}
            />
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
