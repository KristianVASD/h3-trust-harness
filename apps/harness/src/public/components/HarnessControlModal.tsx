import React, { useState } from "react";
import { X } from "lucide-react";
import { Language } from "../types";
import { translations } from "../data/translations";

interface HarnessControlModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
}

type HarnessTab = "sources" | "record" | "human";

export const HarnessControlModal: React.FC<HarnessControlModalProps> = ({
  isOpen,
  onClose,
  lang,
}) => {
  const [activeTab, setActiveTab] = useState<HarnessTab>("sources");
  const t = translations[lang].harnessModal;

  if (!isOpen) return null;

  const tabs: { id: HarnessTab; label: string }[] = [
    { id: "sources", label: t.tabSources },
    { id: "record", label: t.tabRecord },
    { id: "human", label: t.tabHuman },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-2xl bg-white text-zinc-900 p-6 sm:p-8 shadow-2xl border border-zinc-200 my-8">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100"
        >
          <X className="w-5 h-5" />
        </button>

        <p className="text-xs font-mono uppercase tracking-widest text-[#406A56] font-semibold mb-2">
          {t.kicker}
        </p>
        <h3 className="font-serif text-2xl font-normal text-zinc-900 mb-2">
          {t.title}
        </h3>
        <p className="text-sm text-zinc-600 font-sans mb-6 leading-relaxed">
          {t.intro}
        </p>

        <div className="flex flex-wrap gap-2 border-b border-zinc-200 pb-3 mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-[#1E3A2F] text-white"
                  : "text-zinc-600 hover:bg-[#F4F4F2]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "sources" ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600 leading-relaxed">{t.sourcesLead}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(
                [
                  [t.sourceNational, t.sourceNationalBody],
                  [t.sourceSector, t.sourceSectorBody],
                  [t.sourceRegional, t.sourceRegionalBody],
                ] as const
              ).map(([title, body]) => (
                <div
                  key={title}
                  className="min-w-0 p-4 rounded-xl border border-zinc-200 bg-[#FBFBFA]"
                >
                  <h4 className="font-serif text-base font-semibold text-zinc-900 mb-1">
                    {title}
                  </h4>
                  <p className="text-xs text-zinc-600 leading-relaxed">{body}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {activeTab === "record" ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600 leading-relaxed">{t.recordLead}</p>
            <div className="space-y-2">
              {[
                [t.recordIdentity, t.recordIdentityBody],
                [t.recordSources, t.recordSourcesBody],
                [t.recordLocal, t.recordLocalBody],
              ].map(([title, body]) => (
                <div
                  key={title}
                  className="min-w-0 p-4 rounded-xl border border-zinc-200 bg-[#FBFBFA]"
                >
                  <h4 className="font-serif text-base font-semibold text-zinc-900 mb-1">
                    {title}
                  </h4>
                  <p className="text-xs text-zinc-600 leading-relaxed">{body}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed">{t.recordLadder}</p>
          </div>
        ) : null}

        {activeTab === "human" ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600 leading-relaxed">{t.humanLead}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="min-w-0 p-4 rounded-xl border border-zinc-200 bg-[#FBFBFA]">
                <h4 className="font-serif text-base font-semibold text-zinc-900 mb-1">
                  {t.caraTitle}
                </h4>
                <p className="text-xs text-zinc-600 leading-relaxed">{t.caraBody}</p>
              </div>
              <div className="min-w-0 p-4 rounded-xl border border-zinc-200 bg-[#FBFBFA]">
                <h4 className="font-serif text-base font-semibold text-zinc-900 mb-1">
                  {t.curadTitle}
                </h4>
                <p className="text-xs text-zinc-600 leading-relaxed">{t.curadBody}</p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-6 pt-4 border-t border-zinc-200 flex flex-wrap items-center justify-end gap-2">
          <a
            href="/control"
            className="px-4 py-2 rounded-lg border border-zinc-200 text-zinc-700 text-xs font-medium hover:border-[#1E3A2F] hover:text-[#1E3A2F]"
          >
            {t.openDesk}
          </a>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-[#1E3A2F] text-white text-xs font-medium hover:bg-[#162B23]"
          >
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
};
