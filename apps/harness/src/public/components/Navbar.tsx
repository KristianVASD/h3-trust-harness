import React from "react";
import { Menu, X } from "lucide-react";
import { translations } from "../data/translations";
import { Language, PageView } from "../types";

interface NavbarProps {
  currentView: PageView;
  lang: Language;
  setLang: (lang: Language) => void;
  onNavigate: (view: PageView) => void;
  onGoToSection: (id: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  lang,
  setLang,
  onNavigate,
  onGoToSection,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const t = translations[lang].nav;

  const closeAnd = (action: () => void) => {
    setMobileMenuOpen(false);
    action();
  };

  const links: { key: string; label: string; active: boolean; onClick: () => void }[] = [
    {
      key: "associations",
      label: t.forAssociations,
      active: currentView === "home",
      onClick: () => onNavigate("home"),
    },
    {
      key: "how",
      label: t.howItWorks,
      active: false,
      onClick: () => onGoToSection("hoe-het-werkt"),
    },
    {
      key: "trades",
      label: t.trades,
      active: currentView === "vakman-worden",
      onClick: () => onNavigate("vakman-worden"),
    },
    {
      key: "sectors",
      label: t.sectors,
      active: currentView === "sectoren",
      onClick: () => onNavigate("sectoren"),
    },
    {
      key: "about",
      label: t.aboutShort,
      active: currentView === "over-h3",
      onClick: () => onNavigate("over-h3"),
    },
  ];

  return (
    <header className="public-chrome">
      <div className="public-chrome-card">
        <div className="flex items-center gap-3 px-4 sm:px-6 h-16">
          <button
            type="button"
            onClick={() => closeAnd(() => onNavigate("home"))}
            className="font-serif text-[1.7rem] font-bold leading-none text-[var(--shell-fg)]"
          >
            H3
          </button>

          <nav
            className="hidden lg:flex flex-1 items-center justify-end gap-5 min-w-0"
            aria-label={lang === "nl" ? "Hoofdmenu" : "Main"}
          >
            {links.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={item.onClick}
                className={`public-nowrap text-[0.95rem] ${
                  item.active
                    ? "text-[var(--shell-fg)] font-bold"
                    : "text-[var(--shell-muted)] hover:text-[var(--shell-fg)]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="ml-auto lg:ml-0 flex items-center gap-2 shrink-0">
            <div className="hidden sm:flex items-center rounded-full border border-[var(--shell-line)] bg-[var(--shell-surface)] p-0.5 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setLang("nl")}
                className={`public-nowrap px-2.5 py-1 rounded-full ${
                  lang === "nl"
                    ? "bg-[var(--shell-accent)] text-[var(--shell-accent-ink)]"
                    : "text-[var(--shell-muted)]"
                }`}
              >
                NL
              </button>
              <button
                type="button"
                onClick={() => setLang("en")}
                className={`public-nowrap px-2.5 py-1 rounded-full ${
                  lang === "en"
                    ? "bg-[var(--shell-accent)] text-[var(--shell-accent-ink)]"
                    : "text-[var(--shell-muted)]"
                }`}
              >
                EN
              </button>
            </div>

            <button
              type="button"
              onClick={() => closeAnd(() => onGoToSection("aanmelden"))}
              className="public-btn public-btn-nav"
            >
              {t.registerAssociation}
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden inline-flex items-center justify-center w-10 h-10 rounded-full border border-[var(--shell-line)] bg-[var(--shell-surface)] text-[var(--shell-fg)]"
              aria-label="Menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen ? (
          <div className="lg:hidden border-t border-[var(--shell-line)] px-4 py-3 space-y-1">
            {links.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => closeAnd(item.onClick)}
                className={`block w-full text-left px-3 py-2.5 rounded-xl text-sm ${
                  item.active
                    ? "bg-[var(--shell-surface)] text-[var(--shell-fg)] font-bold"
                    : "text-[var(--shell-muted)]"
                }`}
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => closeAnd(() => onGoToSection("aanmelden"))}
              className="public-btn public-btn-wide mt-2"
            >
              {t.registerAssociation}
            </button>
            <div className="flex items-center rounded-full border border-[var(--shell-line)] bg-[var(--shell-surface)] p-0.5 text-[11px] font-bold w-fit mt-3">
              <button
                type="button"
                onClick={() => setLang("nl")}
                className={`public-nowrap px-2.5 py-1 rounded-full ${
                  lang === "nl"
                    ? "bg-[var(--shell-accent)] text-[var(--shell-accent-ink)]"
                    : "text-[var(--shell-muted)]"
                }`}
              >
                NL
              </button>
              <button
                type="button"
                onClick={() => setLang("en")}
                className={`public-nowrap px-2.5 py-1 rounded-full ${
                  lang === "en"
                    ? "bg-[var(--shell-accent)] text-[var(--shell-accent-ink)]"
                    : "text-[var(--shell-muted)]"
                }`}
              >
                EN
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
};
