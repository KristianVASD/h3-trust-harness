import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { v4 as uuid } from "uuid";
import type { Review, Source, SourceScope } from "@h3-trust/schema";
import { createEntity, updateEntity } from "../../api-extra";
import type { MissionData } from "../../hooks/useMissionData";
import { ProducerBadge, StatusChip } from "../../components/Badges";
import { RichnessBar } from "../../components/worker/SourceProbeDetail";
import { TrustedSourcesPackPanel } from "../../components/worker/TrustedSourcesPackPanel";
import { useAuth } from "../../auth/AuthContext";
import { useCanInteract } from "../../hooks/useCanInteract";
import { TRUSTED_LIST_UNLOCK, countTrustedLists } from "../../lib/worker";

const SCOPES: SourceScope[] = ["national", "regional", "local"];

function isAlignQueueItem(s: Source): boolean {
  return (
    (s.probeStatus === "probed" && s.status === "candidate") ||
    s.status === "draft" ||
    s.status === "pending_review"
  );
}

function sortAlignQueue(a: Source, b: Source): number {
  const aProbed = a.probeStatus === "probed" && a.status === "candidate" ? 0 : 1;
  const bProbed = b.probeStatus === "probed" && b.status === "candidate" ? 0 : 1;
  if (aProbed !== bProbed) return aProbed - bProbed;
  return b.updatedAt.localeCompare(a.updatedAt);
}

function actionLabel(action: Review["action"]): string {
  if (action === "disagree") return "Dissent";
  return action === "agree" ? "Agree" : "Adjust";
}

/**
 * CURAD · Align — Mirror dual-label cockpit (Phase 5).
 * Human reacts to Ω provisional proposals; dissent preserved; feeds → next Ω.
 */
