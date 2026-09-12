import { Navigate, Route, Routes } from "react-router-dom";
import { HarnessLayout } from "./layouts/HarnessLayout";
import { MissionLayout } from "./layouts/MissionLayout";
import { WorkerLayout } from "./layouts/WorkerLayout";
import { AdminLayout } from "./layouts/AdminLayout";
import { PublicLayout } from "./public/PublicLayout";
import { PublicHomePage } from "./public/pages/PublicHomePage";
import { PublicHowItWorksPage } from "./public/pages/PublicHowItWorksPage";
import { PublicSectorsPage } from "./public/pages/PublicSectorsPage";
import { PublicLocalNetworksPage } from "./public/pages/PublicLocalNetworksPage";
import { PublicHhhPage } from "./public/pages/PublicHhhPage";
import { PublicAboutPage } from "./public/pages/PublicAboutPage";
import { PublicSearchPage } from "./public/pages/PublicSearchPage";
import { ControlLayout } from "./pages/control/ControlLayout";
import { ControlCountriesPage } from "./pages/control/ControlCountriesPage";
import { ControlCountryPage } from "./pages/control/ControlCountryPage";
import { ControlSectorPage } from "./pages/control/ControlSectorPage";
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
import { WorkerClassifyPage } from "./pages/worker/WorkerClassifyPage";
import { WorkerProfilePage } from "./pages/worker/WorkerProfilePage";
import { WorkerCoveragePage } from "./pages/worker/WorkerCoveragePage";
import { WorkerSearchStepPage } from "./pages/worker/WorkerSearchStepPage";
import { WorkerResultsPage } from "./pages/worker/WorkerResultsPage";
import { LoginPage } from "./pages/LoginPage";
import { PublicJoinPage } from "./public/pages/PublicJoinPage";
import { AdminCompaniesPage } from "./pages/AdminCompaniesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { AdminVolunteersPage } from "./pages/AdminVolunteersPage";
import { AdminEnginePage } from "./pages/AdminEnginePage";
import { AdminEngineRunPage } from "./pages/AdminEngineRunPage";

export function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<PublicHomePage />} />
        <Route path="/hoe-het-werkt" element={<PublicHowItWorksPage />} />
        <Route path="/sectoren" element={<PublicSectorsPage />} />
        <Route path="/lokale-netwerken" element={<PublicLocalNetworksPage />} />
        <Route path="/handyhousehelp" element={<PublicHhhPage />} />
        <Route path="/over-h3" element={<PublicAboutPage />} />
        <Route path="/zoeken" element={<PublicSearchPage />} />
        <Route path="/join" element={<PublicJoinPage />} />
        <Route path="/signup" element={<Navigate to="/join" replace />} />
      </Route>

      <Route element={<HarnessLayout />}>
        <Route path="/control" element={<ControlLayout />}>
          <Route index element={<ControlCountriesPage />} />
          <Route path=":country" element={<ControlCountryPage />} />
          <Route path=":country/:tradeId" element={<ControlSectorPage />} />
        </Route>
        <Route path="/search" element={<SingleSearchPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="engine" replace />} />
          <Route path="engine" element={<AdminEnginePage />} />
          <Route path="engine/:runId" element={<AdminEngineRunPage />} />
          <Route path="volunteers" element={<AdminVolunteersPage />} />
          <Route path="companies" element={<AdminCompaniesPage />} />
        </Route>

        <Route path="/work/:missionId" element={<WorkerLayout />}>
          <Route index element={<Navigate to="brief" replace />} />
          <Route path="brief" element={<WorkerBriefPage />} />
          <Route path="gaps" element={<WorkerSourcesPage />} />
          <Route path="probe" element={<WorkerProbePage />} />
          <Route path="align" element={<WorkerCaraPage />} />
          <Route path="extract" element={<WorkerImportPage />} />
          <Route path="classify" element={<WorkerClassifyPage />} />
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
      </Route>
    </Routes>
  );
}
