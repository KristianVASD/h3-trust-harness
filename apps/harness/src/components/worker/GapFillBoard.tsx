import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { v4 as uuid } from "uuid";
import {
  resolveSourceGaps,
  type CategoryCoverage,
  type MembershipThreshold,
  type Mission,
  type SearchPlanEntry,
  type Source,
  type SourceCategory,
  type SourceEvidence,
  type SourceScope,
} from "@h3-trust/schema";
import { api } from "../../api";
import {
  inboxSortSources,
  sourceInboxAction,
  sourceIsIdentityTool,
} from "../../lib/sourceInbox";
import { ProducerBadge, StatusChip } from "../Badges";

type EvidenceDraft = {
  domain_age: string;
  org_age: string;
  membership_threshold: MembershipThreshold;
  events: boolean;
  news: boolean;
  linkedin: boolean;
  summary: string;
};

function evidenceToDraft(ev?: SourceEvidence): EvidenceDraft {
  return {
    domain_age: ev?.domain_age ?? "",
    org_age: ev?.org_age ?? "",
    membership_threshold: ev?.membership_threshold ?? "unknown",
    events: ev?.real_world_presence?.events ?? false,
    news: ev?.real_world_presence?.news ?? false,
    linkedin: ev?.real_world_presence?.linkedin ?? false,
    summary: ev?.summary_reasons?.[0] ?? "",
  };
}

function draftToEvidence(d: EvidenceDraft, url?: string): SourceEvidence {
  const now = new Date().toISOString();
  const reasons = d.summary.trim() ? [d.summary.trim()] : [];
  return {
    checked_at: now,
    url: url || undefined,
    domain_age: d.domain_age.trim() || undefined,
    org_age: d.org_age.trim() || undefined,
    membership_threshold: d.membership_threshold,
    real_world_presence: {
      events: d.events,
      news: d.news,
      linkedin: d.linkedin,
    },
    summary_reasons: reasons,
  };
}

function hasEvidencePayload(ev?: SourceEvidence): boolean {
  if (!ev) return false;
  return Boolean(
    ev.domain_age ||
      ev.org_age ||
      ev.host_info ||
      ev.membership_threshold ||
      ev.content_consistency ||
      ev.real_world_presence ||
      (ev.summary_reasons?.length ?? 0) > 0,
  );
}

