import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { InterestApplicationsPanel } from "./InterestApplicationsPanel";

export function ControlApplicationsPage() {
  const { isAdmin, loading, session, openMode } = useAuth();

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

  return (
    <div>
      <p className="control-crumb">
        <Link to="/control">← Mission Control</Link>
        {" · "}
        <Link to="/control/hhh">HandyHouseHelp</Link>
      </p>
      <header className="control-hero">
        <p className="control-eyebrow">Mission Control</p>
        <h1>Aanmeldingen</h1>
        <p className="muted">
          Verenigingen en vakbedrijven die via de publieke site een kennismaking
          vroegen. Zelfde lijst staat ook bovenaan HandyHouseHelp.
        </p>
      </header>
      <InterestApplicationsPanel enabled={isAdmin} />
    </div>
  );
}
