import React from "react";
import { GitBranch, HeartHandshake } from "lucide-react";
import { translations } from "../data/translations";
import { Language, PageView } from "../types";

interface FooterProps {
  lang: Language;
  onNavigate: (view: PageView) => void;
  onOpenRegisterModal: () => void;
  onOpenPartnerModal: () => void;
  onOpenHarnessModal: () => void;
  quiet?: boolean;
}

export const Footer: React.FC<FooterProps> = ({
  lang,
  onNavigate,
  onOpenRegisterModal,
  onOpenPartnerModal,
  onOpenHarnessModal,
  quiet = false,
}) => {
  const legal = translations[lang].legal;
  const links: { label: string; onClick?: () => void; href?: string }[] = [
    { label: "Home", onClick: () => onNavigate("home") },
    {
      label: lang === "nl" ? "Hoe het werkt" : "How it works",
      onClick: () => onNavigate("hoe-het-werkt"),
    },
    {
      label: lang === "nl" ? "Sectoren" : "Sectors",
      onClick: () => onNavigate("sectoren"),
    },
    {
      label: lang === "nl" ? "Netwerken" : "Networks",
      onClick: () => onNavigate("lokale-netwerken"),
    },
    {
      label: "HandyHouseHelp",
      onClick: () => onNavigate("handyhousehelp"),
    },
    {
      label: lang === "nl" ? "Zoeken" : "Search",
      onClick: () => onNavigate("zoeken"),
    },
    {
      label: lang === "nl" ? "Over H3" : "About H3",
      onClick: () => onNavigate("over-h3"),
    },
    {
      label: lang === "nl" ? "Vakbedrijf" : "Trade business",
      onClick: onOpenRegisterModal,
    },
    {
      label: lang === "nl" ? "Bronhouder" : "Source holder",
      onClick: onOpenPartnerModal,
    },
  ];

  return (
    <footer className="public-footer">
      <div className="public-footer-card px-5 sm:px-8 lg:px-10 py-8 sm:py-10">
        <div className={`grid grid-cols-1 md:grid-cols-2 ${quiet ? "lg:grid-cols-2" : "lg:grid-cols-[1.2fr_1fr_0.9fr]"} gap-8 lg:gap-12`}>
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#406A56] text-white flex items-center justify-center font-serif font-bold text-sm">
                H3
              </div>
              <span className="font-serif text-lg text-white font-semibold public-nowrap">
                H3
              </span>
            </div>
            <p className="text-sm text-zinc-400 leading-relaxed max-w-sm">
              {lang === "nl"
                ? "Lokaal-aan-lokaal: vakmensen zichtbaar op herkomst, niet op advertentiebudget. Minder kilometers, sterkere buurteconomie. Wij verdienen aan abonnementen van huiseigenaren in HandyHouseHelp — niet aan vakmensen."
                : "Local-to-local: trades visible by provenance, not ad spend. Fewer kilometres, stronger neighborhood economy. We earn from homeowner subscriptions in HandyHouseHelp — not from trades."}
            </p>
            {quiet ? null : (
            <div className="flex flex-col gap-1.5 text-[11px] font-mono text-zinc-500">
              <a
                href="https://bgicommons.org/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-white"
              >
                <HeartHandshake className="w-3.5 h-3.5 text-[#C58B3A]" />
                <span>BGI Commons</span>
              </a>
              <a
                href="https://superintelligence.io/about/"
                target="_blank"
                rel="noreferrer"
                className="text-zinc-500 hover:text-white leading-relaxed"
              >
                {lang === "nl"
                  ? "Onderdeel van The Artificial Superintelligence (ASI) Alliance"
                  : "Part of The Artificial Superintelligence (ASI) Alliance"}
              </a>
            </div>
            )}
          </div>

          <div>
            <p className="font-mono text-[11px] uppercase tracking-wider text-zinc-500 mb-3">
              {lang === "nl" ? "Navigatie" : "Navigate"}
            </p>
            <ul className="grid grid-cols-2 gap-x-8">
              {links.map((link) => (
                <li key={link.label}>
                  {link.href ? (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      className="public-nowrap inline-block py-1.5 text-sm text-zinc-300 hover:text-white"
                    >
                      {link.label}
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={link.onClick}
                      className="public-nowrap py-1.5 text-sm text-zinc-300 hover:text-white transition-colors text-left"
                    >
                      {link.label}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {quiet ? null : (
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wider text-zinc-500 mb-3">
              Open Trust Harness
            </p>
            <p className="text-sm text-zinc-400 leading-relaxed mb-4">
            {lang === "nl"
              ? "Lokale vakmensen zichtbaar op herkomst. H3 Trust verdient er niet aan."
              : "Local trades visible by provenance. H3 Trust does not earn from this."}
            </p>
            <button
              type="button"
              onClick={onOpenHarnessModal}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-zinc-800 text-xs font-mono text-zinc-300 hover:text-white border border-zinc-700"
            >
              <GitBranch className="w-3.5 h-3.5 text-[#C58B3A]" />
              <span>h3-trust-harness</span>
            </button>
          </div>
          )}
        </div>

        <div className="mt-8 pt-5 border-t border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[11px] font-mono text-zinc-500">
          <span>
            © {new Date().getFullYear()} H3 Trust · Open public trust utility
          </span>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <button
              type="button"
              className="hover:text-zinc-300"
              onClick={() => onNavigate("privacy")}
            >
              {legal.privacy}
            </button>
            <button
              type="button"
              className="hover:text-zinc-300"
              onClick={() => onNavigate("cookies")}
            >
              {legal.cookies}
            </button>
            <button
              type="button"
              className="hover:text-zinc-300"
              onClick={() => onNavigate("voorwaarden")}
            >
              {legal.terms}
            </button>
            <button
              type="button"
              className="hover:text-zinc-300"
              onClick={() => onNavigate("gegevens-corrigeren")}
            >
              {legal.correction}
            </button>
            {quiet ? null : (
            <button
              type="button"
              className="hover:text-zinc-300"
              onClick={() => onNavigate("leden-uitnodiging")}
            >
              {legal.memberInvite}
            </button>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
};
