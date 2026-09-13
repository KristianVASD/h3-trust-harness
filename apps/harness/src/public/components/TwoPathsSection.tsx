import React from "react";
import { UserPlus, Check, ArrowRight } from "lucide-react";
import { Language } from "../types";
import { translations } from "../data/translations";

interface TwoPathsSectionProps {
  lang: Language;
  onOpenRegisterModal: () => void;
}

export const TwoPathsSection: React.FC<TwoPathsSectionProps> = ({
  lang,
  onOpenRegisterModal,
}) => {
  const t = translations[lang].twoPaths;

  return (
    <section className="public-section">
      <div className="public-page-card px-5 sm:px-8 lg:px-12 py-10 sm:py-14">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <span className="text-xs font-mono uppercase tracking-widest text-[#1E3A2F] font-semibold">
            {lang === "nl" ? "Deelnemen aan het netwerk" : "Joining the network"}
          </span>
          <h2 className="font-serif text-3xl sm:text-4xl text-zinc-900 font-normal tracking-tight mt-2">
            {t.title}
          </h2>
          <p className="text-base text-zinc-600 mt-3 font-sans leading-relaxed">
            {t.subtitle}
          </p>
        </div>

        <div className="max-w-xl mx-auto p-6 sm:p-8 rounded-2xl bg-white border-2 border-zinc-200 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="px-3 py-1 rounded-full text-xs font-mono font-medium bg-[#1E3A2F]/10 text-[#1E3A2F]">
                {t.path1Subtitle}
              </span>
              <UserPlus className="w-5 h-5 text-[#1E3A2F]" />
            </div>

            <h3 className="font-serif text-2xl font-semibold text-zinc-900 mb-4">
              {t.path1Title}
            </h3>

            <div className="space-y-3.5 mb-8 text-sm text-zinc-600 font-sans">
              <div className="flex items-start space-x-3">
                <div className="w-5 h-5 rounded-full bg-emerald-50 text-[#1E3A2F] flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-3.5 h-3.5" />
                </div>
                <span>{t.path1Point1}</span>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-5 h-5 rounded-full bg-emerald-50 text-[#1E3A2F] flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-3.5 h-3.5" />
                </div>
                <span>{t.path1Point2}</span>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-5 h-5 rounded-full bg-emerald-50 text-[#1E3A2F] flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-3.5 h-3.5" />
                </div>
                <span>{t.path1Point3}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenRegisterModal}
            className="w-full inline-flex items-center justify-center space-x-2 px-5 py-3 rounded-xl bg-[#1E3A2F] text-sm font-semibold text-white hover:bg-[#162B23] transition-colors"
          >
            <span>{t.path1Cta}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </section>
  );
};
