import { Fragment, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { isBlockingBarrier } from "@h3-trust/schema";
import { ProducerBadge, StatusChip } from "../../components/Badges";
import { BarrierStatusChip } from "../../components/worker/BarrierCard";
import { SourceProbeDetail } from "../../components/worker/SourceProbeDetail";
import type { MissionData } from "../../hooks/useMissionData";
import { api } from "../../api";

/**
 * Probe step — lists unprobed + probed sources.
 * Phase 4: Probe CTA calls runOcCommand("probe") via the server.
 * Phase 6: barriers raised by stub probe show in detail + table chip.
 */
export function WorkerProbePage() {
  const { missionId = "" } = useParams();
  const { sources, reload } = useOutletContext<MissionData>();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const unprobed = sources.filter((s) => s.probeStatus !== "probed");
  const probed = sources.filter((s) => s.probeStatus === "probed");
  const anyBusy = batchBusy || busyId != null;
  const barrierCount = sources.filter(
    (s) => s.accessBarrier && isBlockingBarrier(s.accessBarrier),
  ).length;

  async function probeOne(sourceId: string) {
    setBusyId(sourceId);
    setError(null);
    try {
      await api.probeSource(missionId, sourceId);
      setExpandedId(sourceId);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Probe failed");
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  async function probeAllUnprobed() {
    if (unprobed.length === 0) return;
    setBatchBusy(true);
    setError(null);
    const failures: string[] = [];
    try {
      for (const s of unprobed) {
        try {
          await api.probeSource(missionId, s.id);
        } catch (err) {
          failures.push(
            `${s.name}: ${err instanceof Error ? err.message : "failed"}`,
          );
        }
      }
      if (failures.length) {
        setError(failures.join(" · "));
      }
      await reload();
    } finally {
      setBatchBusy(false);
    }
  }

  return (
    <div className="worker-step-page">
      <div className="worker-step-intro">
        <h2>Probe</h2>
        <p className="hint">
          Learn each source&apos;s shape before extract — Probe writes richness
          fields + an extraction guide (stub Ω today). Access barriers Ω cannot
          cross are raised here for a human to fulfil.
        </p>
        <p className="muted">
          {unprobed.length} unprobed · {probed.length} probed
          {barrierCount > 0 ? ` · ${barrierCount} barrier(s)` : ""}
        </p>
        {unprobed.length > 1 ? (
          <button
            type="button"
            className="btn secondary small"
            disabled={anyBusy}
            onClick={() => void probeAllUnprobed()}
            style={{ marginTop: "0.5rem" }}
          >
            {batchBusy ? "Probing…" : `Probe all unprobed (${unprobed.length})`}
          </button>
        ) : null}
        {error ? (
          <div className="error" style={{ marginTop: "0.75rem" }}>
            {error}
          </div>
        ) : null}
      </div>

      {sources.length === 0 ? (
        <div className="worker-empty-hero">
          <p>No sources yet. Fill gaps first.</p>
          <Link className="btn" to={`/work/${missionId}/gaps`}>
            ← Gaps
          </Link>
        </div>
      ) : (
        <div className="panel">
          <table className="worker-probe-table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Status</th>
                <th>Probe</th>
                <th>Richness</th>
                <th>Guide</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[...unprobed, ...probed].map((s) => {
                const expanded = expandedId === s.id;
                const rowBusy = busyId === s.id;
                return (
                  <Fragment key={s.id}>
                    <tr className={expanded ? "is-expanded" : undefined}>
                      <td>
                        <strong>{s.name}</strong>
                        <div className="muted" style={{ fontSize: "0.8rem" }}>
                          <ProducerBadge
                            producer={s.producer}
                            status={s.status}
                          />
                          {s.accessBarrier ? (
                            <>
                              {" "}
                              <BarrierStatusChip barrier={s.accessBarrier} />
                            </>
                          ) : null}
                          {s.url ? (
                            <>
                              {" · "}
                              <a
                                className="worker-source-url"
                                href={s.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {s.url.replace(/^https?:\/\//, "").slice(0, 40)}
                              </a>
                            </>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <StatusChip label={s.status} />
                      </td>
                      <td>
                        <code>{s.probeStatus ?? "unprobed"}</code>
                      </td>
                      <td>
                        {s.richness ? (
                          <span className="worker-richness-chip">
                            {s.richness.score}
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                        {s.sourceFields?.length ? (
                          <div className="muted" style={{ fontSize: "0.72rem" }}>
                            {s.sourceFields.slice(0, 4).join(", ")}
                            {s.sourceFields.length > 4 ? "…" : ""}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        {s.extractionGuide ? (
                          <span className="muted">
                            {s.extractionGuide.listPattern}
                            {" · "}
                            {s.extractionGuide.fields.length} fields
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        <div
                          className="row"
                          style={{ gap: "0.35rem", flexWrap: "wrap" }}
                        >
                          {s.probeStatus !== "probed" ? (
                            <button
                              type="button"
                              className="btn secondary small"
                              disabled={anyBusy}
                              onClick={() => void probeOne(s.id)}
                            >
                              {rowBusy ? "Probing…" : "Probe"}
                            </button>
                          ) : (
                            <span className="muted">done</span>
                          )}
                          <button
                            type="button"
                            className="btn secondary small"
                            onClick={() =>
                              setExpandedId(expanded ? null : s.id)
                            }
                          >
                            {expanded ? "Hide" : "Details"}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expanded ? (
                      <tr className="worker-probe-detail-row">
                        <td colSpan={6}>
                          <SourceProbeDetail
                            source={s}
                            missionId={missionId}
                            onBarrierDone={reload}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="worker-step-footer">
        <Link className="btn secondary" to={`/work/${missionId}/gaps`}>
          ← Gaps
        </Link>
        <Link className="btn" to={`/work/${missionId}/align`}>
          CURAD · Align →
        </Link>
      </div>
    </div>
  );
}
