import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { PendingBanner } from "./components/PendingBanner";
import { MissionLayout } from "./layouts/MissionLayout";
import { WorkerLayout } from "./layouts/WorkerLayout";
import { HomePage } from "./pages/HomePage";
import { MissionControl } from "./pages/MissionControl";
import { SingleSearchPage } from "./pages/SingleSearchPage";
import { WorkspacePage } from "./pages/WorkspacePage";
import { CandidateTriagePage } from "./pages/CandidateTriagePage";
import { CaraReviewPage } from "./pages/CaraReviewPage";
import { SignalsPage } from "./pages/SignalsPage";
import { SituationRoomPage } from "./pages/SituationRoomPage";
import { KnowledgeGraphPage } from "./pages/KnowledgeGraphPage";
import { WorkerBriefPage } from "./pages/worker/WorkerBriefPage";
import { WorkerSourcesPage } from "./pages/worker/WorkerSourcesPage";
import { WorkerProbePage } from "./pages/worker/WorkerProbePage";
import { WorkerCaraPage } from "./pages/worker/WorkerCaraPage";
import { WorkerImportPage } from "./pages/worker/WorkerImportPage";
import { WorkerProfilePage } from "./pages/worker/WorkerProfilePage";
import { WorkerCoveragePage } from "./pages/worker/WorkerCoveragePage";
import { WorkerSearchStepPage } from "./pages/worker/WorkerSearchStepPage";
import { WorkerResultsPage } from "./pages/worker/WorkerResultsPage";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { SettingsPage } from "./pages/SettingsPage";
import { AdminVolunteersPage } from "./pages/AdminVolunteersPage";

function AccountNav() {
  const { session, profile, isAdmin, loading, signOut } = useAuth();
  if (loading) return null;
  if (!session) {
    return (
      <>
        <NavLink className="btn secondary small" to="/login">
          Sign in
        </NavLink>
        <NavLink className="btn small" to="/signup">
          Join CURAD
        </NavLink>
      </>
    );
  }
  return (
    <>
      {isAdmin && (
        <NavLink className="btn secondary small" to="/admin/volunteers">
          Admin
        </NavLink>
      )}
      <NavLink className="btn secondary small" to="/settings">
        {profile?.display_name || profile?.email || "Account"}
      </NavLink>
      <button
        type="button"
        className="btn secondary small"
        onClick={() => void signOut()}
      >
        Sign out
      </button>
    </>
  );
}

export function App() {
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
        <nav className="row">
          <NavLink className="btn secondary small" to="/" end>
            Home
          </NavLink>
          <NavLink className="btn secondary small" to="/control">
            Mission Control
          </NavLink>
          <NavLink className="btn secondary small" to="/search">
            Search
          </NavLink>
          <AccountNav />
        </nav>
      </header>

      <PendingBanner show={isPending && !canWrite && !openMode} />

      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/control" element={<MissionControl />} />
        <Route path="/search" element={<SingleSearchPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/admin/volunteers" element={<AdminVolunteersPage />} />

        <Route path="/work/:missionId" element={<WorkerLayout />}>
          <Route index element={<Navigate to="brief" replace />} />
          <Route path="brief" element={<WorkerBriefPage />} />
          <Route path="gaps" element={<WorkerSourcesPage />} />
          <Route path="probe" element={<WorkerProbePage />} />
          <Route path="align" element={<WorkerCaraPage />} />
          <Route path="extract" element={<WorkerImportPage />} />
          <Route path="profile" element={<WorkerProfilePage />} />
          <Route path="coverage" element={<WorkerCoveragePage />} />
          <Route path="search" element={<WorkerSearchStepPage />} />
          <Route path="ranking" element={<WorkerResultsPage />} />
          <Route path="sources" element={<Navigate to="../gaps" replace />} />
          <Route path="cara" element={<Navigate to="../align" replace />} />
          <Route path="import" element={<Navigate to="../extract" replace />} />
          <Route path="results" element={<Navigate to="../coverage" replace />} />
        </Route>

        <Route path="/missions/:missionId" element={<MissionLayout />}>
          <Route index element={<WorkspacePage />} />
          <Route path="triage" element={<CandidateTriagePage />} />
          <Route path="cara" element={<CaraReviewPage />} />
          <Route path="signals" element={<SignalsPage />} />
          <Route path="situation" element={<SituationRoomPage />} />
          <Route path="graph" element={<KnowledgeGraphPage />} />
        </Route>
      </Routes>
    </div>
  );
}
