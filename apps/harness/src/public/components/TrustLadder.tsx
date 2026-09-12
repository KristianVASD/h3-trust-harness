import React, { useState } from "react";
import { Layers, Shield, Info } from "lucide-react";
import { Language } from "../types";
import { trustLadderLevels } from "../data/mockDatabase";
import { translations } from "../data/translations";

interface TrustLadderProps {
  lang: Language;
}

export const TrustLadder: React.FC<TrustLadderProps> = ({ lang }) => {
  const [activeStep, setActiveStep] = useState(5);
  const t = translations[lang].ladder;

  return (
    <section className="public-section">
      <div className="public-page-card px-5 sm:px-8 lg:px-12 py-10 sm:py-14">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-zinc-200/80 text-zinc-700 text-xs font-mono font-medium mb-3">
            <Layers className="w-3.5 h-3.5 text-[#1E3A2F]" />
            <span>
              {lang === "nl" ? "Transparante niveaus" : "Transparent levels"}
            </span>
          </div>
          <h2 className="font-serif text-3xl sm:text-4xl text-zinc-900 font-normal">
            {t.title}
          </h2>
          <p className="text-base text-zinc-600 mt-2 font-sans">{t.subtitle}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 mb-8">
          {trustLadderLevels.map((lvl) => {
            const isSelected = activeStep === lvl.step;
            return (
              <button
                key={lvl.step}
                type="button"
                onClick={() => setActiveStep(lvl.step)}
                className={`min-w-0 p-4 rounded-xl text-left transition-all border ${
                  isSelected
                    ? "bg-white border-[#1E3A2F] shadow-sm ring-1 ring-[#1E3A2F]"
                    : "bg-white/60 border-zinc-200 hover:bg-white hover:border-zinc-300"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-mono font-bold text-zinc-400">
                    {lang === "nl" ? "Niveau" : "Level"} {lvl.step}
                  </span>
                  {lvl.step === 5 ? (
                    <Shield className="w-3.5 h-3.5 text-[#1E3A2F] shrink-0" />
                  ) : null}
                </div>
                <h4 className="font-serif text-sm font-semibold text-zinc-900 leading-snug">
                  {lvl.term}
                </h4>
              </button>
            );
          })}
        </div>

        {(() => {
          const current =
            trustLadderLevels.find((l) => l.step === activeStep) ||
            trustLadderLevels[4];
          return (
            <div className="p-6 sm:p-8 rounded-2xl bg-white border border-zinc-200 shadow-2xs grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_16rem] gap-6">
              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-7 h-7 rounded-full bg-[#1E3A2F] text-white text-xs font-mono font-semibold flex items-center justify-center shrink-0">
                    {current.step}
                  </span>
                  <h3 className="font-serif text-xl sm:text-2xl text-zinc-900 font-semibold leading-snug">
                    {current.term}
                  </h3>
                  <span
                    className={`text-xs font-mono px-2.5 py-0.5 rounded-full border ${current.badgeColor}`}
                  >
                    {current.badge}
                  </span>
                </div>

                <p className="text-sm sm:text-base text-zinc-600 font-sans leading-relaxed">
                  {current.desc}
                </p>
              </div>

              <div className="bg-[#FBFBFA] p-4 rounded-xl border border-zinc-200 min-w-0">
                <div className="flex items-start gap-1.5 font-semibold text-zinc-900 mb-1">
                  <Info className="w-3.5 h-3.5 text-[#C58B3A] shrink-0 mt-0.5" />
                  <span>{t.noteTitle}</span>
                </div>
                <p className="text-[12px] text-zinc-500 leading-relaxed">
                  {t.noteBody}
                </p>
              </div>
            </div>
          );
        })()}
      </div>
    </section>
  );
};
