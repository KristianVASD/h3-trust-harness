import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { v4 as uuid } from "uuid";
import { api } from "../../api";
import type { MissionData } from "../../hooks/useMissionData";
import { parseCompanyImport } from "../../lib/parseCompanyImport";
import {
  TRUSTED_LIST_UNLOCK,
  countTrustedLists,
  isTrustedSource,
} from "../../lib/worker";

export function WorkerImportPage() {
  const { missionId = "" } = useParams();
  const { sources, companies, reload } = useOutletContext<MissionData>();

  const trustedSources = useMemo(
    () => sources.filter(isTrustedSource),
    [sources],
  );
  const trustedCount = countTrustedLists(sources);
  const unlocked = trustedCount >= TRUSTED_LIST_UNLOCK;

  const [raw, setRaw] = useState("");
  const [listLabel, setListLabel] = useState("Member list");
  const [sourceId, setSourceId] = useState("");
  const [previewCount, setPreviewCount] = useState(0);
  const [busy, setBusy] = useState(false);
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
          Upload or paste a company list and attach it to a CARA-approved source
          (manual extract until Ω extract wires in Phase 6). Only trusted lists
          count toward trust ratings.
        </p>
      </div>

      {!unlocked ? (
        <div className="empty worker-empty-hero worker-locked">
          <p>
            Extract locked — need {TRUSTED_LIST_UNLOCK} trusted lists (
            {trustedCount} so far).
          </p>
          <p className="muted">
            Approve more sources in Align, then come back to attach CSVs.
          </p>
          <div className="row" style={{ justifyContent: "center", marginTop: "1rem" }}>
            <Link className="btn" to={`/work/${missionId}/align`}>
              ← Back to Align
            </Link>
          </div>
        </div>
      ) : (
        <section className="panel worker-import-panel">
          {error ? <div className="error">{error}</div> : null}
          {doneMsg ? (
            <div className="thesis" style={{ borderColor: "var(--teal)" }}>
              {doneMsg}{" "}
              <Link to={`/work/${missionId}/profile`}>View profiles →</Link>
            </div>
          ) : null}

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
            <button className="btn" type="submit" disabled={busy || !previewCount}>
              {busy
                ? "Importing…"
                : `Extract ${previewCount || ""} candidates`}
            </button>
          </form>
        </section>
      )}

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
