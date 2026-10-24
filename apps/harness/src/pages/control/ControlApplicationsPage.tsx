import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { api } from "../../api";
import { useAuth } from "../../auth/AuthContext";

type InterestApplication = {
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
  shareManagedCompanyData?: boolean;
  welcomeHhhLocally?: boolean;
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

export function ControlApplicationsPage() {
  const { isAdmin, loading, session, openMode } = useAuth();
  const [rows, setRows] = useState<InterestApplication[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.listInterestApplications(200);
      setRows(res.applications);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load applications");
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  if (loading) return <div>Loading…</div>;
  if (!session && !openMode) return <Navigate to="/login" replace />;
  if (!isAdmin) {
    return (
      <div>
        <p className="control-crumb">
          <Link to="/control">← Mission Control</Link>
        </p>
        <h1>Aanmeldingen</h1>
        <p className="muted">Admin only.</p>
      </div>
    );
  }

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

  return (
    <div>
      <p className="control-crumb">
        <Link to="/control">← Mission Control</Link>
      </p>
      <header className="control-hero">
        <p className="control-eyebrow">Mission Control</p>
        <h1>Aanmeldingen</h1>
        <p className="muted">
          Verenigingen en vakbedrijven die via de publieke site een kennismaking
          vroegen. Neem contact op en markeer daarna de status.
        </p>
      </header>

      {error && <p className="error">{error}</p>}

      <div className="stack">
        {rows.length === 0 && (
          <p className="empty">Nog geen aanmeldingen.</p>
        )}
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
    </div>
  );
}
