import { ArrowRight, ClipboardList, MapPin, Printer, Shield, Sparkles } from "lucide-react";
import { translations } from "../data/translations";
import { usePublic } from "../PublicContext";

const PUBLIC_SITE_URL = "https://h3-trust-harness.vercel.app/";

export function PublicMemberInvitePage() {
  const { lang, openRegister } = usePublic();
  const t = translations[lang].memberInvite;

  const points = [
    { icon: MapPin, title: t.point1Title, body: t.point1 },
    { icon: Shield, title: t.point2Title, body: t.point2 },
    { icon: Sparkles, title: t.point3Title, body: t.point3 },
  ] as const;

  return (
    <div className="public-section">
      <div className="public-page-card member-invite-sheet px-5 sm:px-10 lg:px-14 py-8 sm:py-12">
        <p className="text-xs font-mono uppercase tracking-widest text-[#1E3A2F] font-semibold">
          {t.kicker}
        </p>
        <h1 className="font-serif text-3xl sm:text-5xl text-zinc-900 font-normal mt-2 max-w-3xl">
          {t.title}
        </h1>
        <p className="text-sm text-zinc-700 mt-4 max-w-2xl leading-relaxed">
          {t.memberFrom}
        </p>
        <p className="text-sm sm:text-base text-zinc-600 mt-3 max-w-2xl leading-relaxed">
          {t.lead}
        </p>

        <div className="mt-8 p-5 sm:p-6 rounded-2xl border border-zinc-200 bg-white">
          <h2 className="font-serif text-xl text-zinc-900 font-semibold">
            {t.whatIsTitle}
          </h2>
          <p className="text-sm text-zinc-600 mt-2 leading-relaxed max-w-2xl">
            {t.whatIs}
          </p>
        </div>

        <ul className="mt-6 space-y-4">
          {points.map((point) => {
            const Icon = point.icon;
            return (
              <li
                key={point.title}
                className="flex gap-4 p-4 sm:p-5 rounded-2xl border border-zinc-200 bg-[#FBFBFA]"
              >
                <div className="shrink-0 w-10 h-10 rounded-xl bg-[#1E3A2F]/10 text-[#1E3A2F] flex items-center justify-center">
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-serif text-lg text-zinc-900 font-semibold">
                    {point.title}
                  </h2>
                  <p className="text-sm text-zinc-600 mt-1 leading-relaxed">
                    {point.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 p-5 sm:p-6 rounded-2xl border border-[#1E3A2F]/20 bg-[#1E3A2F]/[0.04]">
          <div className="flex gap-3">
            <ClipboardList className="w-5 h-5 text-[#1E3A2F] shrink-0 mt-0.5" />
            <div>
              <h2 className="font-serif text-lg text-zinc-900 font-semibold">
                {t.askTitle}
              </h2>
              <p className="text-sm text-zinc-600 mt-1 leading-relaxed">
                {t.ask}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <h2 className="font-serif text-lg text-zinc-900 font-semibold">
            {t.howTitle}
          </h2>
          <p className="text-sm text-zinc-600 mt-1 leading-relaxed">{t.how}</p>
          <a
            href={PUBLIC_SITE_URL}
            className="mt-2 inline-block text-sm text-[#1E3A2F] font-mono underline break-all"
          >
            {PUBLIC_SITE_URL}
          </a>
        </div>

        <p className="mt-8 font-serif text-xl text-[#1E3A2F]">{t.together}</p>

        <div className="member-invite-actions mt-8 flex flex-col gap-3">
          <p className="text-xs text-zinc-500 leading-relaxed">{t.boardHint}</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-[#1E3A2F] text-[#1E3A2F] text-sm font-semibold hover:bg-[#F4F4F2]"
            >
              <Printer className="w-4 h-4" />
              <span>{t.print}</span>
            </button>
            <button
              type="button"
              onClick={openRegister}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#1E3A2F] text-white text-sm font-semibold hover:bg-[#162B23]"
            >
              <span>{t.cta}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
