import React from 'react';
import { ArrowLeft, HeartHandshake } from 'lucide-react';
import { Language } from '../types';
import { translations } from '../data/translations';

interface AboutH3PageProps {
  lang: Language;
  onBackToHome: () => void;
  onOpenHarnessModal: () => void;
  onJoin: () => void;
}

export const AboutH3Page: React.FC<AboutH3PageProps> = ({
  lang,
  onBackToHome,
  onOpenHarnessModal,
  onJoin,
}) => {
  const t = translations[lang].aboutPage;

  return (
    <div className="public-section">
      <div className="public-page-card px-5 sm:px-8 lg:px-12 py-8 sm:py-12">
        <button
          type="button"
          onClick={onBackToHome}
          className="inline-flex items-center space-x-1.5 text-xs font-mono text-zinc-500 hover:text-zinc-900 transition-colors mb-10"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{t.backHome}</span>
        </button>

        {/* 1. Hero */}
        <header className="mb-14 pb-10 border-b border-zinc-200 max-w-3xl">
          <p className="text-xs font-mono uppercase tracking-widest text-[#C58B3A] font-semibold mb-4">
            {t.badge}
          </p>
          <h1 className="font-serif text-3xl sm:text-5xl text-zinc-900 font-normal tracking-tight leading-tight mb-5">
            {t.heroTitle}
          </h1>
          <p className="text-base sm:text-lg text-zinc-600 font-sans leading-relaxed">
            {t.heroSub}
          </p>
        </header>

        <div className="max-w-3xl space-y-14">
          {/* 2. World */}
          <section>
            <h2 className="font-serif text-2xl sm:text-3xl text-zinc-900 font-medium mb-4">
              {t.worldTitle}
            </h2>
            <p className="text-sm sm:text-base text-zinc-600 font-sans leading-relaxed">
              {t.worldBody}
            </p>
          </section>

          {/* 3. Hope / what if */}
          <section>
            <h2 className="font-serif text-2xl sm:text-3xl text-zinc-900 font-medium mb-4">
              {t.hopeTitle}
            </h2>
            <p className="text-sm sm:text-base text-zinc-600 font-sans leading-relaxed">
              {t.hopeBody}
            </p>
          </section>

          {/* 4. What H3 does */}
          <section>
            <h2 className="font-serif text-2xl sm:text-3xl text-zinc-900 font-medium mb-5">
              {t.howTitle}
            </h2>
            <ul className="space-y-4 mb-5">
              {t.howPoints.map((point, idx) => (
                <li
                  key={idx}
                  className="flex gap-3 text-sm sm:text-base text-zinc-600 font-sans leading-relaxed"
                >
                  <span className="font-mono text-xs text-[#C58B3A] font-semibold mt-1 shrink-0">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={onOpenHarnessModal}
              className="text-xs font-mono text-[#1E3A2F] font-semibold hover:underline underline-offset-2"
            >
              {t.howHarnessLink}
            </button>
          </section>

          {/* 5. Roots */}
          <section>
            <h2 className="font-serif text-2xl sm:text-3xl text-zinc-900 font-medium mb-4">
              {t.rootsTitle}
            </h2>
            <p className="text-sm sm:text-base text-zinc-600 font-sans leading-relaxed">
              {t.rootsBody}
            </p>
          </section>

          {/* 6. Why + 7. CTA */}
          <section className="rounded-2xl bg-[#1E3A2F] text-white px-6 sm:px-8 py-8 sm:py-10">
            <div className="flex items-center space-x-2 text-xs font-mono uppercase text-[#C58B3A] font-semibold mb-3">
              <HeartHandshake className="w-4 h-4" />
              <span>{t.whyTitle}</span>
            </div>
            <p className="font-serif text-lg sm:text-xl text-white leading-relaxed mb-8 max-w-2xl">
              {t.whyBody}
            </p>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-6 border-t border-white/10">
              <button
                type="button"
                onClick={onJoin}
                className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-[#C58B3A] text-[#1E3A2F] text-sm font-semibold font-sans hover:bg-[#d4a05a] transition-colors"
              >
                {t.cta}
              </button>
              <p className="text-xs font-mono text-zinc-400">{t.ctaHint}</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
