import { useState, type FormEvent } from "react";
import {
  isBlockingBarrier,
  type AccessBarrier,
  type BarrierFulfillment,
  type Source,
} from "@h3-trust/schema";
import { api } from "../../api";
import { ProducerBadge } from "../Badges";

type ManualRow = {
  name: string;
  kvk_number: string;
  address: string;
  specialism: string;
};

const EMPTY_ROW: ManualRow = {
  name: "",
  kvk_number: "",
  address: "",
  specialism: "",
};

type FulfillKind = BarrierFulfillment["kind"];

/**
 * Dual-labelled "Hey Human" surface for an Ω-raised access barrier.
 * Fulfil creates Human-produced rows when kind=manual-rows.
 */
export function BarrierCard({
  missionId,
  source,
  onDone,
}: {
  missionId: string;
  source: Source;
  onDone?: () => void | Promise<void>;
}) {
  const barrier = source.accessBarrier;
  if (!barrier) return null;

  return (
    <BarrierCardInner
      missionId={missionId}
      source={source}
      barrier={barrier}
      onDone={onDone}
    />
  );
}

function BarrierCardInner({
  missionId,
  source,
  barrier,
  onDone,
}: {
  missionId: string;
  source: Source;
  barrier: AccessBarrier;
  onDone?: () => void | Promise<void>;
}) {
  const blocking = isBlockingBarrier(barrier);
  const [kind, setKind] = useState<FulfillKind>("manual-rows");
  const [apiKeyRef, setApiKeyRef] = useState("");
  const [filePath, setFilePath] = useState("");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<ManualRow[]>([{ ...EMPTY_ROW }]);
  const [declineReason, setDeclineReason] = useState("");
  const [showDecline, setShowDecline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  async function fulfill(e: FormEvent) {
    e.preventDefault();
    if (!blocking) return;
    setBusy(true);
    setError(null);
    setDoneMsg(null);
    try {
      const fulfillment = buildFulfillment(kind, {
        apiKeyRef,
        filePath,
        note,
        rows,
      });
      const result = await api.fulfillBarrier(
        missionId,
        source.id,
        barrier.id,
        fulfillment,
      );
      const n = result.createdCompanyIds.length;
      setDoneMsg(
        n > 0
          ? `Fulfilled — ${n} Human-produced compan${n === 1 ? "y" : "ies"} added.`
          : "Barrier fulfilled — source unlocked for extract.",
      );
      await onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fulfill failed");
    } finally {
      setBusy(false);
    }
  }

  async function decline() {
    if (!blocking) return;
    const reason = declineReason.trim();
    if (!reason) {
      setError("Decline requires a reason (dissent preservation).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.declineBarrier(missionId, source.id, barrier.id, {
        reason,
        by: "curator",
      });
      setDoneMsg("Barrier declined.");
      await onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Decline failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`worker-barrier-card ${blocking ? "is-blocking" : "is-resolved"}`}
    >
      <div className="worker-barrier-card-grid">
        <div>
          <p className="worker-barrier-label">
            <ProducerBadge producer="OmegaClaw" /> raised
          </p>
          <p style={{ margin: "0.35rem 0" }}>{barrier.what_omega_needs}</p>
          <div className="row" style={{ gap: "0.4rem", flexWrap: "wrap" }}>
            <span className="chip">{barrier.kind}</span>
            <span className="chip">{barrier.severity}</span>
            {barrier.free_tier_available ? (
              <span className="chip" title="Free tier available">
                free tier
              </span>
            ) : null}
            {barrier.estimated_effort ? (
              <span className="muted" style={{ fontSize: "0.8rem" }}>
                ~{barrier.estimated_effort}
              </span>
            ) : null}
          </div>
        </div>
        <div>
          <p className="worker-barrier-label">
            <ProducerBadge producer="Human" /> does
          </p>
          <p style={{ margin: "0.35rem 0" }}>{barrier.what_human_does}</p>
          <p className="muted" style={{ fontSize: "0.8rem", margin: 0 }}>
            Status: <code>{barrier.status}</code>
            {barrier.fulfillment?.by
              ? ` · by ${barrier.fulfillment.by}`
              : ""}
          </p>
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}
      {doneMsg ? (
        <div className="thesis" style={{ borderColor: "var(--teal)" }}>
          {doneMsg}
        </div>
      ) : null}

      {blocking && !doneMsg ? (
        <form className="form-stack" onSubmit={(e) => void fulfill(e)}>
          <label>
            Fulfil how
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as FulfillKind)}
            >
              <option value="manual-rows">Paste company rows (Human)</option>
              <option value="api-key">API key reference</option>
              <option value="file-path">File path</option>
              <option value="note">Note only</option>
            </select>
          </label>

          {kind === "api-key" ? (
            <label>
              Key reference (we store a reference, never the secret)
              <input
                value={apiKeyRef}
                onChange={(e) => setApiKeyRef(e.target.value)}
                placeholder="env:KVK_LOOKUP_KEY"
                required
              />
            </label>
          ) : null}

          {kind === "file-path" ? (
            <label>
              File path
              <input
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                placeholder="writable/imports/kvk-slice.csv"
                required
              />
            </label>
          ) : null}

          {kind === "note" ? (
            <label>
              Note
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                required
              />
            </label>
          ) : null}

          {kind === "manual-rows" ? (
            <div className="worker-barrier-rows">
              <p className="muted" style={{ margin: "0 0 0.35rem" }}>
                Manual rows become Human-produced companies on this source.
              </p>
              {rows.map((row, i) => (
                <div key={i} className="worker-barrier-row">
                  <input
                    placeholder="Name *"
                    value={row.name}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r, j) =>
                          j === i ? { ...r, name: e.target.value } : r,
                        ),
                      )
                    }
                    required
                  />
                  <input
                    placeholder="KvK"
                    value={row.kvk_number}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r, j) =>
                          j === i ? { ...r, kvk_number: e.target.value } : r,
                        ),
                      )
                    }
                  />
                  <input
                    placeholder="Address"
                    value={row.address}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r, j) =>
                          j === i ? { ...r, address: e.target.value } : r,
                        ),
                      )
                    }
                  />
                  <input
                    placeholder="Specialism"
                    value={row.specialism}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r, j) =>
                          j === i ? { ...r, specialism: e.target.value } : r,
                        ),
                      )
                    }
                  />
                </div>
              ))}
              <button
                type="button"
                className="btn secondary small"
                onClick={() => setRows((prev) => [...prev, { ...EMPTY_ROW }])}
              >
                + Add row
              </button>
            </div>
          ) : null}

          <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Fulfil barrier"}
            </button>
            <button
              type="button"
              className="btn secondary"
              disabled={busy}
              onClick={() => setShowDecline((v) => !v)}
            >
              Decline…
            </button>
          </div>

          {showDecline ? (
            <div className="worker-barrier-decline">
              <label>
                Why decline? (required)
                <textarea
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  placeholder="I'm not going to get this; drop the source."
                />
              </label>
              <button
                type="button"
                className="btn secondary"
                disabled={busy}
                onClick={() => void decline()}
              >
                Confirm decline
              </button>
            </div>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}

/** Compact chip for tables — blocking vs resolved. */
export function BarrierStatusChip({ barrier }: { barrier: AccessBarrier }) {
  const blocking = isBlockingBarrier(barrier);
  return (
    <span
      className={`chip ${blocking ? "worker-barrier-chip-block" : "worker-barrier-chip-ok"}`}
      title={barrier.what_human_does}
    >
      {blocking ? "barrier" : barrier.status}
    </span>
  );
}

function buildFulfillment(
  kind: FulfillKind,
  args: {
    apiKeyRef: string;
    filePath: string;
    note: string;
    rows: ManualRow[];
  },
): BarrierFulfillment {
  const by = "curator";
  if (kind === "api-key") {
    return { kind, api_key_ref: args.apiKeyRef.trim(), by };
  }
  if (kind === "file-path") {
    return { kind, file_path: args.filePath.trim(), by };
  }
  if (kind === "note") {
    return { kind, note: args.note.trim(), by };
  }
  const manual_companies = args.rows
    .filter((r) => r.name.trim())
    .map((r) => ({
      name: r.name.trim(),
      kvk_number: r.kvk_number.trim() || undefined,
      address: r.address.trim() || undefined,
      specialism: r.specialism.trim() || undefined,
    }));
  if (!manual_companies.length) {
    throw new Error("Add at least one company name.");
  }
  return { kind: "manual-rows", manual_companies, by };
}
