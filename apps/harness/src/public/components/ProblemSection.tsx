import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Language } from '../types';
import { translations } from '../data/translations';

interface ProblemSectionProps {
  lang: Language;
}

export const ProblemSection: React.FC<ProblemSectionProps> = ({ lang }) => {
  const t = translations[lang].problem;

  return (
    <section className="public-section">
      <div className="public-page-card px-5 sm:px-8 lg:px-12 py-10 sm:py-14">
        
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-zinc-200/70 text-zinc-700 text-xs font-mono font-medium mb-3">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
            <span>{lang === 'nl' ? 'De Realiteit van Vandaag' : 'Today\'s Reality'}</span>
          </div>
          <h2 className="font-serif text-3xl sm:text-4xl text-zinc-900 font-normal tracking-tight">
            {t.title}
          </h2>
          <p className="text-base text-zinc-600 mt-3 font-sans">
            {t.subtitle}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {t.items.map((item, idx) => (
            <div
              key={idx}
              className="p-6 rounded-2xl bg-white border border-zinc-200/90 shadow-2xs hover:border-zinc-300 transition-colors"
            >
              <div className="flex items-start space-x-3 mb-3">
                <span className="w-6 h-6 rounded-full bg-zinc-100 text-zinc-600 text-xs font-mono font-semibold flex items-center justify-center shrink-0 mt-0.5">
                  0{idx + 1}
                </span>
                <h3 className="font-serif text-lg font-medium text-zinc-900 leading-snug">
                  {item.q}
                </h3>
              </div>
              <p className="text-sm text-zinc-600 pl-9 font-sans leading-relaxed">
                {item.a}
              </p>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
};
