import { translations } from "../data/translations";
import { legalDoc, type LegalSlug } from "../data/legalPages";
import { usePublic } from "../PublicContext";

export function PublicLegalPage({ slug }: { slug: LegalSlug }) {
  const { lang } = usePublic();
  const doc = legalDoc(lang, slug);
  const note = translations[lang].legal.lawyerNote;

  return (
    <div className="public-section">
      <div className="public-page-card px-5 sm:px-8 lg:px-12 py-8 sm:py-12 max-w-3xl">
        <p className="text-xs font-mono uppercase tracking-widest text-[#1E3A2F] font-semibold mb-2">
          H3 Trust
        </p>
        <h1 className="font-serif text-3xl sm:text-4xl text-zinc-900 font-normal">
          {doc.title}
        </h1>
        <p className="text-xs text-zinc-500 mt-3 leading-relaxed">{note}</p>
        <div className="mt-8 space-y-8">
          {doc.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="font-serif text-xl text-zinc-900 mb-2">
                {section.heading}
              </h2>
              {section.body.map((p) => (
                <p
                  key={p.slice(0, 40)}
                  className="text-sm text-zinc-600 leading-relaxed mb-3"
                >
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
