import { useMemo, useState, type FormEvent } from "react";
import { api } from "../../api";

export type OmegaImportJob = "discover" | "probe" | "extract" | "harvest";

type Props = {
  missionId: string;
  job: OmegaImportJob;
  title?: string;
  hint?: string;
  onImported?: () => void | Promise<void>;
  /** Optional "Copy Job N prompt" clipboard builder */
  buildPrompt?: () => string;
};

const JOB_LABEL: Record<OmegaImportJob, string> = {
  discover: "Job 1 · Discover sources",
  probe: "Job 2 · Probe",
  extract: "Job 3 · Extract companies",
  harvest: "Job 4 · Harvest profiles",
};

export function OmegaJsonImportPanel({
  missionId,
  job,
  title,
  hint,
  onImported,
  buildPrompt,
}: Props) {
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);

  const preview = useMemo(() => previewPayload(job, raw), [job, raw]);

  async function onFile(file: File | null) {
    if (!file) return;
    const text = await file.text();
    setRaw(text);
    setError(null);
    setResultMsg(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResultMsg(null);
    try {
      const payload = JSON.parse(raw) as unknown;
      const res = await api.importOmegaJson(missionId, { job, payload });
      const skipN = res.skipped.length;
      setResultMsg(
        `Imported ${res.imported} as Ω` +
          (skipN ? ` · ${skipN} skipped` : "") +
          (res.warnings.length ? ` · ${res.warnings.length} warning(s)` : ""),
      );
      setRaw("");
      await onImported?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  async function copyPrompt() {
    if (!buildPrompt) return;
    try {
      await navigator.clipboard.writeText(buildPrompt());
      setCopyMsg("Prompt copied — paste into Qwen / your agent.");
      setTimeout(() => setCopyMsg(null), 4000);
    } catch {
      setCopyMsg("Clipboard blocked — select text manually from the console.");
    }
  }

  return (
    <section className="panel worker-omega-import" style={{ marginBottom: "1rem" }}>
      <h3 style={{ marginTop: 0 }}>{title ?? `Import Ω JSON · ${JOB_LABEL[job]}`}</h3>
      <p className="hint" style={{ marginTop: 0 }}>
        {hint ??
          "Paste the agent JSON for this step (or upload a .json file). Normalized to the frozen Ω contract and stored with producer OmegaClaw."}
      </p>

      {buildPrompt ? (
        <div className="row" style={{ marginBottom: "0.75rem", gap: "0.5rem" }}>
          <button type="button" className="btn secondary small" onClick={() => void copyPrompt()}>
            Copy Job prompt
          </button>
          {copyMsg ? <span className="muted">{copyMsg}</span> : null}
        </div>
      ) : null}

      <form className="form-stack" onSubmit={(e) => void onSubmit(e)}>
        <label>
          JSON
          <textarea
            rows={8}
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              setError(null);
              setResultMsg(null);
            }}
            placeholder='{ "gaps": [ … ] } or contract-shaped output'
            spellCheck={false}
            style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.85rem" }}
          />
        </label>
        <label>
          Or upload .json
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
          />
        </label>
        {preview ? (
          <p className="muted" style={{ margin: 0 }}>
            Preview: {preview}
          </p>
        ) : null}
        {error ? <div className="error">{error}</div> : null}
        {resultMsg ? (
          <div className="thesis" style={{ borderColor: "var(--teal)" }}>
            {resultMsg}
          </div>
        ) : null}
        <button
          type="submit"
          className="btn"
          disabled={busy || !raw.trim()}
        >
          {busy ? "Importing…" : "Import as Ω"}
        </button>
      </form>
    </section>
  );
}

function previewPayload(job: OmegaImportJob, raw: string): string | null {
  if (!raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return "JSON value";
    const p = parsed as Record<string, unknown>;
    if (job === "discover") {
      if (Array.isArray(p.gaps)) {
        const found = p.gaps.filter(
          (g) =>
            g &&
            typeof g === "object" &&
            (g as { found?: boolean }).found !== false &&
            Array.isArray((g as { sources?: unknown }).sources) &&
            ((g as { sources: unknown[] }).sources?.length ?? 0) > 0,
        ).length;
        return `${p.gaps.length} gap cell(s) · ${found} with sources`;
      }
      if (Array.isArray(p.candidates)) return `${p.candidates.length} candidate(s)`;
      if (Array.isArray(p.discovered_sources)) {
        return `${p.discovered_sources.length} discovered_sources`;
      }
      if (Array.isArray(parsed)) return `${parsed.length} item(s)`;
    }
    if (job === "probe") {
      if (Array.isArray(parsed)) return `${parsed.length} probe(s)`;
      if (Array.isArray(p.probes)) return `${p.probes.length} probe(s)`;
      if (Array.isArray(p.sources)) return `${p.sources.length} source probe(s)`;
      return "1 probe object";
    }
    if (job === "extract") {
      const list = Array.isArray(parsed)
        ? parsed
        : Array.isArray(p.companies)
          ? p.companies
          : null;
      return list ? `${list.length} company row(s)` : null;
    }
    if (job === "harvest") {
      if (Array.isArray(parsed)) return `${parsed.length} profile(s)`;
      if (Array.isArray(p.profiles)) return `${p.profiles.length} profile(s)`;
      return "1 harvest object";
    }
    return "JSON object";
  } catch {
    return "Invalid JSON (fix before import)";
  }
}
