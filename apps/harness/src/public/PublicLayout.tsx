import { useCallback, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { CraftsmanRegisterModal } from "./components/CraftsmanRegisterModal";
import { Footer } from "./components/Footer";
import { HarnessControlModal } from "./components/HarnessControlModal";
import { Navbar } from "./components/Navbar";
import { PartnerModal } from "./components/PartnerModal";
import { PublicProvider } from "./PublicContext";
import { VIEW_PATH, viewFromPath } from "./routes";
import type { Language, PageView } from "./types";

const LANG_KEY = "h3-public-lang";

function readLang(): Language {
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored === "en" || stored === "nl") return stored;
  } catch {
    /* ignore */
  }
  return "nl";
}

export function PublicLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [lang, setLangState] = useState<Language>(readLang);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [communityDrager, setCommunityDrager] = useState(false);
  const [partnerOpen, setPartnerOpen] = useState(false);
  const [harnessOpen, setHarnessOpen] = useState(false);

  const currentView = viewFromPath(location.pathname);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const navigateView = useCallback(
    (view: PageView) => {
      navigate(VIEW_PATH[view]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [navigate],
  );

  const openRegister = useCallback((asCommunityDrager = false) => {
    setCommunityDrager(asCommunityDrager);
    setRegisterOpen(true);
  }, []);

  const openPartner = useCallback(() => setPartnerOpen(true), []);
  const openHarness = useCallback(() => setHarnessOpen(true), []);

  const value = useMemo(
    () => ({
      lang,
      setLang,
      openRegister,
      openPartner,
      openHarness,
      navigateView,
    }),
    [lang, setLang, openRegister, openPartner, openHarness, navigateView],
  );

  return (
    <PublicProvider value={value}>
      <div className="public-shell min-h-screen flex flex-col bg-[#F4F4F2] text-[#18181B] selection:bg-[#406A56]/20 selection:text-[#1E3A2F]">
        <Navbar
          currentView={currentView}
          setCurrentView={navigateView}
          lang={lang}
          setLang={setLang}
          onOpenRegisterModal={() => navigateView("vakman-worden")}
          onOpenHarnessModal={openHarness}
        />
        <main className="flex-1 pb-3">
          <Outlet />
        </main>
        <Footer
          lang={lang}
          onNavigate={navigateView}
          onOpenRegisterModal={() => openRegister(false)}
          onOpenHarnessModal={openHarness}
        />
        <CraftsmanRegisterModal
          isOpen={registerOpen}
          onClose={() => setRegisterOpen(false)}
          isCommunityDrager={communityDrager}
          lang={lang}
        />
        <PartnerModal
          isOpen={partnerOpen}
          onClose={() => setPartnerOpen(false)}
          lang={lang}
        />
        <HarnessControlModal
          isOpen={harnessOpen}
          onClose={() => setHarnessOpen(false)}
          lang={lang}
        />
      </div>
    </PublicProvider>
  );
}
