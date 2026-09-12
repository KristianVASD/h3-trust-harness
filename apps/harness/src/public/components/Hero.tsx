import React from 'react';
import { ArrowDown, CheckCircle2, ArrowRight, HeartHandshake } from 'lucide-react';
import { Language } from '../types';
import { translations } from '../data/translations';

interface HeroProps {
  lang: Language;
  onExploreClick: () => void;
  onScrollToWidget: () => void;
}

export const Hero: React.FC<HeroProps> = ({ lang, onExploreClick, onScrollToWidget }) => {
  const t = translations[lang].hero;

  return (
    <section className="relative public-section overflow-hidden">
      <div className="public-page-card px-5 sm:px-10 lg:px-16 py-12 sm:py-16 lg:py-20 text-center">
        {/* Subtle pill tag */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#F4F4F2] border border-zinc-200/80 mb-6">
          <span className="w-2 h-2 rounded-full bg-[#406A56] animate-pulse shrink-0" />
          <span className="text-xs font-mono font-medium text-zinc-700">
            {lang === 'nl' ? 'Openbaar vertrouwens-harnas · geen advertenties' : 'Open public trust harness · no ad auctions'}
          </span>
        </div>

        {/* Primary Headline */}
        <h1 className="font-serif text-3xl sm:text-5xl lg:text-[3.4rem] font-normal text-zinc-900 leading-[1.2] mb-6 max-w-4xl mx-auto">
          {t.headline}
        </h1>

        {/* Subhead */}
        <p className="text-lg sm:text-xl text-zinc-600 max-w-3xl mx-auto font-sans leading-relaxed mb-10">
          {t.subhead}
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mb-10">
          <button
            onClick={onExploreClick}
            className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-6 py-3.5 rounded-xl bg-[#1E3A2F] text-white font-medium text-base hover:bg-[#162B23] transition-all shadow-sm hover:shadow active:scale-[0.99]"
          >
            <span>{t.ctaPrimary}</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            onClick={onScrollToWidget}
            className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-6 py-3.5 rounded-xl bg-white border border-zinc-300 text-zinc-800 font-medium text-base hover:border-[#1E3A2F] hover:bg-zinc-50 transition-all active:scale-[0.99]"
          >
            <span>{t.ctaSecondary}</span>
            <ArrowDown className="w-4 h-4 text-zinc-500" />
          </button>
        </div>

        {/* Honest Trust-Bar under Hero */}
        <div className="border-t border-zinc-200/80 pt-6">
          <p className="text-xs font-mono uppercase tracking-wider text-zinc-400 mb-4">
            {lang === 'nl' ? 'Grondslagen van H3' : 'Core foundations of H3'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 max-w-4xl mx-auto">
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#FBFBFA] border border-zinc-200 text-xs font-medium text-zinc-800 text-left">
              <CheckCircle2 className="w-4 h-4 text-[#406A56] shrink-0" />
              <span>{t.trustBar.kvk}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#FBFBFA] border border-zinc-200 text-xs font-medium text-zinc-800 text-left">
              <CheckCircle2 className="w-4 h-4 text-[#406A56] shrink-0" />
              <span>{t.trustBar.sources}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#FBFBFA] border border-zinc-200 text-xs font-medium text-zinc-800 text-left">
              <CheckCircle2 className="w-4 h-4 text-[#C58B3A] shrink-0" />
              <span>{t.trustBar.cara}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#FBFBFA] border border-zinc-200 text-xs font-medium text-zinc-800 text-left">
              <HeartHandshake className="w-4 h-4 text-[#1E3A2F] shrink-0" />
              <span>{t.trustBar.bgi}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
