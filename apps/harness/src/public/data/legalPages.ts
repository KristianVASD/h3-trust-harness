import type { Language } from "../types";

export type LegalSlug = "privacy" | "cookies" | "voorwaarden";

type LegalDoc = {
  title: string;
  sections: { heading: string; body: string[] }[];
};

const NL: Record<LegalSlug, LegalDoc> = {
  privacy: {
    title: "Privacyverklaring",
    sections: [
      {
        heading: "Wie we zijn",
        body: [
          "H3 Trust is een niet-commerciële laag die openbare zakelijke vermeldingen bundelt, zodat huishoudens lokale vakmensen op herkomst kunnen vinden — niet op advertentiebudget. H3 Trust verdient niet aan deze lijst. HandyHouseHelp is een apart platform dat die herkomst kan gebruiken om lokaal te verbinden.",
          "Dit is een werkdocument. Laat het toetsen door een jurist vóór livegang of voordat verenigingen tekenen.",
        ],
      },
      {
        heading: "Welke gegevens",
        body: [
          "Publiek tonen we: bedrijfsnaam, plaats/regio, vak, KvK-nummer als ondernemingsidentiteit, en herkomst (“vermeld bij …”). Geen telefoon of e-mail uit verenigingsbestanden, geen namen van bestuursleden of vrijwilligers, geen zwarte lijst.",
          "Volle gegevens van aangesloten bedrijven die een vereniging of sector beheert, tonen we alleen als die bronhouder dat uitdrukkelijk vraagt. Een vinkje in het aanmeldformulier is een verzoek, geen automatische verruiming van het publieke kaartje.",
          "Eenmanszaak-namen zijn persoonsgegevens, ook als ze openbaar zijn. We verwerken ze als bedrijfsidentiteit, niet als privéprofiel.",
          "Als je jezelf aanmeldt, bewaren we contactnaam, e-mail, vestigingsadres en (voor bronhouders) organisatie, soort bron en of jullie volle ledengegevens in de app willen — alleen om de aanmelding te behandelen.",
        ],
      },
      {
        heading: "Grondslag",
        body: [
          "Openbare bedrijfsvermeldingen: gerechtvaardigd belang (zichtbaarheid van lokale vakmensen, minder mismatch via gekochte SEO), met belangenafweging en recht van bezwaar.",
          "Zelf-aanmelding: toestemming / behandeling van je verzoek.",
          "Bronhouder-koppeling: overeenkomst of gezamenlijke afspraak; jullie blijven eigenaar van het lidmaatschapssignaal.",
        ],
      },
      {
        heading: "Rechten",
        body: [
          "Je kunt inzage, correctie of bezwaar vragen via “Gegevens kloppen niet”. Een mens behandelt de melding. We publiceren geen geautomatiseerd oordeel over personen of bedrijven.",
        ],
      },
      {
        heading: "Bewaartermijn",
        body: [
          "Aanmeldingen en correctiemeldingen: tot 24 maanden, of korter als de behandeling klaar is en er geen wettelijke plicht tot bewaren is. Onderzoeksdata in de harness is intern en niet het publieke register.",
        ],
      },
    ],
  },
  cookies: {
    title: "Cookies",
    sections: [
      {
        heading: "Functionele cookie",
        body: [
          "We zetten een functionele cookie h3_search_session (en zo nodig een gelijkwaardige header of localStorage) om het aantal anonieme zoekopdrachten per sessie te begrenzen. Geen tracking voor advertenties, geen verkoop van profielen.",
          "Zonder deze cookie werkt de zoekquota niet betrouwbaar. Er is geen marketing-cookieband nodig zolang we geen niet-functionele cookies plaatsen.",
        ],
      },
    ],
  },
  voorwaarden: {
    title: "Gebruiksvoorwaarden",
    sections: [
      {
        heading: "Wat deze site is",
        body: [
          "H3 toont bedrijfsnamen op herkomst. Wie op minstens één door mensen aanvaarde bron staat, kan getoond worden. We zetten niemand op een zwarte lijst en beloven geen ranking.",
          "H3 Trust verdient niet aan de harness. Vermelding is geen keurmerk-oordeel en geen garantie op kwaliteit van uitgevoerd werk.",
        ],
      },
      {
        heading: "Bronhouders",
        body: [
          "Branche, keurmerk, ondernemerskring of club blijven eigenaar van hun signaal. Standaard tonen we de bedrijfsnaam en plaats. Volle, door jullie beheerde ledengegevens alleen als jullie dat vragen. Privépersonen op een leden- of sponsorlijst horen niet in het publieke register.",
        ],
      },
      {
        heading: "Correctie",
        body: [
          "Klopt iets niet, of wilt u niet getoond worden: gebruik “Gegevens kloppen niet”. Een mens bekijkt het verzoek.",
        ],
      },
    ],
  },
};

