import React, { useState } from 'react';
import { Layers, Shield, Info } from 'lucide-react';
import { Language } from '../types';
import { trustLadderLevels } from '../data/mockDatabase';
import { translations } from '../data/translations';

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
            <span>{lang === 'nl' ? 'Transparante Niveaus' : 'Transparent Levels'}</span>
          </div>
          <h2 className="font-serif text-3xl sm:text-4xl text-zinc-900 font-normal tracking-tight">
            {t.title}
          </h2>
          <p className="text-base text-zinc-600 mt-2 font-sans">
            {t.subtitle}
          </p>
        </div>

        {/* The 5 Steps */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-8">
          {trustLadderLevels.map((lvl) => {
            const isSelected = activeStep === lvl.step;
            return (
              <button
                key={lvl.step}
                onClick={() => setActiveStep(lvl.step)}
                className={`p-4 rounded-xl text-left transition-all border ${
                  isSelected
                    ? 'bg-white border-[#1E3A2F] shadow-sm ring-1 ring-[#1E3A2F]'
                    : 'bg-white/60 border-zinc-200 hover:bg-white hover:border-zinc-300'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono font-bold text-zinc-400">
                    Niveau 0{lvl.step}
                  </span>
                  {lvl.step === 5 && (
                    <Shield className="w-3.5 h-3.5 text-[#1E3A2F]" />
                  )}
                </div>
                <h4 className="font-serif text-sm font-semibold text-zinc-900 leading-snug mb-1">
                  {lvl.term}
                </h4>
                <p className="text-[11px] font-mono text-zinc-500 truncate">
                  {lvl.internal}
                </p>
              </button>
            );
          })}
        </div>

        {/* Detail Panel of Selected Level */}
        {(() => {
          const current = trustLadderLevels.find((l) => l.step === activeStep) || trustLadderLevels[4];
          return (
            <div className="p-6 sm:p-8 rounded-2xl bg-white border border-zinc-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2 max-w-2xl">
                <div className="flex items-center space-x-3">
                  <span className="w-7 h-7 rounded-full bg-[#1E3A2F] text-white text-xs font-mono font-semibold flex items-center justify-center">
                    {current.step}
                  </span>
                  <h3 className="font-serif text-xl sm:text-2xl text-zinc-900 font-semibold">
                    {current.term}
                  </h3>
                  <span className={`text-xs font-mono px-2.5 py-0.5 rounded-full border ${current.badgeColor}`}>
                    {current.badge}
                  </span>
                </div>

                <p className="text-sm sm:text-base text-zinc-600 font-sans leading-relaxed pt-1">
                  {current.desc}
                </p>

                <div className="flex items-center space-x-2 text-xs font-mono text-zinc-400 pt-2">
                  <span>Datamodel veld:</span>
                  <span className="bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded border border-zinc-200">
                    {current.internal}
                  </span>
                </div>
              </div>

              <div className="bg-[#FBFBFA] p-4 rounded-xl border border-zinc-200 shrink-0 md:w-64 text-xs font-sans text-zinc-600">
                <div className="flex items-center space-x-1.5 font-semibold text-zinc-900 mb-1">
                  <Info className="w-3.5 h-3.5 text-[#C58B3A]" />
                  <span>Geen vage score</span>
                </div>
                <p className="text-[12px] text-zinc-500 leading-normal">
                  H3 geeft geen subjectieve sterren. Wij publiceren alleen verifieerbare feiten en de status op deze ladder.
                </p>
              </div>
            </div>
          );
        })()}

      </div>
    </section>
  );
};
