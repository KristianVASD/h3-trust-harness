import React from 'react';
import { Database, GitFork, Sparkles, UserCheck } from 'lucide-react';
import { Language } from '../types';
import { translations } from '../data/translations';

interface HowItWorksProps {
  lang: Language;
}

export const HowItWorks: React.FC<HowItWorksProps> = ({ lang }) => {
  const t = translations[lang].howItWorks;

  const steps = [
    {
      num: '1',
      icon: Database,
      title: t.step1Title,
      desc: t.step1Desc,
      tag: lang === 'nl' ? 'Omega Data Curator' : 'Omega Data Curator',
      color: 'bg-zinc-100 text-zinc-800',
    },
    {
      num: '2',
      icon: GitFork,
      title: t.step2Title,
      desc: t.step2Desc,
      tag: lang === 'nl' ? '≥2 Onafhankelijke Bronnen' : '≥2 Independent Sources',
      color: 'bg-amber-50 text-amber-900 border-amber-200',
    },
    {
      num: '3',
      icon: Sparkles,
      title: t.step3Title,
      desc: t.step3Desc,
      tag: lang === 'nl' ? 'Concrete Vakpraktijken' : 'Practical Habits',
      color: 'bg-emerald-50 text-emerald-900 border-emerald-200',
    },
    {
      num: '4',
      icon: UserCheck,
      title: t.step4Title,
      desc: t.step4Desc,
      tag: lang === 'nl' ? 'Menselijke CARA-curatie' : 'Human CARA Review',
      color: 'bg-[#1E3A2F] text-white',
    },
  ];

  return (
    <section id="hoe-het-werkt" className="public-section">
      <div className="public-page-card px-5 sm:px-8 lg:px-12 py-10 sm:py-14">
        
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-xs font-mono uppercase tracking-widest text-[#406A56] font-semibold">
            {lang === 'nl' ? 'Het Proces' : 'The Process'}
          </span>
          <h2 className="font-serif text-3xl sm:text-4xl text-zinc-900 font-normal mt-2">
            {t.title}
          </h2>
          <p className="text-base text-zinc-600 mt-3 font-sans">
            {t.subtitle}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.num}
                className="min-w-0 p-6 sm:p-8 rounded-2xl bg-[#FBFBFA] border border-zinc-200 flex flex-col justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <span className="w-8 h-8 rounded-lg bg-[#1E3A2F] text-white font-mono text-sm font-semibold flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className={`text-[11px] font-mono px-2.5 py-1 rounded-md border border-zinc-200 max-w-full ${step.color}`}>
                      {step.tag}
                    </span>
                  </div>

                  <h3 className="font-serif text-xl font-medium text-zinc-900 mb-3">
                    {step.title}
                  </h3>

                  <p className="text-sm text-zinc-600 font-sans leading-relaxed">
                    {step.desc}
                  </p>
                </div>

                <div className="pt-6 mt-6 border-t border-zinc-200/60 flex items-center text-xs font-mono text-zinc-400">
                  <span>Stap {step.num} van 4</span>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
