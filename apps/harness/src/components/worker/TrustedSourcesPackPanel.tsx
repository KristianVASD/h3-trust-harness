import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { isBlockingBarrier, type Mission, type Source } from "@h3-trust/schema";
import { StatusChip } from "../Badges";
import { BarrierStatusChip } from "./BarrierCard";
import {
  buildExtractJobPrompt,
  buildExtractWorkingPack,
  trustedSourcesForExtract,
} from "../../lib/omegaJobPrompts";

type Props = {
  mission: Mission;
  sources: Source[];
  /** Compact for Align empty-state; full detail on Extract. */
  compact?: boolean;
};

function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * CURAD-approved sources + manual Job 3 pack (copy prompt / download JSON).
 * Fills the gap after Align: queue empties but workers still need listUrl + guides.
 */
export function TrustedSourcesPackPanel({
  mission,
  sources,
  compact = false,
}: Props) {
  const trusted = useMemo(() => trustedSourcesForExtract(sources), [sources]);
  const [msg, setMsg] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function copyText(text: string, ok: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMsg(ok);
      setTimeout(() => setMsg(null), 4000);
    } catch {
      setMsg("Clipboard blocked — use Download instead.");
      setTimeout(() => setMsg(null), 5000);
    }
  }

  function onCopyPrompt() {
    void copyText(
      buildExtractJobPrompt({ mission, sources }),
      "Job 3 prompt copied — paste into Kimi / Qwen / your agent.",
    );
  }

  function onCopyPackJson() {
    const pack = buildExtractWorkingPack({ mission, sources });
    void copyText(
      JSON.stringify(pack, null, 2),
      "Working-sources pack JSON copied.",
    );
  }

  function onDownloadPack() {
    const pack = buildExtractWorkingPack({ mission, sources });
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(
      `job3-working-sources_${mission.location.replace(/\s+/g, "-")}_${stamp}.json`,
      JSON.stringify(pack, null, 2),
      "application/json",
    );
    setMsg("Downloaded Job 3 working-sources pack.");
    setTimeout(() => setMsg(null), 4000);
  }

  function onDownloadPrompt() {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(
      `job3-extract-prompt_${mission.location.replace(/\s+/g, "-")}_${stamp}.txt`,
      buildExtractJobPrompt({ mission, sources }),
      "text/plain;charset=utf-8",
    );
    setMsg("Downloaded Job 3 prompt (.txt).");
    setTimeout(() => setMsg(null), 4000);
  }

  if (!trusted.length) {
    return (
      <section className="panel trusted-pack-panel" style={{ marginBottom: "1rem" }}>
        <h3 style={{ marginTop: 0 }}>CURAD-approved sources</h3>
        <p className="hint" style={{ marginTop: 0 }}>
          None yet. Agree or Adjust on Align — then this pack lists listUrl,
          extraction guides, and a copy/download Job 3 prompt for offline
          agents.
        </p>
        <Link className="btn secondary small" to={`/work/${mission.id}/align`}>
          ← CURAD · Align
        </Link>
      </section>
    );
  }

  return (
    <section className="panel trusted-pack-panel" style={{ marginBottom: "1rem" }}>
      <h3 style={{ marginTop: 0 }}>
        CURAD-approved sources ({trusted.length})
      </h3>
      <p className="hint" style={{ marginTop: 0 }}>
        Locked lists for Job 3. Copy the extract prompt or download the pack —
        paste results into Import Ω below when companies come back.
      </p>

      <div
        className="row"
        style={{
          marginBottom: "0.75rem",
          gap: "0.5rem",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <button type="button" className="btn small" onClick={onCopyPrompt}>
          Copy Job 3 prompt
        </button>
        <button
          type="button"
          className="btn secondary small"
          onClick={onCopyPackJson}
        >
          Copy pack JSON
        </button>
        <button
          type="button"
          className="btn secondary small"
          onClick={onDownloadPrompt}
        >
          Download prompt
        </button>
        <button
          type="button"
          className="btn secondary small"
          onClick={onDownloadPack}
        >
          Download pack
        </button>
        {msg ? <span className="muted">{msg}</span> : null}
      </div>

      <ul className="trusted-pack-list">
        {trusted.map((s) => {
          const blocked =
            s.accessBarrier != null && isBlockingBarrier(s.accessBarrier);
          const open = !compact && expandedId === s.id;
          const listHref = s.listUrl || s.url;
          return (
            <li key={s.id} className="trusted-pack-item">
              <div className="trusted-pack-item-head">
                <div>
                  <strong>{s.name}</strong>{" "}
                  <StatusChip
                    label={s.status}
                    tone={s.status === "accepted" || s.status === "adjusted" ? "done" : "waiting"}
                  />
                  {s.accessBarrier ? (
                    <>
                      {" "}
                      <BarrierStatusChip barrier={s.accessBarrier} />
                    </>
                  ) : null}
                  <div className="muted" style={{ fontSize: "0.85rem" }}>
                    {s.category} · {s.scope}
                    {s.region ? ` · ${s.region}` : ""}
                    {s.depth ? ` · ${s.depth}` : ""}
                    {s.listRenderType ? ` · ${s.listRenderType}` : ""}
                    {s.extractionGuide
                      ? ` · guide: ${s.extractionGuide.listPattern} (${s.extractionGuide.fields.length} fields)`
                      : " · no extraction guide"}
                    {blocked ? " · blocked for Ω extract" : ""}
                  </div>
                </div>
                <div className="row" style={{ gap: "0.35rem", flexShrink: 0 }}>
                  {listHref ? (
                    <a
                      className="btn secondary small"
                      href={listHref}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open list
                    </a>
                  ) : null}
                  {!compact ? (
                    <button
                      type="button"
                      className="btn secondary small"
                      onClick={() =>
                        setExpandedId((id) => (id === s.id ? null : s.id))
                      }
                    >
                      {open ? "Hide details" : "Details"}
                    </button>
                  ) : null}
                </div>
              </div>
              {open ? (
                <pre className="trusted-pack-detail mono">
                  {JSON.stringify(
                    {
                      id: s.id,
                      name: s.name,
                      status: s.status,
                      url: s.url,
                      listUrl: s.listUrl,
                      filterHints:
                        s.filterHints || s.extractionGuide?.filterHints,
                      sourceFields: s.sourceFields,
                      extractionGuide: s.extractionGuide,
                      sample_companies: s.evidence?.sample_companies,
                      accessBarrier: s.accessBarrier
                        ? {
                            kind: s.accessBarrier.kind,
                            severity: s.accessBarrier.severity,
                            status: s.accessBarrier.status,
                            what_human_does: s.accessBarrier.what_human_does,
                          }
                        : null,
                    },
                    null,
                    2,
                  )}
                </pre>
              ) : null}
            </li>
          );
        })}
      </ul>

      {compact ? (
        <p className="muted" style={{ marginBottom: 0, marginTop: "0.75rem" }}>
          Full details + Import Ω live on{" "}
          <Link to={`/work/${mission.id}/extract`}>Extract →</Link>
        </p>
      ) : null}
    </section>
  );
}
