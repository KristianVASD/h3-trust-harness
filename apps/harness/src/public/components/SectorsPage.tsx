import React from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, BadgeCheck, MapPin, Shield } from "lucide-react";
import { Language } from "../types";
import { translations } from "../data/translations";

interface SectorsPageProps {
  lang: Language;
  onBackToHome: () => void;
  onOpenPartnerModal: () => void;
  onJoin: () => void;
}

export const SectorsPage: React.FC<SectorsPageProps> = ({
  lang,
  onBackToHome,
  onOpenPartnerModal,
  onJoin,
}) => {
  const t = translations[lang].sectorsPage;
  const cards = [
    { icon: BadgeCheck, title: t.card1Title, body: t.card1Desc },
    { icon: MapPin, title: t.card2Title, body: t.card2Desc },
    { icon: Shield, title: t.card3Title, body: t.card3Desc },
  ] as const;

  return (
    <div className="public-section">
      <div className="public-page-card px-5 sm:px-8 lg:px-12 py-8 sm:py-12">
        <button
          type="button"
          onClick={onBackToHome}
          className="inline-flex items-center space-x-1.5 text-xs font-mono text-zinc-500 hover:text-zinc-900 transition-colors mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{lang === "nl" ? "Terug naar homepage" : "Back to homepage"}</span>
        </button>

        <div className="mb-10 pb-6 border-b border-zinc-200">
          <div className="inline-flex items-center px-3 py-1 rounded-full bg-[#C58B3A]/15 text-[#8D5B18] text-xs font-mono font-medium mb-3">
            {t.badge}
          </div>
          <h1 className="font-serif text-3xl sm:text-5xl text-zinc-900 font-normal leading-tight">
            {t.title}
          </h1>
          <p className="text-base sm:text-lg text-zinc-600 font-sans mt-3 max-w-3xl leading-relaxed">
            {t.intro}
          </p>
          <p className="text-sm sm:text-base text-zinc-600 font-sans mt-4 max-w-3xl leading-relaxed">
            {t.money}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {cards.map((card) => (
            <div
              key={card.title}
              className="p-6 rounded-2xl bg-white border border-zinc-200 shadow-2xs"
            >
              <card.icon className="w-8 h-8 text-[#1E3A2F] mb-3" />
              <h3 className="font-serif text-lg font-semibold text-zinc-900 mb-2">
                {card.title}
              </h3>
              <p className="text-sm text-zinc-600 font-sans leading-relaxed">
                {card.body}
              </p>
            </div>
          ))}
        </div>

        <div className="p-8 rounded-2xl bg-white border border-zinc-200 shadow-xs mb-12">
          <h2 className="font-serif text-2xl text-zinc-900 font-medium">
            {t.questionTitle}
          </h2>
          <p className="text-sm sm:text-base text-zinc-600 font-sans mt-3 leading-relaxed max-w-3xl">
            {t.question}
          </p>
        </div>

        <div className="p-8 rounded-2xl bg-[#1E3A2F] text-white text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="font-serif text-2xl font-semibold mb-1">{t.ctaTitle}</h3>
            <p className="text-xs sm:text-sm text-zinc-300 font-sans">{t.ctaBody}</p>
          </div>

          <div className="flex flex-col gap-2 shrink-0 w-full sm:w-auto">
            <button
              type="button"
              onClick={onOpenPartnerModal}
              className="px-6 py-3 rounded-xl bg-white text-[#1E3A2F] text-sm font-semibold hover:bg-zinc-100 transition-colors shadow-sm inline-flex items-center justify-center space-x-2"
            >
              <span>{t.ctaButton}</span>
              <ArrowUpRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onJoin}
              className="px-6 py-2.5 rounded-xl border border-white/40 text-white text-sm font-medium hover:bg-white/10 transition-colors inline-flex items-center justify-center space-x-2"
            >
              <span>{t.joinCta}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <p className="text-[11px] text-white/70 text-center sm:text-right leading-relaxed">
              {t.joinHint}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
