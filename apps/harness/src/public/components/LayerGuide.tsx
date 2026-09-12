import { Language, PageView } from "../types";
import { translations } from "../data/translations";

export type LayerGuideId = "sectoren" | "lokale-netwerken" | "handyhousehelp";

const LAYERS: {
  id: LayerGuideId;
  view: PageView;
  labelKey: "sectors" | "local" | "hhh";
}[] = [
  { id: "sectoren", view: "sectoren", labelKey: "sectors" },
  { id: "lokale-netwerken", view: "lokale-netwerken", labelKey: "local" },
  { id: "handyhousehelp", view: "handyhousehelp", labelKey: "hhh" },
];

export function LayerGuide({
  lang,
  current,
  onNavigate,
}: {
  lang: Language;
  current: LayerGuideId;
  onNavigate: (view: PageView) => void;
}) {
  const t = translations[lang].layerGuide;
  const here =
    current === "sectoren"
      ? t.hereSectors
      : current === "lokale-netwerken"
        ? t.hereLocal
        : t.hereHhh;

  return (
    <div className="mb-8">
      <div className="flex flex-wrap items-center gap-1">
        {LAYERS.map((layer, i) => {
          const active = layer.id === current;
          return (
            <span key={layer.id} className="inline-flex items-center gap-1">
              {i > 0 ? (
                <span className="text-zinc-300 text-xs px-0.5" aria-hidden>
                  —
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  if (!active) onNavigate(layer.view);
                }}
                disabled={active}
                aria-current={active ? "page" : undefined}
                className={`public-nowrap px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  active
                    ? "bg-[#1E3A2F] text-white"
                    : "text-zinc-600 hover:text-[#1E3A2F] hover:bg-[#F4F4F2]"
                }`}
              >
                {t[layer.labelKey]}
              </button>
            </span>
          );
        })}
      </div>
      <p className="text-sm text-zinc-600 font-sans mt-2.5 leading-relaxed">
        {here}
      </p>
    </div>
  );
}
