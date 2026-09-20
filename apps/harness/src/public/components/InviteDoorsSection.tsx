import { ArrowRight, Building2, Landmark, Users } from "lucide-react";
import { translations } from "../data/translations";
import type { Language } from "../types";

interface InviteDoorsSectionProps {
  lang: Language;
  onOpenRegister: () => void;
  onOpenPartner: (kind?: string) => void;
}

export function InviteDoorsSection({
  lang,
  onOpenRegister,
  onOpenPartner,
}: InviteDoorsSectionProps) {
  const t = translations[lang].threeDoors;

  const doors = [
    {
      key: "company",
      icon: Building2,
      subtitle: t.companySubtitle,
      title: t.companyTitle,
      points: [t.companyPoint1, t.companyPoint2, t.companyPoint3],
      cta: t.companyCta,
      onClick: onOpenRegister,
    },
    {
      key: "sector",
      icon: Landmark,
      subtitle: t.sectorSubtitle,
      title: t.sectorTitle,
      points: [t.sectorPoint1, t.sectorPoint2, t.sectorPoint3],
      cta: t.sectorCta,
      onClick: () => onOpenPartner("sector"),
    },
    {
      key: "local",
      icon: Users,
      subtitle: t.localSubtitle,
      title: t.localTitle,
      points: [t.localPoint1, t.localPoint2, t.localPoint3],
      cta: t.localCta,
      onClick: () => onOpenPartner("local_association"),
    },
  ] as const;

  return (
    <section className="public-section">
      <div className="public-page-card px-5 sm:px-8 lg:px-12 py-10 sm:py-14">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <span className="text-xs font-mono uppercase tracking-widest text-[#1E3A2F] font-semibold">
            {t.kicker}
          </span>
          <h2 className="font-serif text-3xl sm:text-4xl text-zinc-900 font-normal tracking-tight mt-2">
            {t.title}
          </h2>
          <p className="text-base text-zinc-600 mt-3 font-sans leading-relaxed">
            {t.subtitle}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {doors.map((door) => {
            const Icon = door.icon;
            return (
              <div
                key={door.key}
                className="p-6 rounded-2xl bg-white border-2 border-zinc-200 flex flex-col"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="px-3 py-1 rounded-full text-xs font-mono font-medium bg-[#1E3A2F]/10 text-[#1E3A2F]">
                    {door.subtitle}
                  </span>
                  <Icon className="w-5 h-5 text-[#1E3A2F]" />
                </div>
                <h3 className="font-serif text-2xl font-semibold text-zinc-900 mb-4">
                  {door.title}
                </h3>
                <ul className="space-y-3 mb-8 text-sm text-zinc-600 font-sans flex-1">
                  {door.points.map((point) => (
                    <li key={point} className="leading-relaxed">
                      {point}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={door.onClick}
                  className="w-full inline-flex items-center justify-center space-x-2 px-5 py-3 rounded-xl bg-[#1E3A2F] text-sm font-semibold text-white hover:bg-[#162B23] transition-colors"
                >
                  <span>{door.cta}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
