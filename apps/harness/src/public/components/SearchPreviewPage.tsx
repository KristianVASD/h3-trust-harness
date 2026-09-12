import React, { useEffect, useMemo, useState } from "react";
import { Search, ArrowLeft } from "lucide-react";
import { api } from "../../api";
import { Company, Language } from "../types";
import { mockCompanies } from "../data/mockDatabase";
import { PublicCompanyCard } from "./PublicCompanyCard";

const TRADE_OPTIONS = [
  { value: "all", labelNl: "Alle Vakgebieden", labelEn: "All Trades" },
  { value: "paint", labelNl: "Schilders", labelEn: "Painters" },
  { value: "drain", labelNl: "Loodgieters", labelEn: "Plumbers" },
  { value: "handyman", labelNl: "Timmerlieden / klus", labelEn: "Carpenters" },
  { value: "roof", labelNl: "Dakdekkers", labelEn: "Roofers" },
  { value: "electro", labelNl: "Elektriciens", labelEn: "Electricians" },
  { value: "hvac", labelNl: "CV / luchtbehandeling", labelEn: "HVAC" },
  { value: "bath", labelNl: "Badkamer", labelEn: "Bathrooms" },
  { value: "solar", labelNl: "Zonne-energie", labelEn: "Solar" },
  { value: "security", labelNl: "Beveiliging", labelEn: "Security" },
  { value: "glazing", labelNl: "Glas / kozijnen", labelEn: "Glazing" },
  { value: "garden", labelNl: "Tuin", labelEn: "Garden" },
  { value: "pest", labelNl: "Plaagdieren", labelEn: "Pest" },
] as const;

const TRADE_ALIASES: Record<string, string[]> = {
  paint: ["schilder"],
  drain: ["loodgieter"],
  handyman: ["timmerman", "klus"],
  roof: ["dakdekker"],
  electro: ["elektricien"],
  hvac: ["cv", "lucht"],
  bath: ["badkamer"],
  solar: ["zon"],
  security: ["beveil"],
  glazing: ["glas", "kozijn"],
  garden: ["tuin"],
  pest: ["plaag"],
};

interface SearchPreviewPageProps {
  lang: Language;
  onBackToHome: () => void;
  onSelectCompany: (company: Company) => void;
}

