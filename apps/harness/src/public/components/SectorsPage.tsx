import React from "react";
import { ArrowLeft, ArrowUpRight, CheckCircle2, Sparkles } from "lucide-react";
import { Language, PageView } from "../types";
import { sectorComparisons } from "../data/mockDatabase";
import { translations } from "../data/translations";
import { LayerGuide } from "./LayerGuide";

interface SectorsPageProps {
  lang: Language;
  onBackToHome: () => void;
  onOpenPartnerModal: () => void;
  onNavigate: (view: PageView) => void;
}

export const SectorsPage: React.FC<SectorsPageProps> = ({
  lang,
  onBackToHome,
  onOpenPartnerModal,
  onNavigate,
}) => {
  const t = translations[lang].sectorsPage;
  const lift = translations[lang].liftSectors;

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

        <LayerGuide lang={lang} current="sectoren" onNavigate={onNavigate} />

        <div className="mb-12 pb-6 border-b border-zinc-200">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-[#C58B3A]/15 text-[#8D5B18] text-xs font-mono font-medium mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t.badge}</span>
          </div>
          <h1 className="font-serif text-3xl sm:text-5xl text-zinc-900 font-normal leading-tight">
            {t.title}
          </h1>
          <p className="text-base sm:text-lg text-zinc-600 font-sans mt-3 max-w-3xl leading-relaxed">
            {t.intro}
          </p>
          <p className="text-sm sm:text-base text-zinc-600 font-sans mt-4 max-w-3xl leading-relaxed">
            {t.bridge}
          </p>
        </div>

        <div className="p-8 rounded-2xl bg-white border border-zinc-200 shadow-xs mb-12 space-y-4">
          <h2 className="font-serif text-2xl text-zinc-900 font-medium">
            {t.qualityTitle}
          </h2>
          <p className="text-sm sm:text-base text-zinc-600 font-sans leading-relaxed">
            {t.qualityP1}
          </p>
          <p className="text-sm sm:text-base text-zinc-600 font-sans leading-relaxed">
            {t.qualityP2}
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white mb-12 shadow-xs">
          <div className="grid grid-cols-1 md:grid-cols-3 bg-zinc-50 border-b border-zinc-200 text-xs font-mono font-semibold text-zinc-600 p-4">
            <div>{lift.colLarge}</div>
            <div>{lift.colSmall}</div>
            <div className="text-[#1E3A2F]">{lift.colH3}</div>
          </div>

          <div className="divide-y divide-zinc-200 text-sm">
            {sectorComparisons.map((item, idx) => (
              <div
                key={idx}
                className="grid grid-cols-1 md:grid-cols-3 p-5 gap-4 hover:bg-[#FBFBFA] transition-colors"
              >
                <div className="text-zinc-500 text-xs sm:text-sm">{item.largeCorp}</div>
                <div className="text-zinc-900 font-medium text-xs sm:text-sm">
                  {item.smallCraftsman}
                </div>
                <div className="text-[#1E3A2F] bg-[#406A56]/5 p-3 rounded-lg border border-[#406A56]/15 text-xs">
                  {item.h3Translation}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          <div className="p-6 rounded-2xl bg-white border border-zinc-200">
            <h3 className="font-serif text-lg font-semibold text-zinc-900 mb-3">
              {t.inTitle}
            </h3>
            <ul className="space-y-2 text-xs sm:text-sm text-zinc-600 font-sans">
              {[t.in1, t.in2, t.in3].map((line) => (
                <li key={line} className="flex items-start space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-[#406A56] shrink-0 mt-0.5" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-zinc-200">
            <h3 className="font-serif text-lg font-semibold text-zinc-900 mb-3">
              {t.outTitle}
            </h3>
            <ul className="space-y-2 text-xs sm:text-sm text-zinc-600 font-sans">
              {[t.out1, t.out2, t.out3].map((line) => (
                <li key={line} className="flex items-start space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-[#C58B3A] shrink-0 mt-0.5" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-[#FBFBFA] border border-zinc-200 mb-12">
          <h3 className="font-serif text-lg font-semibold text-zinc-900 mb-2">
            {t.aiOptionalTitle}
          </h3>
          <p className="text-sm text-zinc-600 font-sans leading-relaxed">
            {t.aiOptionalBody}
          </p>
        </div>

        <div className="p-8 rounded-2xl bg-[#1E3A2F] text-white text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="font-serif text-2xl font-semibold mb-1">{t.ctaTitle}</h3>
            <p className="text-xs sm:text-sm text-zinc-300 font-sans">{t.ctaBody}</p>
          </div>

          <button
            type="button"
            onClick={onOpenPartnerModal}
            className="px-6 py-3 rounded-xl bg-white text-[#1E3A2F] text-sm font-semibold hover:bg-zinc-100 transition-colors shrink-0 shadow-sm inline-flex items-center space-x-2"
          >
            <span>{t.ctaButton}</span>
            <ArrowUpRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
