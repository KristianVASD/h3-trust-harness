import React from "react";
import { AssociationJoinForm } from "./AssociationJoinForm";
import { translations } from "../data/translations";
import type { Language } from "../types";

interface SectorsPageProps {
  lang: Language;
}

export const SectorsPage: React.FC<SectorsPageProps> = ({ lang }) => {
  const t = translations[lang].sectorsPage;
  const forms = translations[lang].joinForms;
  const cards = [
    { title: t.card1Title, body: t.card1Desc },
    { title: t.card2Title, body: t.card2Desc },
    { title: t.card3Title, body: t.card3Desc },
  ] as const;

  return (
    <div className="public-home">
      <div className="hero">
        <p className="eyebrow">{t.badge}</p>
        <h1>{t.title}</h1>
        <p className="lead">{t.intro}</p>
        <p className="lead">{t.money}</p>
      </div>

      <section>
        <div className="grid">
          {cards.map((card) => (
            <div className="card" key={card.title}>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>{t.questionTitle}</h2>
        <p>{t.question}</p>
      </section>

      <section id="aanmelden">
        <h2>{t.ctaTitle}</h2>
        <p>{t.ctaBody}</p>
        <AssociationJoinForm
          lang={lang}
          sourceHolderKind="sector"
          orgLabel={forms.organization}
        />
      </section>
    </div>
  );
};