export const SearchPreviewPage: React.FC<SearchPreviewPageProps> = ({
  lang,
  onBackToHome,
}) => {
  const [selectedTrade, setSelectedTrade] = useState<string>("all");
  const [selectedCity, setSelectedCity] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [live, setLive] = useState<Company[]>([]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (selectedTrade !== "all") params.set("trade", selectedTrade);
    if (selectedCity !== "all") params.set("city", selectedCity);
    const q = params.toString();
    fetch(`/api/public/local-search${q ? `?${q}` : ""}`)
      .then((res) => res.json())
      .then((data: { companies?: Company[] }) => {
        const hits = Array.isArray(data.companies) ? data.companies : [];
        if (hits.length > 0) setLive(hits);
        if (query.trim() || selectedCity !== "all" || selectedTrade !== "all") {
          void api.logSearchDemand({
            what: selectedTrade === "all" ? query || "local search" : selectedTrade,
            location: selectedCity === "all" ? query || "NL" : selectedCity,
            country: "NL",
            parsed_sector: selectedTrade === "all" ? undefined : selectedTrade,
            outcome: hits.length > 0 ? "hit" : "empty_companies",
          });
        }
      })
      .catch(() => {
        /* keep mock */
      });
  }, [query, selectedTrade, selectedCity]);

  const usingLive = live.length > 0;
  const pool = usingLive ? live : mockCompanies;

  const filtered = useMemo(() => {
    if (usingLive) return pool;
    return pool.filter((c) => {
      const aliases = TRADE_ALIASES[selectedTrade] ?? [];
      const matchesTrade =
        selectedTrade === "all" ||
        c.tradeId === selectedTrade ||
        c.trade.toLowerCase().includes(selectedTrade.toLowerCase()) ||
        aliases.some((a) => c.trade.toLowerCase().includes(a));
      const matchesCity =
        selectedCity === "all" ||
        c.city.toLowerCase() === selectedCity.toLowerCase();
      const matchesQuery =
        query === "" ||
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.trade.toLowerCase().includes(query.toLowerCase()) ||
        c.neighborhood.toLowerCase().includes(query.toLowerCase()) ||
        c.city.toLowerCase().includes(query.toLowerCase());
      return matchesTrade && matchesCity && matchesQuery;
    });
  }, [usingLive, pool, selectedTrade, selectedCity, query]);

  return (
    <div className="public-section">
      <div className="public-page-card px-5 sm:px-8 lg:px-12 py-8 sm:py-12">
        <button
          onClick={onBackToHome}
          className="inline-flex items-center space-x-1.5 text-xs font-mono text-zinc-500 hover:text-zinc-900 transition-colors mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>
            {lang === "nl" ? "Terug naar homepage" : "Back to homepage"}
          </span>
        </button>

        <div className="mb-8 pb-6 border-b border-zinc-200">
          <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded bg-[#1E3A2F]/10 text-[#1E3A2F] text-xs font-mono font-medium mb-2">
            <span>HandyHouseHelp • Single Search Prototype</span>
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl text-zinc-900 font-normal">
            {lang === "nl"
              ? "Geverifieerde Vakmensen in de Buurt"
              : "Verified Local Tradespeople"}
          </h1>
          <p className="text-sm text-zinc-600 font-sans mt-2">
            {lang === "nl"
              ? "Gerangschikt op basis van onafhankelijke bronbevestiging (Why-factor) en fysieke nabijheid — niet op advertentiebudgetten."
              : "Ranked by independent source corroboration (Why-factor) and neighborhood proximity — not advertising spend."}
          </p>
          {!usingLive ? (
            <p className="text-xs font-mono text-zinc-500 mt-3">
              {lang === "nl"
                ? "Nog geen oogst voor deze zoekopdracht — voorbeeldbedrijven blijven zichtbaar."
                : "No harvested hits yet — example companies stay visible."}
            </p>
          ) : null}
        </div>

        <div className="p-4 rounded-2xl bg-[#1E3A2F]/[0.06] border-2 border-[#1E3A2F]/25 mb-8 space-y-3 sm:space-y-0 sm:flex sm:items-center sm:gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#1E3A2F] absolute left-3 top-3.5" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                lang === "nl"
                  ? "Zoek op naam, vak of wijk (bv. De Pijp)..."
                  : "Search name, trade or area..."
              }
              className="w-full pl-9 pr-3 py-3 text-sm rounded-xl border-2 border-[#1E3A2F]/30 bg-white text-zinc-900 placeholder:text-zinc-500 focus:outline-none focus:border-[#1E3A2F] focus:ring-2 focus:ring-[#406A56]/25"
            />
          </div>

          <div className="flex gap-2">
            <select
              value={selectedTrade}
              onChange={(e) => setSelectedTrade(e.target.value)}
              className="px-3 py-3 text-xs font-sans rounded-xl border-2 border-[#1E3A2F]/30 bg-white focus:outline-none focus:border-[#1E3A2F]"
            >
              {TRADE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {lang === "nl" ? opt.labelNl : opt.labelEn}
                </option>
              ))}
            </select>

            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="px-3 py-3 text-xs font-sans rounded-xl border-2 border-[#1E3A2F]/30 bg-white focus:outline-none focus:border-[#1E3A2F]"
            >
              <option value="all">
                {lang === "nl" ? "Alle Steden" : "All Cities"}
              </option>
              <option value="Amsterdam">Amsterdam</option>
              <option value="Utrecht">Utrecht</option>
              <option value="Rotterdam">Rotterdam</option>
              <option value="Den Haag">Den Haag</option>
              <option value="Haarlem">Haarlem</option>
            </select>
          </div>
        </div>

        <div className="space-y-4">
          {filtered.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-zinc-200 text-zinc-500 text-sm">
              Geen bedrijven gevonden met deze filters.
            </div>
          ) : (
            filtered.map((company) => (
              <PublicCompanyCard
                key={company.id}
                company={company}
                expanded={expandedId === company.id}
                onToggle={() =>
                  setExpandedId(expandedId === company.id ? null : company.id)
                }
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};