function evidenceTeaser(ev?: SourceEvidence): string | null {
  if (!ev) return null;
  const parts = [
    ev.domain_age ? `domain ${ev.domain_age}` : null,
    ev.org_age ? `org ${ev.org_age}` : null,
    ev.host_info ? `host ${ev.host_info}` : null,
    ev.membership_threshold && ev.membership_threshold !== "unknown"
      ? `membership ${ev.membership_threshold}`
      : null,
    ev.summary_reasons?.[0],
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

function InboxNextAction({
  source,
  missionId,
}: {
  source: Source;
  missionId: string;
}) {
  const action = sourceInboxAction(source, missionId);
  return (
    <Link className="btn small" to={action.href}>
      {action.label}
    </Link>
  );
}

function SourceProposalDetails({ source }: { source: Source }) {
  const ev = source.evidence;
  const presence = ev?.real_world_presence
    ? [
        ev.real_world_presence.events ? "events" : null,
        ev.real_world_presence.news ? "news" : null,
        ev.real_world_presence.linkedin ? "linkedin" : null,
      ]
        .filter(Boolean)
        .join(", ")
    : "";

  return (
    <div className="worker-proposal-details">
      {source.reason ? (
        <p className="worker-proposal-reason">{source.reason}</p>
      ) : (
        <p className="hint" style={{ margin: 0 }}>
          No proposal reason recorded.
        </p>
      )}
      {source.notes ? <p className="muted worker-proposal-notes">{source.notes}</p> : null}

      {hasEvidencePayload(ev) ? (
        <div className="worker-proposal-evidence">
          <h4>Why this source</h4>
          <ul className="worker-mention-list">
            {ev?.domain_age ? <li>Domain age: {ev.domain_age}</li> : null}
            {ev?.org_age ? <li>Org age: {ev.org_age}</li> : null}
            {ev?.host_info ? <li>Host: {ev.host_info}</li> : null}
            {ev?.membership_threshold ? (
              <li>Membership: {ev.membership_threshold}</li>
            ) : null}
            {ev?.content_consistency ? (
              <li>
                Content consistency:{" "}
                {ev.content_consistency.ok ? "ok" : "weak"}
                {ev.content_consistency.note
                  ? ` — ${ev.content_consistency.note}`
                  : ""}
              </li>
            ) : null}
            {presence ? <li>Real-world: {presence}</li> : null}
            {ev?.real_world_presence?.notes ? (
              <li>{ev.real_world_presence.notes}</li>
            ) : null}
            {(ev?.summary_reasons ?? []).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="hint worker-thin-warning" style={{ marginBottom: 0 }}>
          No structured evidence yet — open the URL and judge carefully before
          Keep.
        </p>
      )}
    </div>
  );
}



export function GapFillBoard({
  missionId,
  mission,
  sources,
  catalogue,
  planEntries,
  onChanged,
}: {
  missionId: string;
  mission: Mission;
  sources: Source[];
  catalogue: Source[];
  planEntries: SearchPlanEntry[];
  onChanged: () => Promise<void>;
}) {
  const coverage = useMemo(
    () =>
      resolveSourceGaps(
        catalogue,
        mission.location,
        mission.sector,
        planEntries,
      ),
    [catalogue, mission.location, mission.sector, planEntries],
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [weight, setWeight] = useState("70");
  const [evidenceOpenId, setEvidenceOpenId] = useState<string | null>(null);
  const [evidenceDraft, setEvidenceDraft] = useState<EvidenceDraft>(
    evidenceToDraft(),
  );
  const [inspectOpenId, setInspectOpenId] = useState<string | null>(null);
  const [omegaBusyCat, setOmegaBusyCat] = useState<string | null>(null);

  const { missionSourcesByCat, identitySources } = useMemo(() => {
    const map = new Map<string, Source[]>();
    const identity: Source[] = [];
    for (const s of sources) {
      if (sourceIsIdentityTool(s)) {
        identity.push(s);
        continue;
      }
      const list = map.get(s.category) ?? [];
      list.push(s);
      map.set(s.category, list);
    }
    for (const [key, list] of map) {
      map.set(key, inboxSortSources(list));
    }
    return {
      missionSourcesByCat: map,
      identitySources: inboxSortSources(identity),
    };
  }, [sources]);

  const draftCount = useMemo(
    () => sources.filter((s) => s.status === "draft").length,
    [sources],
  );

  async function addCandidate(
    e: FormEvent,
    category: SourceCategory,
    layer: SourceScope,
  ) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      await api.createInMission(missionId, "sources", {
        id: uuid(),
        producer: "Human" as const,
        first_seen_mission: missionId,
        reused_in_missions: [],
        name: name.trim() || url.trim() || category,
        type: "other" as const,
        category,
        scope: layer,
        region: layer === "national" ? "" : mission.location,
        url: url.trim() || undefined,
        reason: "Added via Data Worker gap fill.",
        suggestedWeight: Number(weight) || 70,
        suggestedConfidence: Number(weight) || 70,
        signalIds: [],
        evidenceIds: [],
        status: "candidate" as const,
        createdAt: now,
        updatedAt: now,
        v: 1,
      });
      setUrl("");
      setName("");
      setAddingFor(null);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Add failed");
    } finally {
      setBusy(false);
    }
  }

  async function keep(source: Source) {
    setBusy(true);
    setError(null);
    try {
      await api.updateEntity("sources", {
        ...source,
        status: "draft",
        updatedAt: new Date().toISOString(),
      });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Keep failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(source: Source) {
    setBusy(true);
    setError(null);
    try {
      await api.updateEntity("sources", {
        ...source,
        status: "rejected",
        notes: [source.notes, "Removed in Data Worker."]
          .filter(Boolean)
          .join(" "),
        updatedAt: new Date().toISOString(),
      });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  }

  async function markReady(source: Source) {
    setBusy(true);
    setError(null);
    try {
      await api.updateEntity("sources", {
        ...source,
        status: "pending_review",
        updatedAt: new Date().toISOString(),
      });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function sendAllDrafts() {
    const drafts = sources.filter((s) => s.status === "draft");
    if (!drafts.length) return;
    setBusy(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      for (const s of drafts) {
        await api.updateEntity("sources", {
          ...s,
          status: "pending_review",
          updatedAt: now,
        });
      }
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk send failed");
    } finally {
      setBusy(false);
    }
  }

  function openEvidence(source: Source) {
    setEvidenceOpenId(source.id);
    setEvidenceDraft(evidenceToDraft(source.evidence));
  }

  async function saveEvidence(source: Source) {
    setBusy(true);
    setError(null);
    try {
      await api.updateEntity("sources", {
        ...source,
        evidence: draftToEvidence(evidenceDraft, source.url),
        updatedAt: new Date().toISOString(),
      });
      setEvidenceOpenId(null);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save evidence failed");
    } finally {
      setBusy(false);
    }
  }

  /** Phase 3 — Ask Ω via server adapter; provisional candidates land with Ω badge. */
  async function askOmegaClaw(
    category: SourceCategory,
    layer: SourceScope,
    nuance_rule?: string,
  ) {
    setOmegaBusyCat(category);
    setError(null);
    try {
      const result = await api.discoverSources(missionId, {
        layer,
        category,
        ...(nuance_rule ? { nuance_rule } : {}),
      });
      if (!result.sources.length) {
        const reason =
          result.skipped.map((s) => s.reason).filter(Boolean).join(" · ") ||
          "OmegaClaw found no new candidates for this gap.";
        setError(reason);
      }
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "OmegaClaw discover failed");
    } finally {
      setOmegaBusyCat(null);
    }
  }

  const byCategory = useMemo(() => {
    const map = new Map<string, CategoryCoverage[]>();
    for (const row of coverage) {
      const list = map.get(row.category) ?? [];
      list.push(row);
      map.set(row.category, list);
    }
    return map;
  }, [coverage]);

  return (
    <div className="gap-fill-board">
      {error ? <div className="error">{error}</div> : null}

      {draftCount > 0 ? (
        <div className="worker-bulk-bar">
          <p className="muted" style={{ margin: 0 }}>
            {draftCount} draft{draftCount === 1 ? "" : "s"} waiting for CARA
          </p>
          <button
            type="button"
            className="btn small"
            disabled={busy}
            onClick={() => void sendAllDrafts()}
          >
            Send all drafts to CARA
          </button>
        </div>
      ) : null}

      {!coverage.length ? (
        <div className="empty">No search plan loaded for this mission.</div>
      ) : (
        <div className="list worker-gap-list">
          {[...byCategory.entries()].map(([category, rows]) => {
            const catSources = missionSourcesByCat.get(category) ?? [];
            const candidates = catSources.filter((s) => s.status === "candidate");
            const drafts = catSources.filter(
              (s) => s.status === "draft" || s.status === "pending_review",
            );
            const trusted = catSources.filter(
              (s) => s.status === "accepted" || s.status === "adjusted",
            );
            const anyGap = rows.some((r) => r.status === "gap");
            const primaryLayer = (rows.find((r) => r.status === "gap")?.layer ??
              rows[0]?.layer ??
              "regional") as SourceScope;
            const addKey = category;
            const omegaBusy = omegaBusyCat === category;

            return (
              <article
                key={category}
                className={`item worker-gap-card ${anyGap ? "is-gap" : "is-covered"}`}
              >
                <header>
                  <div>
                    <h3 className="mono" style={{ margin: 0 }}>
                      {category}
                    </h3>
                    <p className="muted" style={{ margin: "0.25rem 0 0" }}>
                      {rows
                        .map((r) =>
                          r.status === "covered"
                            ? `${r.layer}: ✓ ${r.sourceName}`
                            : `${r.layer}: gap`,
                        )
                        .join(" · ")}
                    </p>
                  </div>
                  <StatusChip
                    label={anyGap ? "needs source" : "covered"}
                    tone={anyGap ? "waiting" : "done"}
                  />
                </header>

                {rows[0]?.nuance_rule ? (
                  <p className="hint" style={{ marginTop: "0.5rem" }}>
                    {rows[0].nuance_rule}
                  </p>
                ) : null}

                {trusted.length > 0 ? (
                  <div className="worker-source-stack">
                    {trusted.map((s) => (
                      <div key={s.id} className="worker-source-row trusted">
                        <div>
                          <strong>{s.name}</strong>
                          <span className="muted">
                            {" "}
                            · trusted · score{" "}
                            {s.suggestedConfidence ?? s.suggestedWeight ?? "—"}
                          </span>
                        </div>
                        <div
                          className="row"
                          style={{ gap: "0.35rem", flexWrap: "wrap" }}
                        >
                          <InboxNextAction
                            source={s}
                            missionId={missionId}
                          />
                          <StatusChip label={s.status} tone="done" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {drafts.length > 0 ? (
                  <div className="worker-source-stack">
                    {drafts.map((s) => (
                      <div key={s.id} className="worker-source-row draft">
                        <div style={{ flex: 1 }}>
                          <strong>{s.name}</strong>
                          {s.url ? (
                            <p className="mono muted" style={{ margin: "0.1rem 0 0" }}>
                              <a
                                href={s.url}
                                target="_blank"
                                rel="noreferrer"
                                className="worker-source-url"
                              >
                                {s.url}
                              </a>
                            </p>
                          ) : null}
                          <div className="mission-meta" style={{ marginTop: "0.25rem" }}>
                            <ProducerBadge producer={s.producer} status={s.status} />
                            <StatusChip label={s.status} />
                            {hasEvidencePayload(s.evidence) ? (
                              <StatusChip label="evidence" tone="done" />
                            ) : (
                              <StatusChip label="no evidence" tone="waiting" />
                            )}
                          </div>

                          {evidenceOpenId === s.id ? (
                            <div className="worker-evidence-form">
                              <label>
                                Domain age
                                <input
                                  value={evidenceDraft.domain_age}
                                  onChange={(e) =>
                                    setEvidenceDraft((d) => ({
                                      ...d,
                                      domain_age: e.target.value,
                                    }))
                                  }
                                  placeholder="e.g. 12 years / 3 months"
                                />
                              </label>
                              <label>
                                Org age
                                <input
                                  value={evidenceDraft.org_age}
                                  onChange={(e) =>
                                    setEvidenceDraft((d) => ({
                                      ...d,
                                      org_age: e.target.value,
                                    }))
                                  }
                                  placeholder="e.g. since 1998"
                                />
                              </label>
                              <label>
                                Membership
                                <select
                                  value={evidenceDraft.membership_threshold}
                                  onChange={(e) =>
                                    setEvidenceDraft((d) => ({
                                      ...d,
                                      membership_threshold: e.target
                                        .value as MembershipThreshold,
                                    }))
                                  }
                                >
                                  <option value="low">low</option>
                                  <option value="medium">medium</option>
                                  <option value="high">high</option>
                                  <option value="unknown">unknown</option>
                                </select>
                              </label>
                              <fieldset className="worker-evidence-checks">
                                <legend>Real-world</legend>
                                <label className="check-inline">
                                  <input
                                    type="checkbox"
                                    checked={evidenceDraft.events}
                                    onChange={(e) =>
                                      setEvidenceDraft((d) => ({
                                        ...d,
                                        events: e.target.checked,
                                      }))
                                    }
                                  />
                                  events
                                </label>
                                <label className="check-inline">
                                  <input
                                    type="checkbox"
                                    checked={evidenceDraft.news}
                                    onChange={(e) =>
                                      setEvidenceDraft((d) => ({
                                        ...d,
                                        news: e.target.checked,
                                      }))
                                    }
                                  />
                                  news
                                </label>
                                <label className="check-inline">
                                  <input
                                    type="checkbox"
                                    checked={evidenceDraft.linkedin}
                                    onChange={(e) =>
                                      setEvidenceDraft((d) => ({
                                        ...d,
                                        linkedin: e.target.checked,
                                      }))
                                    }
                                  />
                                  linkedin
                                </label>
                              </fieldset>
                              <label>
                                Summary
                                <input
                                  value={evidenceDraft.summary}
                                  onChange={(e) =>
                                    setEvidenceDraft((d) => ({
                                      ...d,
                                      summary: e.target.value,
                                    }))
                                  }
                                  placeholder="One-line reason for CARA"
                                />
                              </label>
                              <div className="row" style={{ gap: "0.35rem" }}>
                                <button
                                  type="button"
                                  className="btn small"
                                  disabled={busy}
                                  onClick={() => void saveEvidence(s)}
                                >
                                  Save evidence
                                </button>
                                <button
                                  type="button"
                                  className="btn secondary small"
                                  onClick={() => setEvidenceOpenId(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : evidenceTeaser(s.evidence) ? (
                            <p className="hint worker-evidence-summary">
                              {evidenceTeaser(s.evidence)}
                            </p>
                          ) : null}
                        </div>
                        <div
                          className="row"
                          style={{ gap: "0.35rem", flexWrap: "wrap" }}
                        >
                          <InboxNextAction
                            source={s}
                            missionId={missionId}
                          />
                          {s.status === "draft" ? (
                            <>
                              <button
                                type="button"
                                className="btn secondary small"
                                disabled={busy}
                                onClick={() => openEvidence(s)}
                              >
                                {s.evidence ? "Edit evidence" : "Add evidence"}
                              </button>
                              <button
                                type="button"
                                className="btn secondary small"
                                disabled={busy}
                                onClick={() => void markReady(s)}
                              >
                                Ready for CARA
                              </button>
                            </>
                          ) : null}
                          <button
                            type="button"
                            className="btn danger small"
                            disabled={busy}
                            onClick={() => void remove(s)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {candidates.length > 0 ? (
                  <div className="worker-source-stack">
                    {candidates.map((s) => {
                      const open = inspectOpenId === s.id;
                      const teaser =
                        evidenceTeaser(s.evidence) ||
                        s.reason ||
                        s.notes ||
                        null;
                      return (
                        <div key={s.id} className="worker-source-row candidate">
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <button
                              type="button"
                              className="worker-candidate-toggle"
                              aria-expanded={open}
                              onClick={() =>
                                setInspectOpenId(open ? null : s.id)
                              }
                            >
                              <strong>{s.name}</strong>
                              <span className="muted worker-candidate-toggle-hint">
                                {open ? "Hide details" : "Show why chosen"}
                              </span>
                            </button>
                            {s.url ? (
                              <p
                                className="mono muted"
                                style={{ margin: "0.15rem 0 0" }}
                              >
                                <a
                                  href={s.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="worker-source-url"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {s.url}
                                </a>
                              </p>
                            ) : null}
                            {!open && s.reason ? (
                              <p className="worker-proposal-reason compact">
                                {s.reason}
                              </p>
                            ) : null}
                            {!open && teaser && teaser !== s.reason ? (
                              <p className="hint worker-evidence-summary">
                                {teaser}
                              </p>
                            ) : null}
                            <div
                              className="mission-meta"
                              style={{ marginTop: "0.25rem" }}
                            >
                              <ProducerBadge producer={s.producer} status={s.status} />
                              {s.scope ? <StatusChip label={s.scope} /> : null}
                              {s.region ? <StatusChip label={s.region} /> : null}
                              {hasEvidencePayload(s.evidence) ? (
                                <StatusChip label="evidence" tone="done" />
                              ) : (
                                <StatusChip label="no evidence" tone="waiting" />
                              )}
                            </div>
                            {open ? <SourceProposalDetails source={s} /> : null}
                          </div>
                          <div
                            className="row"
                            style={{ gap: "0.35rem", flexWrap: "wrap" }}
                          >
                            <InboxNextAction
                              source={s}
                              missionId={missionId}
                            />
                            {!open ? (
                              <button
                                type="button"
                                className="btn secondary small"
                                onClick={() => setInspectOpenId(s.id)}
                              >
                                Inspect
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="btn small triage-keep"
                              disabled={busy}
                              onClick={() => void keep(s)}
                            >
                              Keep → draft
                            </button>
                            <button
                              type="button"
                              className="btn danger small"
                              disabled={busy}
                              onClick={() => void remove(s)}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                {addingFor === addKey ? (
                  <form
                    className="form-stack worker-add-form"
                    onSubmit={(e) =>
                      void addCandidate(e, category as SourceCategory, primaryLayer)
                    }
                  >
                    <label>
                      URL
                      <input
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://…"
                        required
                        autoFocus
                      />
                    </label>
                    <label>
                      Name (optional)
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Derived from URL if empty"
                      />
                    </label>
                    <label>
                      Suggested weight (0–100)
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={weight}
                        onChange={(e) => setWeight(e.target.value)}
                      />
                    </label>
                    <div className="row">
                      <button className="btn triage-keep" type="submit" disabled={busy}>
                        {busy ? "Adding…" : "Add candidate"}
                      </button>
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() => setAddingFor(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="row worker-gap-actions">
                    <button
                      type="button"
                      className="btn secondary small"
                      onClick={() => {
                        setAddingFor(addKey);
                        setUrl("");
                        setName("");
                      }}
                    >
                      + Add source{anyGap ? " for gap" : " (extra)"}
                    </button>
                    {anyGap ? (
                      <button
                        type="button"
                        className="btn secondary small"
                        disabled={busy || omegaBusy}
                        onClick={() => {
                          const gapRow = rows.find((r) => r.status === "gap");
                          void askOmegaClaw(
                            category as SourceCategory,
                            primaryLayer,
                            gapRow?.nuance_rule ?? rows[0]?.nuance_rule,
                          );
                        }}
                      >
                        {omegaBusy ? "OmegaClaw thinking…" : "Ask OmegaClaw"}
                      </button>
                    ) : null}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      <details className="worker-advanced" style={{ marginTop: "1rem" }}>
        <summary>
          Identity layer (verify-only) · {identitySources.length} tools
        </summary>
        {identitySources.length === 0 ? (
          <p className="empty">No registry / search-form tools on this job.</p>
        ) : (
          <div className="worker-source-stack">
            {identitySources.map((s) => (
              <div key={s.id} className="worker-source-row">
                <div>
                  <strong>{s.name}</strong>
                  <span className="muted">
                    {" "}
                    · {s.category}
                    {s.extractionGuide?.listPattern
                      ? ` · ${s.extractionGuide.listPattern}`
                      : ""}
                  </span>
                </div>
                <StatusChip label="verify-only" tone="waiting" />
              </div>
            ))}
          </div>
        )}
      </details>
    </div>
  );
}
