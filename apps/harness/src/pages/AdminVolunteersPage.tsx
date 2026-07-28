import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";

type Volunteer = {
  id: string;
  email: string;
  role: string;
  status: string;
  display_name: string | null;
  preferred_location: string | null;
  created_at: string;
};

export function AdminVolunteersPage() {
  const { isAdmin, loading, session, openMode } = useAuth();
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.listVolunteers();
      setVolunteers(res.volunteers as Volunteer[]);
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
      if (action === "approve") await api.approveVolunteer(id);
      else await api.rejectVolunteer(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="page">
      <h1>CURAD volunteers</h1>
      <p>Approve pending applicants so they can record CARA acts.</p>
      {error && <p className="error">{error}</p>}
      <div className="stack">
        {volunteers.length === 0 && <p className="empty">No volunteers yet.</p>}
        {volunteers.map((v) => (
          <div key={v.id} className="card-row">
            <div>
              <strong>{v.display_name || v.email}</strong>
              <div className="muted">
                {v.email} · {v.status}
                {v.preferred_location ? ` · ${v.preferred_location}` : ""}
              </div>
            </div>
            <div className="row">
              {v.status !== "approved" && (
                <button
                  className="btn small"
                  type="button"
                  disabled={busyId === v.id}
                  onClick={() => void decide(v.id, "approve")}
                >
                  Approve
                </button>
              )}
              {v.status !== "rejected" && (
                <button
                  className="btn secondary small"
                  type="button"
                  disabled={busyId === v.id}
                  onClick={() => void decide(v.id, "reject")}
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
