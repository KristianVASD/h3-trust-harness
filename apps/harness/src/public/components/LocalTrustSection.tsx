import React from 'react';
import { HeartHandshake, Bike, Store } from 'lucide-react';
import { Language } from '../types';
import { translations } from '../data/translations';

interface LocalTrustSectionProps {
  lang: Language;
}

export const LocalTrustSection: React.FC<LocalTrustSectionProps> = ({ lang }) => {
  const t = translations[lang].localTrust;

  return (
    <section className="public-section">
      <div className="public-page-card px-5 sm:px-8 lg:px-12 py-10 sm:py-14">
        
        {/* Quote Block */}
        <div className="p-8 sm:p-10 rounded-2xl bg-[#1E3A2F] text-white mb-12 shadow-sm relative overflow-hidden">
          <div className="absolute -right-8 -bottom-8 w-48 h-48 rounded-full bg-[#406A56]/30 blur-2xl pointer-events-none" />
          
          <div className="max-w-3xl">
            <span className="text-xs font-mono tracking-widest text-[#C58B3A] uppercase font-semibold">
              {lang === 'nl' ? 'De Sociale Realiteit' : 'The Social Reality'}
            </span>
            <blockquote className="font-serif text-xl sm:text-2xl font-normal leading-relaxed mt-3 mb-4 text-zinc-100">
              "{t.quote}"
            </blockquote>
            <p className="text-sm text-zinc-300 font-sans leading-relaxed">
              {t.desc}
            </p>
          </div>
        </div>

        {/* 3 Pillars of Local Trust */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl bg-[#FBFBFA] border border-zinc-200">
            <div className="w-10 h-10 rounded-xl bg-white border border-zinc-200 flex items-center justify-center text-[#1E3A2F] mb-4 shadow-2xs">
              <Store className="w-5 h-5 text-[#1E3A2F]" />
            </div>
            <h3 className="font-serif text-lg font-medium text-zinc-900 mb-2">
              {t.card1Title}
            </h3>
            <p className="text-sm text-zinc-600 font-sans leading-relaxed">
              {t.card1Desc}
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#FBFBFA] border border-zinc-200">
            <div className="w-10 h-10 rounded-xl bg-white border border-zinc-200 flex items-center justify-center text-[#C58B3A] mb-4 shadow-2xs">
              <HeartHandshake className="w-5 h-5 text-[#C58B3A]" />
            </div>
            <h3 className="font-serif text-lg font-medium text-zinc-900 mb-2">
              {t.card2Title}
            </h3>
            <p className="text-sm text-zinc-600 font-sans leading-relaxed">
              {t.card2Desc}
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#FBFBFA] border border-zinc-200">
            <div className="w-10 h-10 rounded-xl bg-white border border-zinc-200 flex items-center justify-center text-[#406A56] mb-4 shadow-2xs">
              <Bike className="w-5 h-5 text-[#406A56]" />
            </div>
            <h3 className="font-serif text-lg font-medium text-zinc-900 mb-2">
              {t.card3Title}
            </h3>
            <p className="text-sm text-zinc-600 font-sans leading-relaxed">
              {t.card3Desc}
            </p>
          </div>
        </div>

      </div>
    </section>
  );
};
