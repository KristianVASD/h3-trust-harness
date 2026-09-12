import React from 'react';
import { ArrowLeft, ArrowUpRight, CheckCircle2, Sparkles } from 'lucide-react';
import { Language } from '../types';
import { sectorComparisons } from '../data/mockDatabase';

interface SectorsPageProps {
  lang: Language;
  onBackToHome: () => void;
  onOpenPartnerModal: () => void;
}

export const SectorsPage: React.FC<SectorsPageProps> = ({
  lang,
  onBackToHome,
  onOpenPartnerModal,
}) => {
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

        <div className="mb-12 pb-6 border-b border-zinc-200">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-[#C58B3A]/15 text-[#8D5B18] text-xs font-mono font-medium mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{lang === 'nl' ? 'Sectorpartnerschappen' : 'Sector Partnerships'}</span>
          </div>
          <h1 className="font-serif text-3xl sm:text-5xl text-zinc-900 font-normal leading-tight">
            {lang === 'nl' ? 'Sectoren & kwaliteit' : 'Sectors & quality'}
          </h1>
          <p className="text-base sm:text-lg text-zinc-600 font-sans mt-3 max-w-3xl leading-relaxed">
            {lang === 'nl'
              ? 'Kwaliteit staat onder druk door onkundig handelen en fraudeurs. Elke sector werkt aan het borgen van kwaliteit, maar kleinere ondernemers worden vaak niet bereikt. Private huiseigenaren krijgen daardoor niet altijd de kwaliteit. H3 Trust ondersteunt brancheverenigingen en sectorkwaliteitsorganisaties met het uitbreiden van gekwalificeerd werken.'
              : 'Quality is under pressure from incompetent work and fraud. Every sector is working to safeguard quality, but smaller businesses are often not reached. Private homeowners therefore do not always get the quality they need. H3 Trust supports trade associations and sector quality organisations to expand qualified work.'}
          </p>
        </div>

        {/* The Core Proposition for Guilds & Sectors */}
        <div className="p-8 rounded-2xl bg-white border border-zinc-200 shadow-xs mb-12 space-y-4">
          <h2 className="font-serif text-2xl text-zinc-900 font-medium">
            {lang === 'nl' ? 'Wat betekent "kwaliteit" voor een eenpitter?' : 'What does "quality" mean for a small craftsperson?'}
          </h2>
          <p className="text-sm sm:text-base text-zinc-600 font-sans leading-relaxed">
            Grote bouw- en onderhoudsbedrijven besteden tienduizenden euro’s aan ISO-consultants en ESG-audits. Kleine vakmensen leveren in de praktijk vaak minstens zo zorgvuldig en duurzaam werk, maar hebben geen tijd voor administratieve ballast.
          </p>
          <p className="text-sm sm:text-base text-zinc-600 font-sans leading-relaxed">
            Samen met sectorpartners bouwen we aan <strong>aantoonbare sectorstandaarden</strong>: eenvoudige checks en logs via de mobiele HandyHouseHelp app waarmee vakmensen zonder bureaucratie direct kunnen aantonen dat ze voldoen aan de kernwaarden van hun gilde.
          </p>
        </div>

        {/* Detailed Comparison Table */}
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white mb-12 shadow-xs">
          <div className="grid grid-cols-1 md:grid-cols-3 bg-zinc-50 border-b border-zinc-200 text-xs font-mono font-semibold text-zinc-600 p-4">
            <div>Grootbedrijf</div>
            <div>Kleine Vakman / ZZP</div>
            <div className="text-[#1E3A2F]">Hoe H3 ondersteunt</div>
          </div>

          <div className="divide-y divide-zinc-200 text-sm">
            {sectorComparisons.map((item, idx) => (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-3 p-5 gap-4 hover:bg-[#FBFBFA] transition-colors">
                <div className="text-zinc-500 text-xs sm:text-sm">{item.largeCorp}</div>
                <div className="text-zinc-900 font-medium text-xs sm:text-sm">{item.smallCraftsman}</div>
                <div className="text-[#1E3A2F] bg-[#406A56]/5 p-3 rounded-lg border border-[#406A56]/15 text-xs">
                  {item.h3Translation}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Partnership Benefits Box */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          <div className="p-6 rounded-2xl bg-white border border-zinc-200">
            <h3 className="font-serif text-lg font-semibold text-zinc-900 mb-3">
              Wat de sector inbrengt
            </h3>
            <ul className="space-y-2 text-xs sm:text-sm text-zinc-600 font-sans">
              <li className="flex items-start space-x-2">
                <CheckCircle2 className="w-4 h-4 text-[#406A56] shrink-0 mt-0.5" />
                <span>Branchespecifieke kwaliteits- en veiligheidsnormen.</span>
              </li>
              <li className="flex items-start space-x-2">
                <CheckCircle2 className="w-4 h-4 text-[#406A56] shrink-0 mt-0.5" />
                <span>Geaccrediteerde ledenregisters en geschillencommissies als harde trust-bronnen.</span>
              </li>
              <li className="flex items-start space-x-2">
                <CheckCircle2 className="w-4 h-4 text-[#406A56] shrink-0 mt-0.5" />
                <span>Actieve deelname als CURAD-experts bij CARA-beoordelingen.</span>
              </li>
            </ul>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-zinc-200">
            <h3 className="font-serif text-lg font-semibold text-zinc-900 mb-3">
              Wat de sector terugkrijgt
            </h3>
            <ul className="space-y-2 text-xs sm:text-sm text-zinc-600 font-sans">
              <li className="flex items-start space-x-2">
                <CheckCircle2 className="w-4 h-4 text-[#C58B3A] shrink-0 mt-0.5" />
                <span>Gratis lichte AI-assistentie (planning, werkbonnen) voor de kleine leden.</span>
              </li>
              <li className="flex items-start space-x-2">
                <CheckCircle2 className="w-4 h-4 text-[#C58B3A] shrink-0 mt-0.5" />
                <span>Zichtbaarheid van geverifieerde leden bij lokale huishoudens zonder advertentieveiling.</span>
              </li>
              <li className="flex items-start space-x-2">
                <CheckCircle2 className="w-4 h-4 text-[#C58B3A] shrink-0 mt-0.5" />
                <span>Bescherming van het vakmanschap tegen beunhazen en extractieve platforms.</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Action CTA */}
        <div className="p-8 rounded-2xl bg-[#1E3A2F] text-white text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="font-serif text-2xl font-semibold mb-1">
              Word Sectorpartner van H3
            </h3>
            <p className="text-xs sm:text-sm text-zinc-300 font-sans">
              We nodigen branchekoepels, kwaliteitsregisters en vakverenigingen van harte uit.
            </p>
          </div>

          <button
            onClick={onOpenPartnerModal}
            className="px-6 py-3 rounded-xl bg-white text-[#1E3A2F] text-sm font-semibold hover:bg-zinc-100 transition-colors shrink-0 shadow-sm inline-flex items-center space-x-2"
          >
            <span>Aanmelden als Partner</span>
            <ArrowUpRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  );
};