export function WorkerCaraPage() {
  const { missionId = "" } = useParams();
  const { mission, sources, reviews, reload } = useOutletContext<MissionData>();
  const { canInteract, isPending } = useCanInteract();
  const { isAdmin, openMode } = useAuth();
  /** Pre-Ω manual pack — admin on deployed auth; always in local open mode. */
  const showTrustedPack = isAdmin || openMode;

  const sourceQueue = useMemo(
    () => sources.filter(isAlignQueueItem).sort(sortAlignQueue),
    [sources],
  );

  const trustedCount = countTrustedLists(sources);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adjustMode, setAdjustMode] = useState(false);
  const [weight, setWeight] = useState("70");
  const [confidence, setConfidence] = useState("70");
  const [scope, setScope] = useState<SourceScope>("regional");
  const [region, setRegion] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Last human judgement shown in the You column after submit (before queue advances). */
  const [lastJudgement, setLastJudgement] = useState<{
    sourceId: string;
    action: Review["action"];
    score: number | undefined;
    reason?: string;
  } | null>(null);

  useEffect(() => {
    setSelectedId((prev) => {
      if (prev && sourceQueue.some((s) => s.id === prev)) return prev;
      return sourceQueue[0]?.id ?? null;
    });
  }, [sourceQueue]);

  const selected: Source | null =
    sources.find((s) => s.id === selectedId) ?? null;

  const selectedReviews = useMemo(() => {
    if (!selectedId) return [];
    return reviews
      .filter((r) => r.targetType === "source" && r.targetId === selectedId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [reviews, selectedId]);

  const latestReview = selectedReviews[0] ?? null;

  useEffect(() => {
    if (!selected) return;
    const conf = selected.suggestedConfidence ?? selected.suggestedWeight ?? 70;
    const w = selected.suggestedWeight ?? selected.suggestedConfidence ?? 70;
    setConfidence(String(conf));
    setWeight(String(w));
    setScope(selected.scope);
    setRegion(selected.region ?? "");
    setAdjustMode(false);
    setReason("");
    setLastJudgement((prev) =>
      prev && prev.sourceId === selected.id ? prev : null,
    );
  }, [selected]);

  async function submit(action: "agree" | "disagree" | "adjust") {
    if (!selected) return;
    if ((action === "adjust" || action === "disagree") && reason.trim().length < 8) {
      setError(
        action === "disagree"
          ? "Dissent needs a reason (min 8 characters)."
          : "Adjust needs a reason (min 8 characters).",
      );
      return;
    }

    if (action === "adjust") {
      const w = Number(weight);
      const c = Number(confidence);
      if (!Number.isFinite(w) || w < 0 || w > 100) {
        setError("Weight must be 0–100.");
        return;
      }
      if (!Number.isFinite(c) || c < 0 || c > 100) {
        setError("Confidence must be 0–100.");
        return;
      }
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const now = new Date().toISOString();
      const original =
        selected.suggestedConfidence ?? selected.suggestedWeight ?? undefined;
      const score =
        action === "agree"
          ? original
          : action === "disagree"
            ? 0
            : Number(confidence);

      const review: Review = {
        id: uuid(),
        missionId,
        producer: "Human",
        targetType: "source",
        targetId: selected.id,
        action,
        originalScore: original,
        humanScore: score,
        reason: reason.trim() || undefined,
        valueTags: [],
        observationIds: [],
        hypothesisIds: [],
        evidenceIds: selected.evidenceIds,
        version: 1,
        fedBackToOmega: false,
        ...(selected.producer === "OmegaClaw"
          ? { reactsToProducer: "OmegaClaw" as const }
          : {}),
        createdAt: now,
        updatedAt: now,
        v: 1,
      };

      await createEntity(missionId, "reviews", review);

      const status =
        action === "agree"
          ? "accepted"
          : action === "adjust"
            ? "adjusted"
            : "rejected";

      const nextScope = action === "adjust" ? scope : selected.scope;
      const nextRegion =
        action === "adjust"
          ? nextScope === "national"
            ? ""
            : region.trim()
          : selected.region;
      const nextWeight =
        action === "agree"
          ? (selected.suggestedWeight ?? score)
          : action === "disagree"
            ? 0
            : Number(weight);
      const nextConfidence =
        action === "agree"
          ? (selected.suggestedConfidence ?? score)
          : action === "disagree"
            ? 0
            : Number(confidence);

      await updateEntity("sources", {
        ...selected,
        status,
        suggestedWeight: nextWeight,
        suggestedConfidence: nextConfidence,
        scope: nextScope,
        region: nextRegion,
        updatedAt: now,
      });

      if (action !== "agree") {
        await createEntity(missionId, "findings", {
          id: uuid(),
          missionId,
          producer: "Human" as const,
          summary:
            action === "adjust"
              ? `Adjusted source "${selected.name}" (weight ${nextWeight}, confidence ${nextConfidence}, ${nextScope}${nextRegion ? ` / ${nextRegion}` : ""}): ${reason}`
              : `Dissented on source "${selected.name}": ${reason}`,
          status: action === "adjust" ? "Validated" : "Rejected",
          confidence: score,
          reviewIds: [review.id],
          observationIds: [],
          hypothesisIds: [],
          evidenceIds: selected.evidenceIds,
          sourceIds: [selected.id],
          companyIds: [],
          createdAt: now,
          updatedAt: now,
          v: 1,
        });
      }

      setLastJudgement({
        sourceId: selected.id,
        action,
        score,
        reason: reason.trim() || undefined,
      });
      setReason("");
      setAdjustMode(false);
      setMessage(`${actionLabel(action)} recorded for ${selected.name}.`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "CURAD align failed");
    } finally {
      setBusy(false);
    }
  }

  const youSlot =
    lastJudgement && selected && lastJudgement.sourceId === selected.id
      ? lastJudgement
      : latestReview
        ? {
            sourceId: latestReview.targetId,
            action: latestReview.action,
            score: latestReview.humanScore,
            reason: latestReview.reason,
          }
        : null;

  return (
    <div className="worker-step-page">
      <div className="worker-step-intro">
        <h2>CURAD · Align</h2>
        <p className="hint">
          Mirror dual-labelling — Ω proposal on the left, your judgement on the
          right. Agree keeps the proposal; Adjust tweaks weight, confidence,
          scope, region; Dissent rejects with a preserved reason. Extract
          unlocks at {TRUSTED_LIST_UNLOCK} trusted lists ({trustedCount} so
          far).
        </p>
      </div>

      {error ? <div className="error">{error}</div> : null}
      {message ? (
        <div className="thesis" style={{ borderColor: "var(--teal)" }}>
          {message}
        </div>
      ) : null}

      {showTrustedPack && mission && trustedCount > 0 ? (
        <TrustedSourcesPackPanel
          mission={mission}
          sources={sources}
          compact
        />
      ) : null}

      {!sourceQueue.length ? (
        <div className="empty worker-empty-hero">
          <p>No sources waiting for alignment.</p>
          <p className="muted">
            Probe Ω candidates on Probe, or Keep → draft on Gaps — then align
            here.
            {trustedCount > 0
              ? showTrustedPack
                ? ` ${trustedCount} list(s) already CURAD-locked — pack above for Job 3.`
                : ` ${trustedCount} list(s) already CURAD-locked.`
              : ""}
          </p>
          <div
            className="row"
            style={{ justifyContent: "center", marginTop: "1rem", gap: "0.5rem" }}
          >
            <Link className="btn secondary" to={`/work/${missionId}/probe`}>
              ← Probe
            </Link>
            <Link className="btn secondary" to={`/work/${missionId}/gaps`}>
              ← Gaps
            </Link>
            {trustedCount > 0 ? (
              <Link className="btn" to={`/work/${missionId}/extract`}>
                Continue to Extract →
              </Link>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="worker-cara-layout">
          <aside className="worker-cara-queue panel cara-source-panel">
            <h3 style={{ marginTop: 0 }}>Queue ({sourceQueue.length})</h3>
            <div className="list">
              {sourceQueue.map((s) => {
                const probedCand =
                  s.probeStatus === "probed" && s.status === "candidate";
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`item worker-queue-item ${selectedId === s.id ? "selected" : ""}`}
                    onClick={() => setSelectedId(s.id)}
                  >
                    <strong>{s.name}</strong>
                    <span className="muted">
                      {probedCand ? "probed · " : ""}
                      {s.category} ·{" "}
                      {s.suggestedConfidence ?? s.suggestedWeight ?? "—"}
                    </span>
                    {s.producer === "OmegaClaw" ? (
                      <span className="curad-queue-omega">Ω</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="panel cara-source-panel worker-cara-focus">
            {!selected ? (
              <div className="empty">Select a source.</div>
            ) : (
              <>
                <div className="curad-mirror">
                  <div className="curad-omega">
                    <header className="curad-col-head">
                      <span className="curad-col-label">Ω</span>
                      <ProducerBadge
                        producer={selected.producer}
                        status={selected.status}
                      />
                      <StatusChip label={selected.status} />
                    </header>
                    <h3 style={{ marginTop: "0.5rem", marginBottom: "0.35rem" }}>
                      {selected.name}
                    </h3>
                    {selected.url ? (
                      <p className="mono muted" style={{ margin: "0 0 0.5rem" }}>
                        <a
                          href={selected.url}
                          target="_blank"
                          rel="noreferrer"
                          className="worker-source-url"
                        >
                          {selected.url}
                        </a>
                      </p>
                    ) : null}
                    <p style={{ margin: "0 0 0.5rem" }}>
                      {selected.reason || "No Ω reason recorded."}
                    </p>
                    <p className="muted" style={{ margin: "0 0 0.75rem" }}>
                      Suggested · weight{" "}
                      {selected.suggestedWeight ?? "—"} · confidence{" "}
                      {selected.suggestedConfidence ?? "—"} · {selected.scope}
                      {selected.region ? ` / ${selected.region}` : ""}
                    </p>

                    {selected.richness || selected.sourceFields?.length ? (
                      <div className="curad-richness-block">
                        <h4 className="curad-subhead">Richness</h4>
                        <RichnessBar
                          richness={selected.richness}
                          sourceFields={selected.sourceFields}
                        />
                      </div>
                    ) : null}

                    {selected.extractionGuide ? (
                      <p className="muted" style={{ fontSize: "0.85rem" }}>
                        Guide: {selected.extractionGuide.listPattern} ·{" "}
                        {selected.extractionGuide.fields.length} fields
                        {selected.extractionGuide.pagination
                          ? " · paginated"
                          : ""}
                      </p>
                    ) : null}

                    {selected.evidence?.summary_reasons?.length ? (
                      <div className="worker-cara-evidence">
                        <h4 className="curad-subhead">Evidence</h4>
                        <ul className="worker-mention-list">
                          {selected.evidence.summary_reasons.map((r) => (
                            <li key={r}>{r}</li>
                          ))}
                        </ul>
                      </div>
                    ) : !selected.evidence ? (
                      <p className="hint worker-thin-warning">
                        Thin evidence — rate carefully after Probe.
                      </p>
                    ) : null}
                  </div>

                  <div className="curad-you">
                    <header className="curad-col-head">
                      <span className="curad-col-label">You</span>
                    </header>

                    {!youSlot ? (
                      <div className="curad-you-awaiting">
                        <p>Awaiting your judgement</p>
                        <p className="muted">
                          Agree, Adjust, or Dissent — human and Ω stay side by
                          side.
                        </p>
                      </div>
                    ) : (
                      <div className="curad-you-filled">
                        <StatusChip
                          label={actionLabel(youSlot.action)}
                          tone={
                            youSlot.action === "disagree" ? "waiting" : "done"
                          }
                        />
                        <p style={{ margin: "0.5rem 0 0.25rem" }}>
                          Score:{" "}
                          <strong>
                            {youSlot.score ?? "—"}
                          </strong>
                        </p>
                        {youSlot.reason ? (
                          <p className="curad-you-reason">{youSlot.reason}</p>
                        ) : null}
                      </div>
                    )}

                    {adjustMode ? (
                      <div className="curad-adjust-fields form-stack">
                        <h4 className="curad-subhead">Adjust fields</h4>
                        <label>
                          Weight (0–100)
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={weight}
                            onChange={(e) => setWeight(e.target.value)}
                          />
                        </label>
                        <label>
                          Confidence (0–100)
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={confidence}
                            onChange={(e) => setConfidence(e.target.value)}
                          />
                        </label>
                        <label>
                          Scope
                          <select
                            value={scope}
                            onChange={(e) =>
                              setScope(e.target.value as SourceScope)
                            }
                          >
                            {SCOPES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Region
                          <input
                            value={region}
                            disabled={scope === "national"}
                            onChange={(e) => setRegion(e.target.value)}
                            placeholder={
                              scope === "national"
                                ? "N/A for national"
                                : "e.g. Haarlemmermeer"
                            }
                          />
                        </label>
                      </div>
                    ) : null}

                    <form
                      className="form-stack curad-gov"
                      onSubmit={(e: FormEvent) => e.preventDefault()}
                    >
                      <label>
                        Reason (required for Adjust / Dissent)
                        <textarea
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="Why does this change trust in the list?"
                        />
                      </label>
                      <div className="row curad-gov-actions">
                        <button
                          className="btn"
                          type="button"
                          disabled={busy || !canInteract}
                          title={
                            !canInteract
                              ? isPending
                                ? "Pending approval"
                                : "Approved CURAD only"
                              : undefined
                          }
                          onClick={() => {
                            setAdjustMode(false);
                            void submit("agree");
                          }}
                        >
                          Agree
                        </button>
                        <button
                          className="btn secondary"
                          type="button"
                          disabled={busy || !canInteract}
                          onClick={() => {
                            if (!adjustMode) {
                              setAdjustMode(true);
                              return;
                            }
                            void submit("adjust");
                          }}
                        >
                          {adjustMode ? "Confirm Adjust" : "Adjust"}
                        </button>
                        <button
                          className="btn danger"
                          type="button"
                          disabled={busy || !canInteract}
                          onClick={() => {
                            setAdjustMode(false);
                            void submit("disagree");
                          }}
                        >
                          Dissent
                        </button>
                      </div>
                      {adjustMode ? (
                        <button
                          type="button"
                          className="btn secondary small"
                          disabled={busy}
                          onClick={() => setAdjustMode(false)}
                        >
                          Cancel Adjust
                        </button>
                      ) : null}
                    </form>

                    <p className="curad-feeds">
                      feeds → your reason calibrates the next Ω run + recomputes
                      coverage.
                      {latestReview ? (
                        <>
                          {" "}
                          {latestReview.fedBackToOmega ? (
                            <span className="curad-feed-tick">
                              fedBackToOmega ✓
                            </span>
                          ) : (
                            <span className="curad-feed-pending">
                              pending feed → Ω
                            </span>
                          )}
                        </>
                      ) : null}
                    </p>

                    {selectedReviews.length > 0 ? (
                      <div className="curad-history">
                        <h4 className="curad-subhead">Your reviews</h4>
                        <ul className="curad-history-list">
                          {selectedReviews.slice(0, 5).map((r) => (
                            <li key={r.id}>
                              <StatusChip
                                label={actionLabel(r.action)}
                                tone={
                                  r.action === "disagree" ? "waiting" : "done"
                                }
                              />
                              <span className="muted">
                                {" "}
                                · {r.humanScore ?? "—"}
                                {r.reason
                                  ? ` · ${r.reason.slice(0, 80)}${r.reason.length > 80 ? "…" : ""}`
                                  : ""}
                              </span>
                              {r.fedBackToOmega ? (
                                <span className="curad-feed-tick"> ✓</span>
                              ) : r.reactsToProducer === "OmegaClaw" ? (
                                <span className="curad-feed-pending">
                                  {" "}
                                  → Ω
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      <footer className="worker-step-footer">
        <Link className="btn secondary" to={`/work/${missionId}/probe`}>
          ← Probe
        </Link>
        <Link className="btn secondary" to={`/work/${missionId}/gaps`}>
          ← Gaps
        </Link>
        <Link
          className={`btn ${trustedCount >= TRUSTED_LIST_UNLOCK ? "" : "secondary"}`}
          to={`/work/${missionId}/extract`}
        >
          {trustedCount >= TRUSTED_LIST_UNLOCK
            ? "Continue to Extract →"
            : `Extract (${trustedCount}/${TRUSTED_LIST_UNLOCK}) →`}
        </Link>
      </footer>
    </div>
  );
}
