import { CraftsmanJoinForm } from "../components/CraftsmanJoinForm";
import { translations } from "../data/translations";
import { usePublic } from "../PublicContext";

export function PublicJoinPage() {
  const { lang } = usePublic();
  const t = translations[lang].craftsmanPage;

  return (
    <div className="public-home">
      <div className="hero">
        <p className="eyebrow">{t.eyebrow}</p>
        <h1>{t.headline}</h1>
        <p className="lead">{t.lead}</p>
      </div>

      <section>
        <div className="grid">
          {t.benefits.map((item) => (
            <div className="card" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>{t.notTitle}</h2>
        <ul className="not">
          {t.notItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section id="aanmelden">
        <h2>{t.formTitle}</h2>
        <p>{t.formIntro}</p>
        <CraftsmanJoinForm lang={lang} />
      </section>
    </div>
  );
}
