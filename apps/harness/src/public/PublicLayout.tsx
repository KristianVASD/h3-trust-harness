import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [partnerOpen, setPartnerOpen] = useState(false);
  const [partnerKind, setPartnerKind] = useState("sector");
  const [harnessOpen, setHarnessOpen] = useState(false);

  const currentView = viewFromPath(location.pathname);

  const goToSection = useCallback(
    (id: string) => {
      if (location.pathname === "/") {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
        window.history.replaceState(null, "", `/#${id}`);
        return;
      }
      navigate({ pathname: "/", hash: `#${id}` });
    },
    [location.pathname, navigate],
  );

  useEffect(() => {
    document.title =
      currentView === "home" || currentView === "lokale-netwerken"
        ? lang === "nl"
          ? "H3 — voor ondernemersverenigingen"
          : "H3 — for local associations"
        : currentView === "sectoren"
          ? lang === "nl"
            ? "H3 — voor brancheverenigingen"
            : "H3 — for trade associations"
          : currentView === "vakman-worden"
            ? lang === "nl"
              ? "H3 — voor vakbedrijven"
              : "H3 — for trade businesses"
            : "H3";
  }, [currentView, lang]);

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

  const openRegister = useCallback(() => {
    setRegisterOpen(true);
  }, []);

  const openPartner = useCallback((kind = "sector") => {
    setPartnerKind(kind);
    setPartnerOpen(true);
  }, []);
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
      <div className="public-shell min-h-screen flex flex-col">
        <Navbar
          currentView={currentView}
          lang={lang}
          setLang={setLang}
          onNavigate={navigateView}
          onGoToSection={goToSection}
        />
        <main className="flex-1">
          <Outlet />
        </main>
        <Footer lang={lang} onNavigate={navigateView} onGoToSection={goToSection} />
        <CraftsmanRegisterModal
          isOpen={registerOpen}
          onClose={() => setRegisterOpen(false)}
          lang={lang}
        />
        <PartnerModal
          key={partnerKind}
          isOpen={partnerOpen}
          onClose={() => setPartnerOpen(false)}
          lang={lang}
          initialKind={partnerKind}
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
