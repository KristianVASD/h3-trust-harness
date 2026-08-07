import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { isBlockingBarrier } from "@h3-trust/schema";
import { v4 as uuid } from "uuid";
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
import { parseCompanyImport } from "../../lib/parseCompanyImport";
import { buildExtractJobPrompt } from "../../lib/omegaJobPrompts";
import {
  TRUSTED_LIST_UNLOCK,
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
  const unlocked = trustedCount >= TRUSTED_LIST_UNLOCK;

  const [raw, setRaw] = useState("");
  const [listLabel, setListLabel] = useState("Member list");
  const [sourceId, setSourceId] = useState("");
  const [previewCount, setPreviewCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [extractBusyId, setExtractBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  useEffect(() => {
    if (
      trustedSources.length &&
      !trustedSources.some((s) => s.id === sourceId)
    ) {
      setSourceId(trustedSources[0]!.id);
    }
  }, [trustedSources, sourceId]);

  function onPasteChange(value: string) {
    setRaw(value);
    setPreviewCount(parseCompanyImport(value).length);
  }

  async function onFile(file: File | null) {
    if (!file) return;
    const text = await file.text();
    onPasteChange(text);
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
      setError("Choose a CARA-trusted source for this list.");
      return;
    }

    setBusy(true);
    try {
      const now = new Date().toISOString();
      for (const row of rows) {
        await api.createInMission(missionId, "companies", {
          id: uuid(),
          missionId,
          producer: "Human" as const,
          name: row.name,
          address: row.address,
          region: row.region,
          sector: row.sector,
          kvk_number: row.kvk_number,
          kvk_gate: "unchecked" as const,
          source_ids: [sourceId],
          list_membership: [listLabel],
          blacklist_flags: [],
          status: "candidate" as const,
          capabilities: [],
          serviceContexts: [],
          differentiators: [],
          servicedElementCodes: [],
          createdAt: now,
          updatedAt: now,
          v: 1,
        });
      }
      setRaw("");
      setPreviewCount(0);
      setDoneMsg(`Imported ${rows.length} companies.`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="worker-step-page">
      <div className="worker-step-intro">
        <h2>Extract</h2>
        <p className="hint">
          Ask Ω to extract from guided trusted sources (barrier-gated), or paste
          a list yourself. Manual rows and barrier fulfilments are dual-labelled
          Human. Offline Job 3 JSON (companies[]) imports as Ω below once ≥1
          list is CURAD-accepted.
        </p>
      </div>

      {showTrustedPack && mission ? (
        <TrustedSourcesPackPanel mission={mission} sources={sources} />
      ) : null}

      {mission ? (
        <OmegaJsonImportPanel
          missionId={missionId}
          job="extract"
          hint="Paste Job 3 companies[] JSON from your agent (built from the CURAD pack above). Import as Ω once ≥1 list is accepted."
          onImported={reload}
          buildPrompt={() =>
            buildExtractJobPrompt({ mission, sources })
          }
        />
      ) : null}

      <MasterlistResolvePanel />

      {error ? <div className="error">{error}</div> : null}
      {doneMsg ? (
        <div className="thesis" style={{ borderColor: "var(--teal)" }}>
          {doneMsg}{" "}
          <Link to={`/work/${missionId}/profile`}>View profiles →</Link>
        </div>
      ) : null}

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
                  {s.accessBarrier ? (
                    <>
                      {" "}
                      <BarrierStatusChip barrier={s.accessBarrier} />
                    </>
                  ) : null}
                  <div style={{ marginTop: "0.35rem" }}>
                    <button
                      type="button"
                      className="btn secondary small"
                      disabled={blocked || extractBusyId != null}
                      title={
                        blocked
                          ? "Fulfil the access barrier first"
                          : "Run gated Ω extract"
                      }
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

      {!unlocked ? (
        <div className="empty worker-empty-hero worker-locked">
          <p>
            Manual extract locked — need {TRUSTED_LIST_UNLOCK} trusted lists (
            {trustedCount} so far).
          </p>
          <p className="muted">
            Approve more sources in Align, then come back to attach CSVs. Ω
            extract above works once a source is accepted + probed.
          </p>
          <div
            className="row"
            style={{ justifyContent: "center", marginTop: "1rem" }}
          >
            <Link className="btn" to={`/work/${missionId}/align`}>
              ← Back to Align
            </Link>
          </div>
        </div>
      ) : (
        <section className="panel worker-import-panel">
          <h3 style={{ marginTop: 0 }}>Manual extract (Human)</h3>
          <form className="form-stack" onSubmit={(e) => void submit(e)}>
            <label>
              CARA-trusted source
              <select
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
                required
              >
                {trustedSources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.category} · w
                    {s.suggestedConfidence ?? s.suggestedWeight ?? "—"}
                  </option>
                ))}
              </select>
            </label>
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
                placeholder={"Painter Co A\nPainter Co B"}
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
                ? "Importing…"
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
                {c.specialism ? (
                  <span className="muted"> · {c.specialism}</span>
                ) : null}
              </li>
            ))}
          </ul>
          {companies.length > 12 ? (
            <p className="muted">…and {companies.length - 12} more</p>
          ) : null}
        </section>
      ) : null}

      <footer className="worker-step-footer">
        <Link className="btn secondary" to={`/work/${missionId}/align`}>
          ← Align
        </Link>
        <Link
          className={`btn ${companies.length ? "" : "secondary"}`}
          to={`/work/${missionId}/profile`}
        >
          Profile →
        </Link>
      </footer>
    </div>
  );
}
