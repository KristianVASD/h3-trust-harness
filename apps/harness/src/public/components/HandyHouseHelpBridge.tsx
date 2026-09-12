import React from "react";
import { ArrowRight, ArrowUpRight, Home, Scale } from "lucide-react";
import { Language, PageView } from "../types";
import { translations } from "../data/translations";
import { LayerGuide } from "./LayerGuide";

const HHH_URL = "https://handyhousehelp.ai";

interface HandyHouseHelpBridgeProps {
  lang: Language;
  onExploreMatching?: () => void;
  showLayerGuide?: boolean;
  onNavigate?: (view: PageView) => void;
}

export const HandyHouseHelpBridge: React.FC<HandyHouseHelpBridgeProps> = ({
  lang,
  onExploreMatching,
  showLayerGuide = false,
  onNavigate,
}) => {
  const t = translations[lang].hhhBridge;

  return (
    <section id="handyhousehelp" className="public-section">
      <div className="public-page-card px-5 sm:px-8 lg:px-12 py-10 sm:py-14">
        {showLayerGuide && onNavigate ? (
          <LayerGuide
            lang={lang}
            current="handyhousehelp"
            onNavigate={onNavigate}
          />
        ) : null}

        <div className="max-w-3xl mx-auto text-center mb-8">
          <span className="text-xs font-mono uppercase tracking-widest text-[#C45A12] font-semibold">
            {t.badge}
          </span>
          <h2 className="font-serif text-3xl sm:text-4xl text-zinc-900 font-normal mt-2">
            {t.title}
          </h2>
          <p className="text-base sm:text-lg text-zinc-600 mt-3 font-sans leading-relaxed">
            {t.intro}
          </p>
        </div>

        {showLayerGuide ? (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 mb-8 text-sm">
            <span className="px-3 py-1.5 rounded-full bg-[#1E3A2F] text-white font-medium">
              {t.flowH3}
            </span>
            <ArrowRight className="w-4 h-4 text-zinc-400 rotate-90 sm:rotate-0" />
            <span className="px-3 py-1.5 rounded-full bg-[#C45A12] text-white font-medium">
              {t.flowHhh}
            </span>
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
          <div className="p-6 rounded-2xl bg-white border border-zinc-200">
            <Scale className="w-7 h-7 text-[#1E3A2F] mb-3" />
            <h3 className="font-serif text-xl font-semibold text-zinc-900 mb-2">
              {t.weighTitle}
            </h3>
            <p className="text-sm text-zinc-600 leading-relaxed">{t.weighBody}</p>
          </div>
          <div className="p-6 rounded-2xl bg-[#FFF7F0] border border-[#F3D2B3]">
            <Home className="w-7 h-7 text-[#C45A12] mb-3" />
            <h3 className="font-serif text-xl font-semibold text-zinc-900 mb-2">
              {t.connectTitle}
            </h3>
            <p className="text-sm text-zinc-600 leading-relaxed">
              {t.connectBody}
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          {onExploreMatching ? (
            <button
              type="button"
              onClick={onExploreMatching}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1E3A2F] text-white text-sm font-semibold hover:bg-[#162B23]"
            >
              <span>{t.exploreCta}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : null}
          <a
            href={HHH_URL}
            target="_blank"
            rel="noreferrer"
            title={t.siteHint}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-zinc-300 bg-white text-sm font-medium text-zinc-700 hover:border-[#1E3A2F] hover:text-[#1E3A2F]"
          >
            <span>handyhousehelp.ai</span>
            <ArrowUpRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    </section>
  );
};
