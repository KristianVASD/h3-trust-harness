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
    <div className="p-6 rounded-xl bg-white border border-zinc-200 shadow-2xs hover:border-zinc-300 transition-all">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center space-x-2">
            <h3 className="font-serif text-xl font-semibold text-zinc-900">
              {company.name}
            </h3>
            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-xs font-medium bg-[#1E3A2F] text-white">
              <ShieldCheck className="w-3 h-3" />
              <span>{company.sourceCount} bronnen</span>
            </span>
          </div>
          <div className="flex items-center space-x-3 text-xs text-zinc-500 font-sans mt-1">
            <span className="font-medium text-zinc-800">{company.trade}</span>
            {place ? (
              <>
                <span>•</span>
                <span className="flex items-center space-x-1">
                  <MapPin className="w-3 h-3 text-zinc-400" />
                  <span>{place}</span>
                </span>
              </>
            ) : null}
            {company.kvkNumber ? (
              <>
                <span>•</span>
                <span className="font-mono">KvK {company.kvkNumber}</span>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-1">
          {company.tags.map((t, idx) => (
            <span
              key={idx}
              className="px-2 py-0.5 text-[11px] font-sans bg-zinc-100 text-zinc-700 rounded"
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      {company.summary ? (
        <p className="text-xs text-zinc-600 font-sans mb-4">{company.summary}</p>
      ) : null}

      {hasWhy ? (
        <div className="p-3 rounded-lg bg-[#FBFBFA] border border-zinc-200 text-xs space-y-1 mb-3">
          <div className="font-mono font-semibold text-zinc-700 text-[11px] uppercase tracking-wide">
            Onafhankelijk Waarom-Profiel:
          </div>
          {company.whyReliable.kvk ? (
            <div className="text-zinc-600">
              <strong>KvK:</strong> {company.whyReliable.kvk}
            </div>
          ) : null}
          {company.whyReliable.branche ? (
            <div className="text-zinc-600">
              <strong>Branche:</strong> {company.whyReliable.branche}
            </div>
          ) : null}
          {company.whyReliable.localAnchor ? (
            <div className="text-zinc-600">
              <strong>Lokaal:</strong> {company.whyReliable.localAnchor}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center justify-between pt-2">
        <span className="text-[11px] font-mono text-zinc-400">
          Status: {company.status.toUpperCase()} • CARA: {company.caraStatus}
        </span>

        {company.sources.length > 0 ? (
          <button
            onClick={onToggle}
            className="text-xs font-mono text-[#1E3A2F] hover:underline"
          >
            {expanded ? "Verberg details" : "Toon brondocumenten"}
          </button>
        ) : null}
      </div>

      {expanded && company.sources.length > 0 ? (
        <div className="mt-4 pt-4 border-t border-zinc-200 space-y-2">
          <h4 className="text-xs font-mono font-bold text-zinc-700 uppercase">
            Geverifieerde bron-records:
          </h4>
          {company.sources.map((src) => (
            <div
              key={src.id}
              className="p-2.5 rounded bg-zinc-50 border border-zinc-200 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-zinc-900">{src.name}</span>
                <span className="font-mono text-[10px] text-zinc-400">
                  {src.hash}
                </span>
              </div>
              <p className="text-zinc-600 text-[11px] mt-0.5">{src.description}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
