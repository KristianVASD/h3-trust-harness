import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { useCanInteract } from "../../hooks/useCanInteract";

export function DoorPlaybookForm({
  country,
  tradeId,
  tradeLabel,
  onDone,
}: {
  country: string;
  tradeId: string;
  tradeLabel: string;
  onDone?: () => void;
}) {
  const { canInteract, isPending, needsLogin } = useCanInteract();
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  async function seed(text: string) {
    if (!text.trim()) return;
    if (!canInteract) {
      setError(
        needsLogin
          ? "Sign in as an approved CURAD volunteer to seed this door."
          : isPending
            ? "Awaiting admin approval — you cannot seed yet."
            : "You cannot seed doors with this account.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    setDoneMsg(null);
    try {
      const result = await api.seedControlDoorPlaybook(country, tradeId, {
        text,
      });
      setPaste("");
      setJobId(result.missionId);
      setDoneMsg(
        `${result.createdMission ? "Created pack" : "Updated pack"} · ${result.created} new · ${result.updated} updated · ${result.skipped} skipped (${result.total} rows)`,
      );
      onDone?.();
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Seed failed";
      let message = raw;
      try {
        const parsed = JSON.parse(raw) as { error?: unknown };
        if (typeof parsed.error === "string") message = parsed.error;
      } catch {
        /* keep raw */
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel door-seed" id="seed">
      <p className="control-eyebrow">Start this door</p>
      <h2>Seed {tradeLabel} lists</h2>
      <p className="hint">
        Paste the 12-channel playbook (source names, weights, match keys). This
        creates the national pack and fills Gaps as candidates. It does not
        import companies. Attach a member CSV later.
      </p>
      {error ? <div className="error">{error}</div> : null}
      {doneMsg ? (
        <div className="thesis" style={{ borderColor: "var(--teal)" }}>
          {doneMsg}
          {jobId ? (
            <>
              {" "}
              <Link to={`/work/${jobId}/gaps`}>Open job → Gaps</Link>
            </>
          ) : null}
        </div>
      ) : null}
      <textarea
        value={paste}
        onChange={(e) => setPaste(e.target.value)}
        style={{ minHeight: "8rem" }}
        placeholder="channel,category,source_name,sector_purity,service_context_default,trust_weight,match_keys,notes"
        disabled={!canInteract || busy}
      />
      <p className="hint">
        CSV or JSON. Map each row to a discovery channel (Chamber of commerce,
        Quality marks, …). Re-run is safe: same names update candidates, CARA
        locks stay.
      </p>
      <div className="plan-import-actions">
        <button
          type="button"
          className="btn small"
          disabled={busy || !canInteract || !paste.trim()}
          onClick={() => void seed(paste)}
        >
          {busy ? "Seeding…" : "Seed 12 channels"}
        </button>
        <label className="btn small secondary plan-file-btn">
          Upload CSV / JSON
          <input
            type="file"
            accept="text/csv,application/json,.csv,.json,.txt"
            disabled={busy || !canInteract}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void file.text().then((text) => void seed(text));
            }}
          />
        </label>
      </div>
    </section>
  );
}
