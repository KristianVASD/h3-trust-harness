import { TwoPathsSection } from "../components/TwoPathsSection";
import { translations } from "../data/translations";
import { usePublic } from "../PublicContext";

export function PublicJoinPage() {
  const { lang, openRegister } = usePublic();
  const t = translations[lang].joinPage;

  return (
    <div>
      <div className="public-section">
        <div className="public-page-card px-5 sm:px-8 lg:px-12 py-8 sm:py-10">
          <p className="text-xs font-mono uppercase tracking-widest text-[#1E3A2F] font-semibold">
            {t.kicker}
          </p>
          <h1 className="font-serif text-3xl sm:text-5xl text-zinc-900 font-normal mt-2">
            {t.title}
          </h1>
          <p className="text-sm text-zinc-600 mt-3 max-w-2xl leading-relaxed">
            {t.subtitle}
          </p>
        </div>
      </div>

      <TwoPathsSection lang={lang} onOpenRegisterModal={openRegister} />
    </div>
  );
}
