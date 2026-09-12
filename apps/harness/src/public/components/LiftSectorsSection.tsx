import React from 'react';
import { ArrowUpRight, Bot, Sparkles, Building, Hammer } from 'lucide-react';
import { Language } from '../types';
import { sectorComparisons } from '../data/mockDatabase';
import { translations } from '../data/translations';

interface LiftSectorsSectionProps {
  lang: Language;
  onOpenPartnerModal: () => void;
}

export const LiftSectorsSection: React.FC<LiftSectorsSectionProps> = ({
  lang,
  onOpenPartnerModal,
}) => {
  const t = translations[lang].liftSectors;

  return (
    <section id="sectoren" className="public-section">
      <div className="public-page-card px-5 sm:px-8 lg:px-12 py-10 sm:py-14">
        
        <div className="max-w-3xl mb-12">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-[#C58B3A]/15 text-[#8D5B18] text-xs font-mono font-medium mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t.tag}</span>
          </div>
          <h2 className="font-serif text-3xl sm:text-4xl text-zinc-900 font-normal tracking-tight">
            {t.title}
          </h2>
          <p className="text-base sm:text-lg text-zinc-600 mt-3 font-sans leading-relaxed">
            {t.intro}
          </p>
        </div>

        {/* Comparison Table */}
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white mb-12 shadow-xs">
          <div className="grid grid-cols-1 md:grid-cols-3 bg-zinc-50 border-b border-zinc-200 text-xs font-mono font-semibold text-zinc-600 p-4">
            <div className="flex items-center space-x-1.5 pb-2 md:pb-0">
              <Building className="w-4 h-4 text-zinc-400" />
              <span>{t.colLarge}</span>
            </div>
            <div className="flex items-center space-x-1.5 pb-2 md:pb-0">
              <Hammer className="w-4 h-4 text-[#C58B3A]" />
              <span>{t.colSmall}</span>
            </div>
            <div className="flex items-center space-x-1.5 text-[#1E3A2F]">
              <Sparkles className="w-4 h-4 text-[#1E3A2F]" />
              <span>{t.colH3}</span>
            </div>
          </div>

          <div className="divide-y divide-zinc-200 text-sm">
            {sectorComparisons.map((item, idx) => (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-3 p-4 sm:p-5 gap-3 md:gap-4 hover:bg-[#FBFBFA] transition-colors">
                <div className="text-zinc-500 font-sans text-xs sm:text-sm">
                  <span className="md:hidden font-semibold text-zinc-700 block mb-1">Grootbedrijf: </span>
                  {item.largeCorp}
                </div>
                <div className="text-zinc-900 font-medium font-sans text-xs sm:text-sm">
                  <span className="md:hidden font-semibold text-zinc-700 block mb-1">Kleine vakman: </span>
                  {item.smallCraftsman}
                </div>
                <div className="text-[#1E3A2F] bg-[#406A56]/5 p-2.5 rounded-lg border border-[#406A56]/15 text-xs font-sans">
                  <span className="md:hidden font-semibold text-[#1E3A2F] block mb-1">H3 Oplossing: </span>
                  {item.h3Translation}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Assist Box & Sector Partner CTA */}
        <div className="p-8 rounded-2xl bg-[#FBFBFA] border border-zinc-200 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="flex items-center space-x-2 text-[#1E3A2F]">
              <Bot className="w-5 h-5 text-[#406A56]" />
              <h3 className="font-serif text-xl font-semibold text-zinc-900">
                {t.aiHelpTitle}
              </h3>
            </div>
            <p className="text-sm text-zinc-600 font-sans leading-relaxed">
              {t.aiHelpDesc}
            </p>
          </div>

          <button
            onClick={onOpenPartnerModal}
            className="w-full md:w-auto inline-flex items-center justify-center space-x-2 px-6 py-3.5 rounded-xl bg-[#1E3A2F] text-white font-medium text-sm hover:bg-[#162B23] transition-colors shrink-0 shadow-sm"
          >
            <span>{t.partnerCta}</span>
            <ArrowUpRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </section>
  );
};
