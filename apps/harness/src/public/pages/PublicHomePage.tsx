import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { AssociationJoinForm } from "../components/AssociationJoinForm";
import { translations } from "../data/translations";
import { usePublic } from "../PublicContext";

export function PublicHomePage() {
  const { lang } = usePublic();
  const location = useLocation();
  const t = translations[lang].homeShell;

  useEffect(() => {
    const id = location.hash.replace("#", "");
    if (!id) return;
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }, [location.hash]);

  return (
    <div className="public-home">
      <div className="hero" id="voor-verenigingen">
        <p className="eyebrow">{t.eyebrow}</p>
        <h1>{t.headline}</h1>
        <p className="lead">{t.lead}</p>
        <div className="actions">
          <a className="public-btn" href="#aanmelden">
            {t.ctaPrimary}
          </a>
          <a className="public-btn public-btn-ghost" href="#hoe-het-werkt">
            {t.ctaSecondary}
          </a>
        </div>
      </div>

      <section>
        <h2>{t.benefitsTitle}</h2>
        <div className="grid">
          {t.benefits.map((item) => (
            <div className="card" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="hoe-het-werkt">
        <h2>{t.stepsTitle}</h2>
        <ol className="steps">
          {t.steps.map((item) => (
            <li key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2>{t.notTitle}</h2>
        <ul className="not">
          {t.notItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t.statusTitle}</h2>
        <p>{t.statusIntro}</p>
        <ul className="status">
          {t.statuses.map((item) => (
            <li key={item.title}>
              <strong>{item.title}</strong>
              <span>{item.body}</span>
            </li>
          ))}
        </ul>
      </section>

      <section id="aanmelden">
        <h2>{t.formTitle}</h2>
        <p>{t.formIntro}</p>
        <AssociationJoinForm lang={lang} />
      </section>

      <section id="vakbedrijven">
        <h2>{t.routesTitle}</h2>
        <div className="grid routes">
          <Link className="card" to="/join">
            <h3>{t.tradeTitle}</h3>
            <p>{t.tradeBody}</p>
          </Link>
          <Link className="card" to="/sectoren">
            <h3>{t.branchTitle}</h3>
            <p>{t.branchBody}</p>
          </Link>
        </div>
      </section>
    </div>
  );
};