const EN: Record<LegalSlug, LegalDoc> = {
  privacy: {
    title: "Privacy notice",
    sections: [
      {
        heading: "Who we are",
        body: [
          "H3 Trust is a non-commercial layer that gathers public business listings so households can find local trades by provenance — not by ad spend. H3 Trust does not earn from this list. HandyHouseHelp is a separate platform that may use that provenance to connect locally.",
          "This is a working draft. Have a lawyer review it before going live or before associations sign.",
        ],
      },
      {
        heading: "What we process",
        body: [
          "In public we show: company name, city/region, trade, Chamber of Commerce number as business identity, and provenance (“listed with …”). No phone or email from association files, no names of board members or volunteers, no blacklist.",
          "Fuller data of member firms that an association or sector already manages is shown only if that source holder explicitly asks. A tick on the application form is a request, not an automatic expansion of the public card.",
          "Sole-trader names are personal data even when public. We process them as business identity, not as a private profile.",
          "If you apply, we keep contact name, email, establishment address and (for source holders) organisation, kind of source, and whether you want fuller member data in the app — only to handle the application.",
        ],
      },
      {
        heading: "Legal basis",
        body: [
          "Public business listings: legitimate interest (visibility of local trades, less mismatch via bought SEO), with a balancing test and a right to object.",
          "Self-application: consent / handling your request.",
          "Source-holder link: agreement; you remain owner of the membership signal.",
        ],
      },
      {
        heading: "Rights",
        body: [
          "You can ask for access, correction or objection via “Something is wrong”. A human handles the report. We do not publish an automated verdict on people or companies.",
        ],
      },
      {
        heading: "Retention",
        body: [
          "Applications and correction reports: up to 24 months, or shorter when handling is done and no legal duty to keep remains. Investigation data in the harness is internal, not the public register.",
        ],
      },
    ],
  },
  cookies: {
    title: "Cookies",
    sections: [
      {
        heading: "Functional cookie",
        body: [
          "We set a functional cookie h3_search_session (and if needed an equivalent header or localStorage) to cap anonymous searches per session. No ad tracking, no sale of profiles.",
          "Without this cookie search quota is unreliable. No marketing cookie banner is needed while we place no non-functional cookies.",
        ],
      },
    ],
  },
  voorwaarden: {
    title: "Terms of use",
    sections: [
      {
        heading: "What this site is",
        body: [
          "H3 shows company names by provenance. Anyone on at least one human-accepted source may be shown. We do not blacklist anyone and we do not promise ranking.",
          "H3 Trust does not earn from the harness. A listing is not a quality-mark verdict and not a guarantee of workmanship.",
        ],
      },
      {
        heading: "Source holders",
        body: [
          "Trade bodies, quality marks, business circles or clubs remain owner of their signal. By default we show company name and place. Fuller member data you already manage is shown only if you ask. Private persons on a member or sponsor list do not belong in the public register.",
        ],
      },
      {
        heading: "Correction",
        body: [
          "If something is wrong, or you do not want to be shown: use “Something is wrong”. A human reviews the request.",
        ],
      },
    ],
  },
};

export function legalDoc(lang: Language, slug: LegalSlug): LegalDoc {
  return (lang === "en" ? EN : NL)[slug];
}
