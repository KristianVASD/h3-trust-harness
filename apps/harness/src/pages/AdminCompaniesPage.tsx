import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";

type CompanyAccount = {
  id: string;
  user_id: string;
  company_id: string | null;
  legal_name: string;
  trade: string | null;
  city: string | null;
  kvk_number: string | null;
  kvk_gate: string;
  status: string;
  accept_free_local_connect: boolean;
  accept_local_connection_improve: boolean;
  opt_in_active_work: boolean;
  created_at: string;
};

export function AdminCompaniesPage() {
  const { isAdmin, loading, session, openMode } = useAuth();
  const [accounts, setAccounts] = useState<CompanyAccount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.listCompanyAccounts();
      setAccounts(res.accounts);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  if (loading) return <main className="page">Loading…</main>;
  if (!session && !openMode) return <Navigate to="/login" replace />;
  if (!isAdmin) {
    return (
      <main className="page">
        <h1>Admin</h1>
        <p>Admin only.</p>
        <Link to="/">Home</Link>
      </main>
    );
  }

  async function decide(id: string, action: "approve" | "reject") {
    setBusyId(id);
    try {
      if (action === "approve") await api.approveCompanyAccount(id);
      else await api.rejectCompanyAccount(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="page">
      <h1>Company applications</h1>
      <p>
        Direct-signup companies. Work-send opt-in is required and shown here.
      </p>
      {error && <p className="error">{error}</p>}
      <div className="stack">
        {accounts.length === 0 && <p className="empty">No company applications yet.</p>}
        {accounts.map((row) => (
          <div key={row.id} className="card-row">
            <div>
              <strong>{row.legal_name}</strong>
              <div className="muted">
                {row.trade || "—"} · {row.city || "—"} · {row.status}
                {row.kvk_number ? ` · KvK ${row.kvk_number}` : ""}
              </div>
              <div className="muted">
                free connect: {row.accept_free_local_connect ? "yes" : "no"} ·
                improve: {row.accept_local_connection_improve ? "yes" : "no"} ·
                send work: {row.opt_in_active_work ? "yes" : "no"}
              </div>
            </div>
            <div className="row">
              {row.status !== "approved" && (
                <button
                  className="btn small"
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => void decide(row.id, "approve")}
                >
                  Approve
                </button>
              )}
              {row.status !== "rejected" && (
                <button
                  className="btn secondary small"
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => void decide(row.id, "reject")}
                >
                  Reject
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
