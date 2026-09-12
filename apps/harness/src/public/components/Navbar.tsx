import React from "react";
import { Shield, Database, Menu, X } from "lucide-react";
import { Language, PageView } from "../types";
import { translations } from "../data/translations";

const BAR_LABEL: Partial<Record<PageView, { nl: string; en: string }>> = {
  home: { nl: "Home", en: "Home" },
  "hoe-het-werkt": { nl: "Hoe het werkt", en: "How it works" },
  sectoren: { nl: "Sectoren", en: "Sectors" },
  "lokale-netwerken": { nl: "Netwerken", en: "Networks" },
  handyhousehelp: { nl: "HandyHouseHelp", en: "HandyHouseHelp" },
  "over-h3": { nl: "Over H3", en: "About H3" },
};

interface NavbarProps {
  currentView: PageView;
  setCurrentView: (view: PageView) => void;
  lang: Language;
  setLang: (lang: Language) => void;
  onOpenRegisterModal: () => void;
  onOpenHarnessModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  setCurrentView,
  lang,
  setLang,
  onOpenRegisterModal,
  onOpenHarnessModal,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const t = translations[lang].nav;

  const navItems: { id: PageView; label: string }[] = [
    { id: "home", label: t.home },
    { id: "hoe-het-werkt", label: t.howItWorks },
    { id: "sectoren", label: t.sectors },
    { id: "lokale-netwerken", label: t.localNetworks },
    { id: "handyhousehelp", label: t.handyHouseHelp },
    { id: "over-h3", label: t.about },
  ];

  const handleNavClick = (view: PageView) => {
    setCurrentView(view);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <header className="public-chrome">
      <div className="public-chrome-card">
        <div className="flex items-center gap-3 px-3 sm:px-5 h-14">
          <button
            type="button"
            onClick={() => handleNavClick("home")}
            className="flex items-center gap-2.5 min-w-0"
          >
            <div className="w-9 h-9 rounded-xl bg-[#1E3A2F] text-white flex items-center justify-center shrink-0">
              <span className="font-serif font-bold text-base">H3</span>
            </div>
            <div className="min-w-0 text-left">
              <div className="flex items-center gap-2">
                <span className="font-serif font-semibold text-[15px] sm:text-base text-zinc-900 public-nowrap">
                  H3 Trust
                </span>
                <span className="hidden sm:inline public-nowrap px-1.5 py-0.5 text-[10px] font-mono rounded bg-[#406A56]/10 text-[#1E3A2F] border border-[#406A56]/20">
                  Beneficial AI
                </span>
              </div>
            </div>
          </button>

          <nav className="hidden xl:flex flex-1 items-center justify-center gap-1 min-w-0">
            {navItems.map((item) => {
              const active = currentView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  className={`public-nowrap px-2.5 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                    active
                      ? "text-[#1E3A2F] bg-[#F4F4F2] font-semibold"
                      : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50"
                  }`}
                >
                  {BAR_LABEL[item.id]?.[lang] ?? item.label}
                </button>
              );
            })}
          </nav>

          <div className="ml-auto xl:ml-0 flex items-center gap-2 shrink-0">
            <div className="hidden sm:flex items-center rounded-full border border-zinc-200 bg-[#FBFBFA] p-0.5 text-[11px] font-medium">
              <button
                type="button"
                onClick={() => setLang("nl")}
                className={`public-nowrap px-2.5 py-1 rounded-full ${
                  lang === "nl"
                    ? "bg-[#1E3A2F] text-white font-semibold"
                    : "text-zinc-500 hover:text-zinc-900"
                }`}
              >
                NL
              </button>
              <button
                type="button"
                onClick={() => setLang("en")}
                className={`public-nowrap px-2.5 py-1 rounded-full ${
                  lang === "en"
                    ? "bg-[#1E3A2F] text-white font-semibold"
                    : "text-zinc-500 hover:text-zinc-900"
                }`}
              >
                EN
              </button>
            </div>

            <button
              type="button"
              onClick={onOpenHarnessModal}
              className="hidden sm:inline-flex items-center justify-center w-9 h-9 rounded-full border border-zinc-200 bg-white text-zinc-700 hover:border-[#1E3A2F] hover:text-[#1E3A2F]"
              title={t.harnessPreview}
            >
              <Database className="w-4 h-4 text-[#C58B3A]" />
            </button>

            <button
              type="button"
              onClick={onOpenRegisterModal}
              className="inline-flex items-center gap-1.5 public-nowrap px-3 h-9 rounded-full bg-[#1E3A2F] text-white text-[13px] font-semibold hover:bg-[#162B23]"
            >
              <Shield className="w-3.5 h-3.5" />
              <span>{t.join}</span>
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="xl:hidden inline-flex items-center justify-center w-9 h-9 rounded-full border border-zinc-200 bg-white text-zinc-700"
              aria-label="Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="xl:hidden border-t border-zinc-100 px-3 py-3 space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`block w-full text-left px-3 py-2.5 rounded-xl text-sm ${
                  currentView === item.id
                    ? "bg-[#F4F4F2] text-[#1E3A2F] font-semibold"
                    : "text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                {item.label}
              </button>
            ))}
            <div className="flex items-center justify-between gap-2 pt-3 mt-1 border-t border-zinc-100">
              <div className="flex items-center rounded-full border border-zinc-200 bg-[#FBFBFA] p-0.5 text-[11px] font-medium">
                <button
                  type="button"
                  onClick={() => setLang("nl")}
                  className={`public-nowrap px-2.5 py-1 rounded-full ${
                    lang === "nl" ? "bg-[#1E3A2F] text-white" : "text-zinc-500"
                  }`}
                >
                  NL
                </button>
                <button
                  type="button"
                  onClick={() => setLang("en")}
                  className={`public-nowrap px-2.5 py-1 rounded-full ${
                    lang === "en" ? "bg-[#1E3A2F] text-white" : "text-zinc-500"
                  }`}
                >
                  EN
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenHarnessModal();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-zinc-200 text-xs text-zinc-700"
              >
                <Database className="w-3.5 h-3.5 text-[#C58B3A]" />
                <span>{t.harnessPreview}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
