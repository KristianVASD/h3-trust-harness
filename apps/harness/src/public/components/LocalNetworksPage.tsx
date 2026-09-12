import React from 'react';
import { Users, ArrowLeft, ArrowRight, HeartHandshake, Store, Bike } from 'lucide-react';
import { Language, PageView } from '../types';
import { translations } from '../data/translations';
import { LayerGuide } from './LayerGuide';

interface LocalNetworksPageProps {
  lang: Language;
  onBackToHome: () => void;
  onOpenCommunityModal: () => void;
  onNavigate: (view: PageView) => void;
}

export const LocalNetworksPage: React.FC<LocalNetworksPageProps> = ({
  lang,
  onBackToHome,
  onOpenCommunityModal,
  onNavigate,
}) => {
  const t = translations[lang].localNetworksPage;

  return (
    <div className="public-section">
      <div className="public-page-card px-5 sm:px-8 lg:px-12 py-8 sm:py-12">
        
        <button
          onClick={onBackToHome}
          className="inline-flex items-center space-x-1.5 text-xs font-mono text-zinc-500 hover:text-zinc-900 transition-colors mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{lang === 'nl' ? 'Terug naar homepage' : 'Back to homepage'}</span>
        </button>

        <LayerGuide lang={lang} current="lokale-netwerken" onNavigate={onNavigate} />

        <div className="mb-12 pb-6 border-b border-zinc-200">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-[#1E3A2F]/10 text-[#1E3A2F] text-xs font-mono font-medium mb-3">
            <Users className="w-3.5 h-3.5 text-[#C58B3A]" />
            <span>{t.badge}</span>
          </div>
          <h1 className="font-serif text-3xl sm:text-5xl text-zinc-900 font-normal leading-tight">
            {t.title}
          </h1>
          <p className="text-base sm:text-lg text-zinc-600 font-sans mt-3 max-w-3xl leading-relaxed">
            {t.intro}
          </p>
          <p className="text-sm sm:text-base text-zinc-600 font-sans mt-4 max-w-3xl leading-relaxed">
            {t.signal}
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            {t.chips.map((chip) => (
              <span
                key={chip}
                className="px-2.5 py-1 rounded-full bg-[#F4F4F2] border border-zinc-200 text-xs font-medium text-zinc-700"
              >
                {chip}
              </span>
            ))}
          </div>
        </div>

        {/* The 2-Tier Strategy in Detail */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="p-6 rounded-2xl bg-white border border-zinc-200 shadow-2xs">
            <Store className="w-8 h-8 text-[#1E3A2F] mb-3" />
            <h3 className="font-serif text-lg font-semibold text-zinc-900 mb-2">
              {t.card1Title}
            </h3>
            <p className="text-xs sm:text-sm text-zinc-600 font-sans leading-relaxed">
              {t.card1Desc}
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-zinc-200 shadow-2xs">
            <HeartHandshake className="w-8 h-8 text-[#C58B3A] mb-3" />
            <h3 className="font-serif text-lg font-semibold text-zinc-900 mb-2">
              {t.card2Title}
            </h3>
            <p className="text-xs sm:text-sm text-zinc-600 font-sans leading-relaxed">
              {t.card2Desc}
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-zinc-200 shadow-2xs">
            <Bike className="w-8 h-8 text-[#406A56] mb-3" />
            <h3 className="font-serif text-lg font-semibold text-zinc-900 mb-2">
              {t.card3Title}
            </h3>
            <p className="text-xs sm:text-sm text-zinc-600 font-sans leading-relaxed">
              {t.card3Desc}
            </p>
          </div>
        </div>

        {/* Community Anchor Callout */}
        <div className="p-8 sm:p-10 rounded-2xl bg-white border border-zinc-200 shadow-xs mb-10 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <h3 className="font-serif text-2xl font-semibold text-zinc-900">
              {t.ctaTitle}
            </h3>
            <p className="text-sm text-zinc-600 font-sans leading-relaxed">
              {t.ctaBody}
            </p>
          </div>

          <button
            onClick={onOpenCommunityModal}
            className="px-6 py-3.5 rounded-xl bg-[#1E3A2F] text-white font-medium text-sm hover:bg-[#162B23] transition-colors shrink-0 shadow-sm inline-flex items-center space-x-2"
          >
            <span>{t.ctaButton}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  );
};
