import { MapPin, ShieldCheck } from "lucide-react";
import type { Company } from "../types";

export function PublicCompanyCard({
  company,
  expanded,
  onToggle,
}: {
  company: Company;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasWhy =
    Boolean(company.whyReliable.kvk) ||
    Boolean(company.whyReliable.branche) ||
    Boolean(company.whyReliable.localAnchor);
  const place = [company.neighborhood, company.city].filter(Boolean).join(", ");

  return (
    <div className="min-w-0 p-4 sm:p-6 rounded-xl bg-white border border-zinc-200 shadow-2xs hover:border-zinc-300 transition-all">
      <div className="min-w-0 space-y-3 mb-3">
        <div className="flex flex-col items-start gap-2 min-w-0">
          <h3 className="min-w-0 font-serif text-xl font-semibold text-zinc-900 leading-snug">
            {company.name}
          </h3>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-[#1E3A2F] text-white">
            <ShieldCheck className="w-3 h-3 shrink-0" />
            <span>
              {company.sourceCount} bronnen
            </span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500 font-sans min-w-0">
          {company.trade ? (
            <span className="font-medium text-zinc-800">{company.trade}</span>
          ) : null}
          {place ? (
            <span className="inline-flex items-center gap-1 min-w-0">
              <MapPin className="w-3 h-3 text-zinc-400 shrink-0" />
              <span>{place}</span>
            </span>
          ) : null}
          {company.kvkNumber ? (
            <span className="font-mono">KvK {company.kvkNumber}</span>
          ) : null}
        </div>

        {company.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {company.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 text-[11px] font-sans bg-zinc-100 text-zinc-700 rounded"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {company.summary ? (
        <p className="text-xs text-zinc-600 font-sans mb-4 leading-relaxed">
          {company.summary}
        </p>
      ) : null}

      {hasWhy ? (
        <div className="min-w-0 p-3 rounded-lg bg-[#FBFBFA] border border-zinc-200 text-xs space-y-1 mb-3">
          <div className="font-mono font-semibold text-zinc-700 text-[11px] uppercase tracking-wide">
            Onafhankelijk Waarom-Profiel:
          </div>
          {company.whyReliable.kvk ? (
            <div className="text-zinc-600 min-w-0">
              <strong>KvK:</strong> {company.whyReliable.kvk}
            </div>
          ) : null}
          {company.whyReliable.branche ? (
            <div className="text-zinc-600 min-w-0">
              <strong>Branche:</strong> {company.whyReliable.branche}
            </div>
          ) : null}
          {company.whyReliable.localAnchor ? (
            <div className="text-zinc-600 min-w-0">
              <strong>Lokaal:</strong> {company.whyReliable.localAnchor}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col items-start gap-2 pt-2 min-w-0 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-[11px] font-mono text-zinc-400">
          Status: {company.status.toUpperCase()} • CARA: {company.caraStatus}
        </span>

        {company.sources.length > 0 ? (
          <button
            type="button"
            onClick={onToggle}
            className="text-xs font-mono text-[#1E3A2F] hover:underline"
          >
            {expanded ? "Verberg details" : "Toon brondocumenten"}
          </button>
        ) : null}
      </div>

      {expanded && company.sources.length > 0 ? (
        <div className="mt-4 pt-4 border-t border-zinc-200 space-y-2 min-w-0">
          <h4 className="text-xs font-mono font-bold text-zinc-700 uppercase">
            Geverifieerde bron-records:
          </h4>
          {company.sources.map((src) => (
            <div
              key={src.id}
              className="min-w-0 p-2.5 rounded bg-zinc-50 border border-zinc-200 text-xs space-y-1"
            >
              <span className="block font-semibold text-zinc-900">{src.name}</span>
              {src.hash ? (
                <span className="block font-mono text-[10px] text-zinc-400 break-all">
                  {src.hash}
                </span>
              ) : null}
              <p className="text-zinc-600 text-[11px] leading-relaxed">
                {src.description}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
