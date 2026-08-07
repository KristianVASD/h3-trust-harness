import { useState, type FormEvent } from "react";
import { api } from "../../api";

/**
 * Paste free-text element names (intake) → masterlist codes via alias index.
 * Unknown / ambiguous → needs_review + proposals (never invents codes).
 */
export function MasterlistResolvePanel() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [rows, setRows] = useState<
    Awaited<ReturnType<typeof api.resolveMasterlist>>["results"]
  >([]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const res = await api.resolveMasterlist({ text });
      setRows(res.results);
      setSummary(
        `${res.matched} matched · ${res.needs_review} needs review · masterlist ${res.version}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Resolve failed");
      setRows([]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" style={{ marginBottom: "1rem" }}>
      <h3 style={{ marginTop: 0 }}>Element intake · masterlist</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Paste names the AI or upload finds (e.g.{" "}
        <code>Remeha Tzerra, Fronius Symo, rookmelder</code>). Maps via aliases —
        no match → needs review, never invents a type.
      </p>
      <form className="form-stack" onSubmit={(e) => void onSubmit(e)}>
        <label>
          Free-text names
          <textarea
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Remeha Tzerra\nFronius Symo\nrookmelder\nbalkon"}
            required
          />
        </label>
        <button type="submit" className="btn" disabled={busy || !text.trim()}>
          {busy ? "Resolving…" : "Resolve against masterlist"}
        </button>
      </form>
      {error ? <p className="error">{error}</p> : null}
      {summary ? <p className="muted">{summary}</p> : null}
      {rows.length > 0 ? (
        <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.1rem" }}>
          {rows.map((r, i) =>
            r.status === "matched" ? (
              <li key={`${r.input}-${i}`}>
                <strong>{r.input}</strong> →{" "}
                <code>{r.code}</code> {r.element.name}{" "}
                <span className="muted">({r.via})</span>
              </li>
            ) : (
              <li key={`${r.input}-${i}`}>
                <strong>{r.input}</strong> →{" "}
                <span style={{ color: "#b45309" }}>needs_review</span>
                {r.proposals.length > 0 ? (
                  <span className="muted">
                    {" "}
                    · propose:{" "}
                    {r.proposals
                      .map((p) => `${p.code} (${p.reason})`)
                      .join(", ")}
                  </span>
                ) : null}
              </li>
            ),
          )}
        </ul>
      ) : null}
    </section>
  );
}
