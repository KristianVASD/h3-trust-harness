import React, { useState } from 'react';
import { X, GitBranch } from 'lucide-react';
import { Language } from '../types';

interface HarnessControlModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
}

export const HarnessControlModal: React.FC<HarnessControlModalProps> = ({
  isOpen,
  onClose,
  lang,
}) => {
  const [activeTab, setActiveTab] = useState<'architecture' | 'schema' | 'roles'>('architecture');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-3xl rounded-2xl bg-zinc-900 text-zinc-100 p-6 sm:p-8 shadow-2xl border border-zinc-800 my-8">
        
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-2 text-xs font-mono text-[#C58B3A] mb-2">
          <GitBranch className="w-4 h-4" />
          <span>KristianVASD/h3-trust-harness • Core Architecture</span>
        </div>

        <h3 className="font-serif text-2xl font-normal text-white mb-2">
          H3 Operational Harness Inspector
        </h3>
        <p className="text-xs text-zinc-400 font-sans mb-6">
          De publieke voorkant die je nu bekijkt is de vriendelijke buitenlaag. Hieronder zie je hoe de operationele motor uit de repository werkt.
        </p>

        {/* Tab Buttons */}
        <div className="flex space-x-2 border-b border-zinc-800 pb-3 mb-6 text-xs font-mono">
          <button
            onClick={() => setActiveTab('architecture')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeTab === 'architecture'
                ? 'bg-zinc-800 text-white font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Systeemstructuur
          </button>
          <button
            onClick={() => setActiveTab('schema')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeTab === 'schema'
                ? 'bg-zinc-800 text-white font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Datamodel & Zod
          </button>
          <button
            onClick={() => setActiveTab('roles')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeTab === 'roles'
                ? 'bg-zinc-800 text-white font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            CARA & CURAD Rollen
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'architecture' && (
          <div className="space-y-4 text-xs font-mono">
            <div className="p-4 rounded-xl bg-black/50 border border-zinc-800">
              <div className="text-zinc-400 mb-2"># Repo Layout & Endpoints:</div>
              <pre className="text-zinc-300 overflow-x-auto leading-relaxed">
{`apps/
  harness/       → React/Vite SPA (Mission Control: /control, /work, /missions)
  server/        → Hono/Express API (Store-interface: FileStore of PostgresStore)
packages/
  schema/        → Zod validatie: Company, Source, Signal, Review, Mission
  store/         → Supabase Postgres + Local FileStore implementaties

PUBLIEKE LAAG (Deze App):
  /api/public/featured-companies   → Read-only pool (sourceCount >= 3 && kvk_gate == 'pass')
  /api/public/kvk-check/:kvk       → 8-cijferige KvK gate validator
  /api/public/apply-craftsman      → Candidate queue intake (status: candidate)`}
              </pre>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-zinc-300">
              <div className="p-3 rounded-lg bg-zinc-800/60 border border-zinc-700/60">
                <span className="text-[#C58B3A] font-bold block mb-1">/control — Mission Control</span>
                <p className="text-[11px] text-zinc-400 font-sans">
                  Dashboard voor de algehele status van harvests, gate-checks en openstaande CARA-reviews.
                </p>
              </div>
              <div className="p-3 rounded-lg bg-zinc-800/60 border border-zinc-700/60">
                <span className="text-emerald-400 font-bold block mb-1">/search — Single Search</span>
                <p className="text-[11px] text-zinc-400 font-sans">
                  De gescoorde zoekmotor waar bedrijven worden gerangschikt op basis van onafhankelijke bronbevestiging ("Why").
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'schema' && (
          <div className="space-y-3 text-xs font-mono">
            <div className="p-4 rounded-xl bg-black/50 border border-zinc-800 overflow-x-auto text-zinc-300 leading-relaxed">
              <div className="text-zinc-400 mb-2">// Zod schema mapping (Company & Trust Fields):</div>
              <pre>
{`export const CompanySchema = z.object({
  id: z.string(),
  name: z.string(),
  kvk_gate: z.enum(['pass', 'fail']),
  status: z.enum(['candidate', 'target', 'staged']),
  harvest_confidence: z.enum(['high', 'medium', 'low']),
  source_count: z.number().int().nonnegative(),
  list_memberships: z.array(z.string()),
  review_status: z.enum(['pending', 'agreed', 'adjusted', 'rejected']),
  why: z.object({
    kvk: z.string(),
    branche: z.string(),
    localAnchor: z.string(),
  })
});`}
              </pre>
            </div>
            <p className="text-xs text-zinc-400 font-sans">
              De trust-ladder op de homepage is de menselijk leesbare presentatie van deze velden.
            </p>
          </div>
        )}

        {activeTab === 'roles' && (
          <div className="space-y-4 text-xs font-sans text-zinc-300">
            <div className="p-4 rounded-xl bg-zinc-800/60 border border-zinc-700/60">
              <h4 className="font-serif text-base font-semibold text-white mb-1">
                Strikte Scheiding: CARA vs CURAD
              </h4>
              <p className="text-zinc-400 leading-relaxed mb-3">
                In eerdere documenten werden deze soms verward. In de broncode is het onderscheid glashelder:
              </p>
              <div className="space-y-2 font-mono text-[11px]">
                <div className="p-2.5 rounded bg-black/40 border border-zinc-700">
                  <span className="text-emerald-400 font-bold">CARA:</span> Content Agreement & Review Action. De actie: Agree / Adjust / Disagree.
                </div>
                <div className="p-2.5 rounded bg-black/40 border border-zinc-700">
                  <span className="text-[#C58B3A] font-bold">CURAD:</span> De menselijke rol met curator-mandaat (pending → approved door harness admin).
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-zinc-800 flex items-center justify-between gap-3">
          <span className="text-xs font-mono text-zinc-500">
            Stack: React 19 + Express + Vite + TS
          </span>
          <div className="flex items-center gap-2">
            <a
              href="/control"
              className="px-4 py-2 rounded-lg bg-[#1E3A2F] text-white text-xs font-mono hover:bg-[#162B23]"
            >
              {lang === "nl" ? "Open Mission Control" : "Open Mission Control"}
            </a>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-200 text-xs font-mono hover:bg-zinc-700"
            >
              Sluiten
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
