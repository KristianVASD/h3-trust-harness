import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { isBlockingBarrier } from "@h3-trust/schema";
import { api } from "../../api";
import { ProducerBadge } from "../../components/Badges";
import {
  BarrierCard,
  BarrierStatusChip,
} from "../../components/worker/BarrierCard";
import { OmegaJsonImportPanel } from "../../components/worker/OmegaJsonImportPanel";
import { MasterlistResolvePanel } from "../../components/worker/MasterlistResolvePanel";
import { TrustedSourcesPackPanel } from "../../components/worker/TrustedSourcesPackPanel";
import { useAuth } from "../../auth/AuthContext";
import type { MissionData } from "../../hooks/useMissionData";
import { importCompanyRowsInChunks } from "../../lib/importCompanyRows";
import { parseCompanyImport } from "../../lib/parseCompanyImport";
import { buildExtractJobPrompt } from "../../lib/omegaJobPrompts";
import {
  countTrustedLists,
  isTrustedSource,
} from "../../lib/worker";

export function WorkerImportPage() {
  const { missionId = "" } = useParams();
  const { mission, sources, companies, reload } = useOutletContext<MissionData>();
  const { isAdmin, openMode } = useAuth();
  /** Pre-Ω manual pack — admin on deployed auth; always in local open mode. */
  const showTrustedPack = isAdmin || openMode;

  const trustedSources = useMemo(
    () => sources.filter(isTrustedSource),
    [sources],
  );
  const guidedTrusted = useMemo(
    () => trustedSources.filter((s) => s.extractionGuide != null),
    [trustedSources],
  );
  const blockedSources = useMemo(
    () =>
      trustedSources.filter(
        (s) => s.accessBarrier && isBlockingBarrier(s.accessBarrier),
      ),
    [trustedSources],
  );
  const trustedCount = countTrustedLists(sources);
  const unlocked = sources.length >= 1;
  const importSources = useMemo(
    () => (trustedSources.length ? trustedSources : sources),
    [trustedSources, sources],
  );

  const [raw, setRaw] = useState("");
  const [listLabel, setListLabel] = useState("Member list");
  const [sourceId, setSourceId] = useState("");
  const [previewCount, setPreviewCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  const [extractBusyId, setExtractBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  useEffect(() => {
    if (
      importSources.length &&
      !importSources.some((s) => s.id === sourceId)
    ) {
      setSourceId(importSources[0]!.id);
    }
  }, [importSources, sourceId]);

  function onPasteChange(value: string) {
    setRaw(value);
    setPreviewCount(parseCompanyImport(value).length);
  }

  async function onFile(file: File | null) {
    if (!file) return;
    const text = await file.text();
    onPasteChange(text);
  }

  async function acceptAsImported(sid: string) {
    const source = sources.find((s) => s.id === sid);
    if (!source) return;
    setError(null);
    setDoneMsg(null);
    try {
      await api.updateEntity("sources", {
        ...source,
        status: "accepted",
        producer: "ImportedDataset",
        notes: [source.notes, "Accepted as imported dataset — Align later."]
          .filter(Boolean)
          .join(" · "),
        updatedAt: new Date().toISOString(),
      });
      setDoneMsg(
        `“${source.name}” accepted as imported dataset. Paste the CSV below.`,
      );
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept list");
    }
  }

  async function askOmegaExtract(sid: string) {
    setExtractBusyId(sid);
    setError(null);
    setDoneMsg(null);
    try {
      const result = await api.extractSource(missionId, sid);
      if (result.blocked.length) {
        setError(
          `Blocked: ${result.blocked.map((b) => b.what_human_does).join(" · ")}`,
        );
      } else {
        setDoneMsg(
          `Ω extracted ${result.created.length} compan${result.created.length === 1 ? "y" : "ies"}.`,
        );
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extract failed");
    } finally {
      setExtractBusyId(null);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!unlocked) return;
    setError(null);
    setDoneMsg(null);

    const rows = parseCompanyImport(raw);
    if (!rows.length) {
      setError("Nothing to import — paste names or CSV first.");
      return;
    }
    if (!sourceId) {
      setError("Choose a source for this list.");
      return;
    }

    const selectedSource = sources.find((s) => s.id === sourceId);
    if (
      selectedSource &&
      selectedSource.status !== "accepted" &&
      selectedSource.status !== "adjusted"
    ) {
      await acceptAsImported(sourceId);
    }

    setBusy(true);
    setImportProgress({ completed: 0, total: rows.length });
    let completed = 0;
    try {
      const result = await importCompanyRowsInChunks({
        missionId,
        sourceId,
        listLabel,
        rows,
        onProgress: (nextCompleted, total) => {
          completed = nextCompleted;
          setImportProgress({ completed: nextCompleted, total });
        },
      });
      setRaw("");
      setPreviewCount(0);
      const parts = [
        result.created ? `${result.created} created` : null,
        result.updated ? `${result.updated} updated (merged sources)` : null,
        result.skipped ? `${result.skipped} skipped` : null,
      ].filter(Boolean);
      setDoneMsg(
        parts.length
          ? `Imported: ${parts.join(", ")}.`
          : `Import finished with no changes.`,
      );
      await reload();
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Import failed";
      setError(
        `Import stopped after ${completed}/${rows.length} rows. Re-running the same file is safe. ${detail}`,
      );
      await reload();
    } finally {
      setBusy(false);
      setImportProgress(null);
    }
  }

  return (
    <div className="worker-step-page">
      <div className="worker-step-intro">
        <h2>Extract</h2>
        <p className="hint">
          Paste or upload a source list. CSV <code>services</code> become Can
          chips. Align is optional — mark a candidate list as an imported
          dataset if it is not CURAD-accepted yet.
        </p>
      </div>

      <details className="worker-advanced">
        <summary>Advanced · Ω extract, Job 3 pack, masterlist</summary>
        {showTrustedPack && mission ? (
          <TrustedSourcesPackPanel mission={mission} sources={sources} />
        ) : null}

        {mission ? (
          <OmegaJsonImportPanel
            missionId={missionId}
            job="extract"
            hint="Paste Job 3 companies[] JSON from your agent. Import as Ω once ≥1 list is accepted."
            onImported={reload}
            buildPrompt={() =>
              buildExtractJobPrompt({ mission, sources })
            }
          />
        ) : null}

        <MasterlistResolvePanel />

        {blockedSources.length > 0 ? (
          <section className="panel" style={{ marginBottom: "1rem" }}>
            <h3 style={{ marginTop: 0 }}>
              Barriers ({blockedSources.length}) — fulfil before Ω extract
            </h3>
            {blockedSources.map((s) => (
              <div key={s.id} style={{ marginBottom: "1rem" }}>
                <p style={{ margin: "0 0 0.5rem" }}>
                  <strong>{s.name}</strong>{" "}
                  {s.accessBarrier ? (
                    <BarrierStatusChip barrier={s.accessBarrier} />
                  ) : null}
                </p>
                <BarrierCard
                  missionId={missionId}
                  source={s}
                  onDone={reload}
                />
              </div>
            ))}
          </section>
        ) : null}

        {guidedTrusted.length > 0 ? (
          <section className="panel" style={{ marginBottom: "1rem" }}>
            <h3 style={{ marginTop: 0 }}>Ask Ω Extract</h3>
            <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
              {guidedTrusted.map((s) => {
                const blocked =
                  s.accessBarrier != null && isBlockingBarrier(s.accessBarrier);
                const rowBusy = extractBusyId === s.id;
                return (
                  <li key={s.id} style={{ marginBottom: "0.6rem" }}>
                    <strong>{s.name}</strong>{" "}
                    <span className="muted">
                      · {s.extractionGuide?.listPattern} ·{" "}
                      {s.extractionGuide?.fields.length ?? 0} fields
                    </span>
                    <div style={{ marginTop: "0.35rem" }}>
                      <button
                        type="button"
                        className="btn secondary small"
                        disabled={blocked || extractBusyId != null}
                        onClick={() => void askOmegaExtract(s.id)}
                      >
                        {rowBusy
                          ? "Extracting…"
                          : blocked
                            ? "Blocked"
                            : "Ask Ω Extract"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </details>

      {error ? <div className="error">{error}</div> : null}
      {doneMsg ? (
        <div className="thesis" style={{ borderColor: "var(--teal)" }}>
          {doneMsg}{" "}
          <Link to={`/work/${missionId}/search`}>Preview search →</Link>
        </div>
      ) : null}

      {!unlocked ? (
        <div className="empty worker-empty-hero worker-locked">
          <p>No source on this job yet.</p>
          <p className="muted">
            Add a list on Gaps, or onboard a CSV pack from Mission Control.
          </p>
          <div
            className="row"
            style={{ justifyContent: "center", marginTop: "1rem", gap: "0.5rem" }}
          >
            <Link className="btn" to={`/work/${missionId}/gaps`}>
              ← Gaps
            </Link>
            <Link className="btn secondary" to="/control">
              Mission Control
            </Link>
          </div>
        </div>
      ) : (
        <section className="panel worker-import-panel">
          <h3 style={{ marginTop: 0 }}>Import CSV</h3>
          {trustedCount === 0 ? (
            <p className="muted" style={{ marginTop: 0 }}>
              This list is not CURAD-accepted yet. Import will mark it as an
              imported dataset (Align later).
            </p>
          ) : null}
          <form className="form-stack" onSubmit={(e) => void submit(e)}>
            <label>
              Source list
              <select
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
                required
              >
                {importSources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.category} · {s.status}
                  </option>
                ))}
              </select>
            </label>
            {sourceId &&
            sources.find((s) => s.id === sourceId) &&
            !isTrustedSource(sources.find((s) => s.id === sourceId)!) ? (
              <button
                type="button"
                className="btn secondary small"
                onClick={() => void acceptAsImported(sourceId)}
              >
                Accept as imported list (skip Align)
              </button>
            ) : null}
            <label>
              List membership label
              <input
                value={listLabel}
                onChange={(e) => setListLabel(e.target.value)}
                required
              />
            </label>
            <label>
              Paste list / CSV
              <textarea
                value={raw}
                onChange={(e) => onPasteChange(e.target.value)}
                placeholder={
                  'title,address,postal_code,city,website,services,tel,mailto\n"Painter Co","Street 1","2131 AE","Hoofddorp",www.example.nl,"Schilderen","tel:06 123","mailto:info@example.nl"'
                }
                style={{ minHeight: "8rem" }}
              />
            </label>
            <label>
              Or upload .csv / .txt
              <input
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <p className="muted">
              Preview: {previewCount} companies · mission already has{" "}
              {companies.length}
            </p>
            <button
              className="btn"
              type="submit"
              disabled={busy || !previewCount}
            >
              {busy
                ? `Importing ${importProgress?.completed ?? 0}/${importProgress?.total ?? previewCount}…`
                : `Extract ${previewCount || ""} candidates`}
            </button>
          </form>
        </section>
      )}

      {companies.length > 0 ? (
        <section className="panel" style={{ marginTop: "1rem" }}>
          <h3 style={{ marginTop: 0 }}>Companies in mission</h3>
          <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
            {companies.slice(0, 12).map((c) => (
              <li key={c.id} style={{ marginBottom: "0.35rem" }}>
                <strong>{c.name}</strong>{" "}
                <ProducerBadge producer={c.producer} />
                {c.region ? (
                  <span className="muted"> · {c.region}</span>
                ) : null}
                {c.specialism ? (
                  <span className="muted"> · {c.specialism}</span>
                ) : null}
                {c.phone ? <span className="muted"> · {c.phone}</span> : null}
                {c.email ? <span className="muted"> · {c.email}</span> : null}
              </li>
            ))}
          </ul>
          {companies.length > 12 ? (
            <p className="muted">…and {companies.length - 12} more</p>
          ) : null}
        </section>
      ) : null}

      <footer className="worker-step-footer">
        <Link className="btn secondary" to={`/work/${missionId}/gaps`}>
          ← Gaps
        </Link>
        <Link
          className={`btn ${companies.length ? "" : "secondary"}`}
          to={`/work/${missionId}/search`}
        >
          Search →
        </Link>
      </footer>
    </div>
  );
}
