import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { PendingBanner } from "../components/PendingBanner";

function AccountNav() {
  const { session, profile, isAdmin, loading, signOut } = useAuth();
  if (loading) return null;
  if (!session) {
    return (
      <>
        <NavLink className="topnav-link" to="/login">
          Sign in
        </NavLink>
        <NavLink className="topnav-link topnav-link--cta" to="/join">
          Join
        </NavLink>
      </>
    );
  }
  return (
    <>
      {isAdmin && (
        <NavLink className="topnav-link" to="/admin">
          Admin
        </NavLink>
      )}
      <NavLink className="topnav-link topnav-link--account" to="/settings">
        {profile?.display_name || profile?.email || "Account"}
      </NavLink>
      <button
        type="button"
        className="topnav-link topnav-link--quiet"
        onClick={() => void signOut()}
      >
        Sign out
      </button>
    </>
  );
}

export function HarnessLayout() {
  const { isPending, openMode, canWrite } = useAuth();

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <NavLink to="/" className="brand">
            H3 Trust <span>Harness</span>
          </NavLink>
          <p className="tagline">
            Local trust — humans investigate today, OmegaClaw tomorrow.
          </p>
        </div>
        <nav className="topnav" aria-label="Primary">
          <NavLink className="topnav-link" to="/" end>
            Home
          </NavLink>
          <NavLink className="topnav-link" to="/control">
            Mission Control
          </NavLink>
          <NavLink className="topnav-link" to="/search">
            Search
          </NavLink>
          <AccountNav />
        </nav>
      </header>

      <PendingBanner show={isPending && !canWrite && !openMode} />
      <Outlet />
    </div>
  );
}
