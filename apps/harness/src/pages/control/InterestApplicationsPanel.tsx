import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";

export type InterestApplication = {
  id: string;
  type: "company" | "sector";
  status: "pending" | "contacted" | "closed";
  companyName?: string;
  organization?: string;
  contactName: string;
  email: string;
  trade?: string;
  city?: string;
  notes?: string;
  sourceHolderKind?: string;
  submittedAt: string;
};

function titleFor(row: InterestApplication): string {
  if (row.type === "sector") return row.organization || "Vereniging";
  return row.companyName || "Vakbedrijf";
}

function typeLabel(row: InterestApplication): string {
  if (row.type === "sector") {
    return row.sourceHolderKind === "local_association"
      ? "Lokale vereniging"
      : row.sourceHolderKind === "sector"
        ? "Branche / keurmerk"
        : "Partner";
  }
  return row.trade ? `Vakbedrijf · ${row.trade}` : "Vakbedrijf";
}

type InterestApplicationsPanelProps = {
  enabled: boolean;
  compact?: boolean;
};

export function InterestApplicationsPanel({
  enabled,
  compact = false,
}: InterestApplicationsPanelProps) {
  const [rows, setRows] = useState<InterestApplication[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api.listInterestApplications(200);
      setRows(res.applications);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load applications",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    void load();
  }, [enabled, load]);

  async function setStatus(
    id: string,
    status: InterestApplication["status"],
  ) {
    setBusyId(id);
    try {
      await api.setInterestApplicationStatus(id, status);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  const pending = rows.filter((row) => row.status === "pending").length;

  return (
    <section className="panel control-start">
      <h2>
        Aanmeldingen
        {pending > 0 ? (
          <span className="muted"> · {pending} nieuw</span>
        ) : null}
      </h2>
      {!compact ? (
        <p className="hint">
          Verenigingen en vakbedrijven die via de publieke site een kennismaking
          vroegen.
        </p>
      ) : null}
      {loading ? <p className="muted">Laden…</p> : null}
      {error ? <p className="error">{error}</p> : null}
      <div className="stack">
        {!loading && rows.length === 0 ? (
          <p className="empty">Nog geen aanmeldingen.</p>
        ) : null}
        {rows.map((row) => (
          <div key={row.id} className="card-row">
            <div>
              <strong>{titleFor(row)}</strong>
              <div className="muted">
                {typeLabel(row)}
                {row.city ? ` · ${row.city}` : ""} · {row.status}
              </div>
              <div className="muted">
                {row.contactName} ·{" "}
                <a href={`mailto:${row.email}`}>{row.email}</a>
              </div>
              {row.notes ? <div className="muted">{row.notes}</div> : null}
              <div className="muted">
                {new Date(row.submittedAt).toLocaleString()}
              </div>
            </div>
            <div className="row">
              {row.status !== "contacted" && (
                <button
                  className="btn small"
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => void setStatus(row.id, "contacted")}
                >
                  Contacted
                </button>
              )}
              {row.status !== "closed" && (
                <button
                  className="btn secondary small"
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => void setStatus(row.id, "closed")}
                >
                  Close
                </button>
              )}
              {row.status !== "pending" && (
                <button
                  className="btn secondary small"
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => void setStatus(row.id, "pending")}
                >
                  Reopen
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
