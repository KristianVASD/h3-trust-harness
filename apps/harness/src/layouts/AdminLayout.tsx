import { Link, NavLink, Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

/**
 * Admin ops hub — Engine (OpenRouter jobs) + volunteer approval.
 */
export function AdminLayout() {
  const { isAdmin, loading, session, openMode } = useAuth();

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

  return (
    <div className="admin-shell">
      <nav className="topnav" aria-label="Admin" style={{ marginBottom: "1rem" }}>
        <NavLink className="topnav-link" to="/admin/engine">
          Engine
        </NavLink>
        <NavLink className="topnav-link" to="/admin/volunteers">
          Volunteers
        </NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
