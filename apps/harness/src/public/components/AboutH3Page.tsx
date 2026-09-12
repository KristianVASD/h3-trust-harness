import React from 'react';
import { 
  Cpu, 
  ShieldCheck, 
  Users, 
  ArrowLeft, 
  Sparkles, 
  Binary, 
  CheckCircle2,
  GitBranch
} from 'lucide-react';
import { Language } from '../types';
import { translations } from '../data/translations';

interface AboutH3PageProps {
  lang: Language;
  onBackToHome: () => void;
  onOpenHarnessModal: () => void;
}

export const AboutH3Page: React.FC<AboutH3PageProps> = ({
  lang,
  onBackToHome,
  onOpenHarnessModal,
}) => {
  const t = translations[lang].aboutPage;

  return (
    <div className="public-section">
      <div className="public-page-card px-5 sm:px-8 lg:px-12 py-8 sm:py-12">
        
        {/* Breadcrumb / Back button */}
        <button
          onClick={onBackToHome}
          className="inline-flex items-center space-x-1.5 text-xs font-mono text-zinc-500 hover:text-zinc-900 transition-colors mb-8"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{lang === 'nl' ? 'Terug naar homepage' : 'Back to homepage'}</span>
        </button>

        {/* Page Header */}
        <div className="mb-14 pb-8 border-b border-zinc-200">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-[#1E3A2F]/10 text-[#1E3A2F] text-xs font-mono font-medium mb-3">
            <Sparkles className="w-3.5 h-3.5 text-[#C58B3A]" />
            <span>{t.badge}</span>
          </div>

          <h1 className="font-serif text-3xl sm:text-5xl text-zinc-900 font-normal tracking-tight leading-tight mb-4">
            {t.heroTitle}
          </h1>

          <p className="text-base sm:text-lg text-zinc-600 font-sans leading-relaxed">
            {t.heroSub}
          </p>
        </div>

        {/* Section 1: The Origin Story */}
        <div className="p-8 sm:p-10 rounded-2xl bg-white border border-zinc-200 shadow-xs mb-10">
          <div className="flex items-center space-x-2 text-xs font-mono uppercase text-[#406A56] font-semibold mb-2">
            <Binary className="w-4 h-4" />
            <span>OpenBuild & BGIcommons.org HyperSprint</span>
          </div>

          <h2 className="font-serif text-2xl sm:text-3xl text-zinc-900 font-medium mb-4">
            {t.originTitle}
          </h2>

          <div className="prose text-zinc-700 text-sm sm:text-base leading-relaxed space-y-4 font-sans">
            <p className="text-zinc-600">
              Tijdens de HyperSprint hackathon van{" "}
              <a
                href="https://bgicommons.org/"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-[#1E3A2F] underline underline-offset-2"
              >
                BGI Commons
              </a>{" "}
              en <strong>OpenBuild</strong> kozen de meeste bouwers voor abstracte wiskunde, crypto-speculatie of gesloten agent-systemen.
            </p>
            
            <div className="p-4 rounded-xl bg-[#F4F4F2] border-l-4 border-[#1E3A2F] font-serif text-lg text-zinc-900 my-4 italic">
              “Wat heeft een loodgieter, een timmerman of een huishouden met een lekkend dak aan gedecentraliseerde AI?”
            </div>

            <p className="text-zinc-600">
              In <strong>Track 3</strong> stond één project dat deze fundamentele vraag stelde. Als enige deelnemer in deze track die de vertaalslag maakte naar de fysieke maatschappij, legde H3 het fundament voor een open trust-harness.
            </p>
            <p className="text-zinc-600">
              Niet om een theoretisch model te bouwen, maar om <strong>decentrale beneficial AI naar echte mensen te brengen</strong>. Vandaag is dat project uitgegroeid tot een werkende architectuur en zijn we in actieve dialoog met netwerken, gemeenten en partners om deze standaard in de praktijk te verankeren.
            </p>
          </div>
        </div>

        {/* Section 2: Omega from SingularityNET & BGI */}
        <div className="p-8 sm:p-10 rounded-2xl bg-white border border-zinc-200 shadow-xs mb-10">
          <div className="flex items-center space-x-2 text-xs font-mono uppercase text-[#1E3A2F] font-semibold mb-2">
            <Cpu className="w-4 h-4 text-[#C58B3A]" />
            <span>SingularityNET & BGI Gedachtegoed</span>
          </div>

          <h2 className="font-serif text-2xl sm:text-3xl text-zinc-900 font-medium mb-4">
            {t.rootsTitle}
          </h2>

          <p className="text-sm sm:text-base text-zinc-600 leading-relaxed font-sans mb-6">
            Wat begon als <em>OmegaClaw</em> heet nu volwassen <strong>Omega</strong>, geworteld in{" "}
            <a
              href="https://bgicommons.org/"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-[#1E3A2F] underline underline-offset-2"
            >
              BGI Commons
            </a>
            . BGI Commons is onderdeel van{" "}
            <a
              href="https://superintelligence.io/about/"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-[#1E3A2F] underline underline-offset-2"
            >
              The Artificial Superintelligence (ASI) Alliance
            </a>
            .
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {t.rootsPoints.map((pt, idx) => (
              <div key={idx} className="p-4 rounded-xl bg-[#FBFBFA] border border-zinc-200">
                <div className="w-8 h-8 rounded-lg bg-[#1E3A2F] text-white flex items-center justify-center font-mono text-xs mb-3">
                  0{idx + 1}
                </div>
                <h4 className="font-serif text-base font-semibold text-zinc-900 mb-1.5">
                  {pt.title}
                </h4>
                <p className="text-xs text-zinc-600 font-sans leading-relaxed">
                  {pt.desc}
                </p>
              </div>
            ))}
          </div>

          <div className="p-4 rounded-xl bg-[#406A56]/10 border border-[#406A56]/20 text-xs text-zinc-700 font-sans flex items-start space-x-3">
            <ShieldCheck className="w-5 h-5 text-[#1E3A2F] shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-zinc-900">Curator in plaats van Rechter: </span>
              Omega oordeelt niet zelfstandig. Het doorzoekt open registers, verenigingen en kwaliteitsdata om feiten te bundelen, zodat de menselijke gemeenschap het vertrouwen kan bezegelen.
            </div>
          </div>
        </div>

        {/* Section 3: Human Sovereignty (CARA / CURAD) */}
        <div className="p-8 sm:p-10 rounded-2xl bg-white border border-zinc-200 shadow-xs mb-10">
          <div className="flex items-center space-x-2 text-xs font-mono uppercase text-[#C58B3A] font-semibold mb-2">
            <Users className="w-4 h-4 text-[#C58B3A]" />
            <span>Human In The Loop & Besluitvorming</span>
          </div>

          <h2 className="font-serif text-2xl sm:text-3xl text-zinc-900 font-medium mb-4">
            {t.caraTitle}
          </h2>

          <p className="text-sm sm:text-base text-zinc-600 leading-relaxed font-sans mb-6">
            {t.caraDesc}
          </p>

          <div className="space-y-4 mb-6">
            <div className="p-5 rounded-xl bg-[#FBFBFA] border border-zinc-200 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div>
                <span className="font-mono text-xs font-bold text-[#1E3A2F] bg-[#1E3A2F]/10 px-2 py-0.5 rounded">
                  CARA (De Actie)
                </span>
                <h4 className="font-serif text-lg font-semibold text-zinc-900 mt-2 mb-1">
                  Content Agreement & Review Action
                </h4>
                <p className="text-xs sm:text-sm text-zinc-600 font-sans">
                  De discrete handeling waarbij een binnengekomen signaal, brondocument of kwaliteitsvermelding wordt beoordeeld (<strong>Agree</strong> / <strong>Adjust</strong> / <strong>Disagree</strong>).
                </p>
              </div>
              <span className="text-xs font-mono text-zinc-400 shrink-0">Review Protocol</span>
            </div>

            <div className="p-5 rounded-xl bg-[#FBFBFA] border border-zinc-200 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div>
                <span className="font-mono text-xs font-bold text-[#406A56] bg-[#406A56]/10 px-2 py-0.5 rounded">
                  CURAD (De Rol)
                </span>
                <h4 className="font-serif text-lg font-semibold text-zinc-900 mt-2 mb-1">
                  De Menselijke Curator
                </h4>
                <p className="text-xs sm:text-sm text-zinc-600 font-sans">
                  De menselijke curator (van lokale wijkvrijwilliger tot ervaren sectorexpert van een branchevereniging) die de uiteindelijke stempel drukt. <strong>Geen enkel bedrijf wordt zonder menselijke blik als 'volledig geverifieerd' aangemerkt.</strong>
                </p>
              </div>
              <span className="text-xs font-mono text-zinc-400 shrink-0">Sovereign Role</span>
            </div>
          </div>

          <div className="text-right">
            <button
              onClick={onOpenHarnessModal}
              className="inline-flex items-center space-x-2 text-xs font-mono text-[#1E3A2F] font-semibold hover:underline"
            >
              <GitBranch className="w-3.5 h-3.5 text-[#C58B3A]" />
              <span>Bekijk de code-architectuur van de harness (KristianVASD/h3-trust-harness)</span>
            </button>
          </div>
        </div>

        {/* Section 4: Public Trust Utility */}
        <div className="p-8 sm:p-10 rounded-2xl bg-[#1E3A2F] text-white shadow-sm">
          <span className="text-xs font-mono uppercase tracking-widest text-[#C58B3A] font-semibold">
            De Toekomst
          </span>
          <h2 className="font-serif text-2xl sm:text-3xl font-medium mt-2 mb-4">
            {t.futureTitle}
          </h2>
          <p className="text-sm sm:text-base text-zinc-300 font-sans leading-relaxed mb-6">
            {t.futureBody}
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 pt-4 border-t border-white/10">
            <div className="flex items-center space-x-2 text-xs font-mono text-zinc-300">
              <CheckCircle2 className="w-4 h-4 text-[#C58B3A]" />
              <span>Geen extractieve platformfees</span>
            </div>
            <div className="flex items-center space-x-2 text-xs font-mono text-zinc-300">
              <CheckCircle2 className="w-4 h-4 text-[#C58B3A]" />
              <span>Open source verificatiestandaard</span>
            </div>
            <div className="flex items-center space-x-2 text-xs font-mono text-zinc-300">
              <CheckCircle2 className="w-4 h-4 text-[#C58B3A]" />
              <span>Lokale gemeenschappen aan het stuur</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
