import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  CheckCircle, 
  FileText, 
  UserCheck, 
  Building2, 
  ChevronRight, 
  ChevronDown, 
  RefreshCw, 
  Award,
  MapPin,
} from 'lucide-react';
import { Company, Language } from '../types';
import { mockCompanies } from '../data/mockDatabase';
import { translations } from '../data/translations';

interface TrustCardPreviewProps {
  lang: Language;
}

export const TrustCardPreview: React.FC<TrustCardPreviewProps> = ({ lang }) => {
  const [companies, setCompanies] = useState<Company[]>(mockCompanies);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [inspectOpen, setInspectOpen] = useState(false);

  const t = translations[lang].featuredWidget;
  const currentCompany = companies[currentIndex] || mockCompanies[0];

  // Attempt to fetch from the fullstack Express API, fallback to mock database
  useEffect(() => {
    fetch('/api/public/featured-companies')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.companies && data.companies.length > 0) {
          setCompanies(data.companies);
        }
      })
      .catch(() => {
        // Fallback silently to client mock
      });
  }, []);

  const handleNextCompany = () => {
    setCurrentIndex((prev) => (prev + 1) % companies.length);
  };

  return (
    <section id="trust-preview-widget" className="public-section">
      <div className="public-page-card px-5 sm:px-8 lg:px-12 py-8 sm:py-10">
        
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 pb-5 border-b border-zinc-100 gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#406A56]/10 text-[#1E3A2F] text-xs font-mono font-medium mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#406A56]" />
              <span>{t.badge}</span>
            </div>
            <h2 className="font-serif text-2xl sm:text-3xl text-zinc-900 font-normal">
              {t.title}
            </h2>
            <p className="text-sm text-zinc-500 mt-2 max-w-2xl leading-relaxed">
              {t.subtitle}
            </p>
          </div>

          <button
            onClick={handleNextCompany}
            className="inline-flex items-center gap-1.5 public-nowrap px-3 py-2 text-xs font-medium text-zinc-700 bg-[#F4F4F2] hover:bg-zinc-200 rounded-full transition-colors shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5 text-zinc-500" />
            <span>{t.switchCompany}</span>
          </button>
        </div>

        <div className="min-w-0 rounded-2xl border border-zinc-200 bg-[#FBFBFA] p-4 sm:p-8">
          
          {/* Card Top: Name, Trade, City, Badges */}
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 pb-6 border-b border-zinc-200/80 min-w-0">
            <div className="min-w-0">
              <div className="flex flex-col items-start gap-2 mb-2">
                <h3 className="font-serif text-2xl sm:text-3xl text-zinc-900 font-semibold">
                  {currentCompany.name}
                </h3>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#1E3A2F] text-white max-w-full">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {lang === 'nl'
                      ? `${currentCompany.sourceCount} bronnen`
                      : `${currentCompany.sourceCount} sources`}
                  </span>
                </span>
              </div>

              <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-1 sm:gap-x-3 text-sm text-zinc-600 font-sans">
                <span className="font-medium text-zinc-800">{currentCompany.trade}</span>
                <span className="hidden sm:inline text-zinc-300">·</span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-zinc-400" />
                  <span>
                    {[currentCompany.neighborhood, currentCompany.city].filter(Boolean).join(", ")}
                  </span>
                </span>
                {currentCompany.kvkNumber ? (
                  <>
                    <span className="hidden sm:inline text-zinc-300">·</span>
                    <span className="font-mono text-xs text-zinc-500">
                      KvK {currentCompany.kvkNumber}
                      {currentCompany.foundedYear > 0 ? ` · sinds ${currentCompany.foundedYear}` : ""}
                    </span>
                  </>
                ) : null}
              </div>
            </div>

            {/* Tags / Badges */}
            <div className="flex flex-wrap gap-1.5">
              {currentCompany.tags.map((tag, idx) => (
                <span
                  key={idx}
                  className="px-2.5 py-1 rounded-md text-xs font-medium bg-white border border-zinc-200 text-zinc-700 shadow-2xs"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Core Body: Why reliable direct out of data */}
          <div className="py-6">
            <h4 className="text-xs font-mono uppercase tracking-wider text-zinc-500 mb-3">
              {t.whyTitle}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* KvK point */}
              <div className="p-3.5 rounded-xl bg-white border border-zinc-200/90 shadow-2xs">
                <div className="flex items-center space-x-2 text-xs font-mono font-semibold text-[#1E3A2F] mb-1.5">
                  <Building2 className="w-4 h-4 text-[#406A56]" />
                  <span>Kamer van Koophandel</span>
                </div>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  {currentCompany.whyReliable.kvk}
                </p>
              </div>

              {/* Branche point */}
              <div className="p-3.5 rounded-xl bg-white border border-zinc-200/90 shadow-2xs">
                <div className="flex items-center space-x-2 text-xs font-mono font-semibold text-[#1E3A2F] mb-1.5">
                  <Award className="w-4 h-4 text-[#C58B3A]" />
                  <span>Branche & Keurmerk</span>
                </div>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  {currentCompany.whyReliable.branche}
                </p>
              </div>

              {/* Local Anchor point */}
              <div className="p-3.5 rounded-xl bg-white border border-zinc-200/90 shadow-2xs">
                <div className="flex items-center space-x-2 text-xs font-mono font-semibold text-[#1E3A2F] mb-1.5">
                  <MapPin className="w-4 h-4 text-[#1E3A2F]" />
                  <span>Lokaal Geworteld</span>
                </div>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  {currentCompany.whyReliable.localAnchor}
                </p>
              </div>
            </div>
          </div>

          {/* Demonstrable Craft Practices */}
          <div className="pb-6">
            <h4 className="text-xs font-mono uppercase tracking-wider text-zinc-500 mb-2.5">
              {t.practicesTitle}
            </h4>
            <div className="space-y-2">
              {currentCompany.practices.map((p, idx) => (
                <div key={idx} className="flex items-start space-x-2.5 text-xs text-zinc-700 bg-white/70 p-2.5 rounded-lg border border-zinc-200/60">
                  <CheckCircle className="w-4 h-4 text-[#406A56] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-zinc-900">{p.title}: </span>
                    <span className="text-zinc-600">{p.description}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Card Footer with Inspect Action Button */}
          <div className="pt-4 border-t border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0">
            <div className="flex items-start gap-2 text-xs text-zinc-500 font-mono min-w-0">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shrink-0 mt-1" />
              <span className="min-w-0">CARA: {currentCompany.caraReviewedBy}</span>
            </div>

            <button
              onClick={() => setInspectOpen(!inspectOpen)}
              className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-4 py-2 rounded-lg bg-white border border-zinc-300 text-xs font-medium text-zinc-800 hover:border-[#1E3A2F] hover:text-[#1E3A2F] transition-all shadow-2xs"
            >
              <span>{inspectOpen ? t.closeSources : t.viewSources}</span>
              {inspectOpen ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          {/* Micro-interaction: The Calm Inspection Drawer (No Black Box) */}
          {inspectOpen && (
            <div className="mt-6 pt-6 border-t border-zinc-200 bg-white p-4 sm:p-6 rounded-xl min-w-0">
              <div className="flex flex-col items-start gap-2 mb-4 min-w-0">
                <div className="flex items-start gap-2 min-w-0 w-full">
                  <FileText className="w-4 h-4 text-[#1E3A2F] shrink-0 mt-0.5" />
                  <h5 className="min-w-0 flex-1 font-serif font-semibold text-base text-zinc-900 leading-snug">
                    {t.inspectHeading}
                  </h5>
                </div>
                <span className="text-xs font-mono text-zinc-400 break-all max-w-full">
                  ID: {currentCompany.id}
                </span>
              </div>

              <p className="text-xs text-zinc-500 font-sans mb-4 leading-relaxed">
                {t.noBlackBox}
              </p>

              <div className="space-y-3 mb-5">
                {currentCompany.sources.map((src) => (
                  <div
                    key={src.id}
                    className="min-w-0 p-3 rounded-lg border border-zinc-200 bg-[#FBFBFA] space-y-2"
                  >
                    <div className="min-w-0 space-y-1.5">
                      <span className="block text-xs font-semibold text-zinc-900">
                        {src.name}
                      </span>
                      <div className="flex flex-wrap gap-1">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-zinc-200 text-zinc-700">
                          {src.type}
                        </span>
                        <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                          {src.status}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-600 font-sans leading-relaxed">
                        {src.description}
                      </p>
                    </div>

                    <div className="min-w-0 text-[11px] font-mono text-zinc-400 space-y-0.5">
                      {src.hash ? (
                        <div className="break-all">
                          Hash: <span className="text-zinc-600">{src.hash}</span>
                        </div>
                      ) : null}
                      <div>Geverifieerd: {src.verifiedAt}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Human Sovereignty Seal info */}
              <div className="p-3 rounded-lg bg-[#1E3A2F]/5 border border-[#1E3A2F]/15 flex items-start gap-3 min-w-0">
                <UserCheck className="w-5 h-5 text-[#1E3A2F] shrink-0 mt-0.5" />
                <div className="text-xs min-w-0">
                  <p className="font-semibold text-[#1E3A2F]">
                    {lang === 'nl' 
                      ? 'Menselijke CARA-curatie bezegeld door onafhankelijke CURAD'
                      : 'Human CARA curation sealed by independent CURAD'}
                  </p>
                  <p className="text-zinc-600 mt-0.5">
                    {lang === 'nl'
                      ? `Beoordeeld op ${currentCompany.caraReviewedAt} door ${currentCompany.caraReviewedBy}. Geen enkel algoritme publiceert data zonder menselijke instemming.`
                      : `Reviewed on ${currentCompany.caraReviewedAt} by ${currentCompany.caraReviewedBy}. No algorithm publishes verified data without sovereign human approval.`}
                  </p>
                </div>
              </div>

            </div>
          )}

        </div>

      </div>
    </section>
  );
};
