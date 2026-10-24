import React from "react";
import { translations } from "../data/translations";
import { Language, PageView } from "../types";

interface FooterProps {
  lang: Language;
  onNavigate: (view: PageView) => void;
  onGoToSection: (id: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ lang, onNavigate, onGoToSection }) => {
  const t = translations[lang];
  const legal = t.legal;

  const links: { label: string; onClick: () => void }[] = [
    { label: t.nav.howItWorks, onClick: () => onGoToSection("hoe-het-werkt") },
    { label: t.nav.sectors, onClick: () => onNavigate("sectoren") },
    { label: t.nav.aboutShort, onClick: () => onNavigate("over-h3") },
    { label: legal.privacy, onClick: () => onNavigate("privacy") },
    { label: legal.cookies, onClick: () => onNavigate("cookies") },
    { label: legal.terms, onClick: () => onNavigate("voorwaarden") },
    { label: legal.correction, onClick: () => onNavigate("gegevens-corrigeren") },
  ];

  return (
    <footer className="public-footer">
      <div className="public-footer-card">
        <nav className="flex flex-wrap gap-x-5 gap-y-2 mb-3" aria-label="Footer">
          {links.map((link) => (
            <button
              key={link.label}
              type="button"
              onClick={link.onClick}
              className="text-[var(--shell-muted)] hover:text-[var(--shell-fg)] text-left"
            >
              {link.label}
            </button>
          ))}
        </nav>
        <p className="m-0">
          © {new Date().getFullYear()} H3 Trust · {t.homeShell.footerLine}
        </p>
      </div>
    </footer>
  );
};
