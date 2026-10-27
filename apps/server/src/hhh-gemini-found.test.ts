import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GeminiCheckSchema,
  cardFromFound,
  companiesFromSearch,
  companiesWithLocalMention,
  directoryHostsIn,
  reviewFoundFirms,
  selectFoundFirms,
  selectFreshFound,
  type GeminiCandidate,
} from "@h3-trust/schema";
import { partnerCardsFromSearch } from "./hhh-gemini-run.js";
import { proposedCandidates } from "./hhh-gemini-search.js";

const alkmaarCheck = GeminiCheckSchema.parse({
  place: "Alkmaar",
  trade: "installatie",
  checked_on: "2026-10-18",
  sources: [
    {
      id: "s1",
      name: "Bedrijvenvereniging Beverkoog",
      url: "https://beverkoog.nl/bedrijfsregister",
      category: "local_business_association",
      scope: "local",
      place: "Alkmaar",
      description: "Openbaar bedrijvenregister van industrieterrein Beverkoog",
      list_public: true,
    },
    {
      id: "s1b",
      name: "Bedrijvenvereniging Beverkoog",
      url: "https://beverkoog.nl/leden",
      category: "local_business_association",
      scope: "local",
      place: "Alkmaar",
      description: "Tweede pagina van hetzelfde register",
      list_public: true,
    },
    {
      id: "s2",
      name: "AFC '34 Alkmaar",
      url: "https://afc34.nl/sponsoring/",
      category: "sports_club",
      scope: "local",
      place: "Alkmaar",
      description: "Sponsorpagina van voetbalvereniging AFC '34",
      list_public: true,
    },
    {
      id: "s3",
      name: "8 October Vereeniging",
      url: "https://8october.nl/sponsoren/",
      category: "festivity",
      scope: "local",
      place: "Alkmaar",
      description: "Sponsorpagina van de 8 October Vereeniging",
      list_public: true,
    },
    {
      id: "s4",
      name: "v.v. Alkmaarsche Boys",
      url: "https://alkmaarscheboys.nl/sponsoren",
      category: "sports_club",
      scope: "local",
      place: "Alkmaar",
      description: "Sponsoroverzicht van v.v. Alkmaarsche Boys",
      list_public: true,
    },
    {
      id: "s5",
      name: "NVKL",
      url: "https://nvkl.nl/leden",
      category: "branch_association",
      scope: "national",
      description: "Landelijk koude- en klimaatcertificaat",
      list_public: true,
    },
    {
      id: "s6",
      name: "Coppens Alkmaar",
      url: "https://coppensalkmaar.nl/over-ons",
      category: "local_business_association",
      scope: "local",
      description: "Eigen website",
      list_public: true,
    },
  ],
  companies: [
    {
      name: "Coppens Alkmaar",
      place: "Alkmaar",
      phone: "072 - 511 42 30",
      email: "info@coppensalkmaar.nl",
      website: "https://coppensalkmaar.nl",
      claims: [
        {
          kind: "ov",
          outcome: "member",
          about: "company",
          org_name: "Bedrijvenvereniging Beverkoog",
          relation: "Vermeld in het bedrijvenregister van industrieterrein Beverkoog",
          source_ids: ["s1", "s1b"],
          pages_checked: ["https://beverkoog.nl/bedrijfsregister"],
          note: "Vermeld als Coppens Alkmaar BV",
        },
        {
          kind: "sports_club",
          outcome: "sponsor",
          about: "company",
          org_name: "AFC '34",
          relation: "Kledingsponsor van AFC '34",
          source_ids: ["s2"],
          pages_checked: ["https://afc34.nl/sponsoring/"],
          note: null,
        },
        {
          kind: "ov",
          outcome: "member",
          about: "company",
          org_name: "Coppens Alkmaar",
          relation: "Staat op de eigen site",
          source_ids: ["s6"],
          pages_checked: [],
          note: null,
        },
      ],
    },
    {
      name: "Installatiebedrijf Kusch",
      place: "Alkmaar",
      phone: "072 - 562 34 34",
      email: "info@kuschalkmaar.nl",
      website: "https://www.kuschalkmaar.nl",
      claims: [
        {
          kind: "ov",
          outcome: "member",
          about: "company",
          org_name: "Bedrijvenvereniging Beverkoog",
          relation: "Vermeld in het bedrijvenregister van industrieterrein Beverkoog",
          source_ids: ["s1"],
          pages_checked: ["https://beverkoog.nl/bedrijfsregister"],
          note: null,
        },
        {
          kind: "festivity",
          outcome: "sponsor",
          about: "company",
          org_name: "8 October Vereeniging",
          relation: "Sponsor van Alkmaar Ontzet",
          source_ids: ["s3"],
          pages_checked: ["https://8october.nl/sponsoren/"],
          note: null,
        },
        {
          kind: "sports_club",
          outcome: "sponsor",
          about: "company",
          org_name: "v.v. Alkmaarsche Boys",
          relation: "Bordsponsor van Alkmaarsche Boys",
          source_ids: ["s4"],
          pages_checked: ["https://alkmaarscheboys.nl/sponsoren"],
          note: null,
        },
      ],
    },
    {
      name: "Alleen Certificaat",
      website: "https://cert.example",
      claims: [
        {
          kind: "ov",
          outcome: "member",
          about: "company",
          org_name: "NVKL",
          relation: "Lid van NVKL",
          source_ids: ["s5"],
          pages_checked: [],
          note: null,
        },
      ],
    },
    {
      name: "Joost Beers Installatietechniek",
      website: "https://www.joostbeers.nl",
      claims: [
        {
          kind: "ov",
          outcome: "mentioned",
          about: "person",
          org_name: "Ondernemersvereniging Oudorp",
          relation: "Een andere Joost Beers stond op een kandidatenlijst",
          source_ids: ["s1"],
          pages_checked: [],
          note: null,
        },
      ],
    },
  ],
});

const candidates: GeminiCandidate[] = [
  {
    name: "Coppens Alkmaar",
    website: "https://coppensalkmaar.nl",
    address: "Berenkoog 110, Alkmaar",
    phone: "072 - 511 42 30",
    email: "info@coppensalkmaar.nl",
  },
  {
    name: "Installatiebedrijf Kusch",
    website: "https://www.kuschalkmaar.nl",
    address: "Hazenkoog 12, Alkmaar",
    phone: "072 - 562 34 34",
    email: "info@kuschalkmaar.nl",
  },
  {
    name: "Loodgietersbedrijf Rob Houtkooper",
    website: "https://robhoutkooper.nl",
    address: "Alkmaar",
    phone: "06 - 13 93 88 99",
    email: "",
  },
  {
    name: "Alleen Certificaat",
    website: "https://cert.example",
    address: "",
    phone: "",
    email: "",
  },
  {
    name: "Joost Beers Installatietechniek",
    website: "https://www.joostbeers.nl",
    address: "Oudorp",
    phone: "",
    email: "",
  },
];

describe("gemini local mention gate", () => {
  it("keeps firms with a local mention and scores unique sources up to 4", () => {
    const found = companiesWithLocalMention(candidates, alkmaarCheck);
    assert.deepEqual(
      found.map((row) => row.name),
      ["Installatiebedrijf Kusch", "Coppens Alkmaar"],
    );
    const kusch = found[0]!;
    const coppens = found[1]!;
    assert.equal(kusch.sourceCount, 3);
    assert.equal(kusch.hits.length, 3);
    assert.equal(coppens.sourceCount, 2);
    assert.equal(coppens.hits.length, 2);
    assert.equal(
      coppens.hits.some((hit) => hit.host === "coppensalkmaar.nl"),
      false,
    );
    assert.match(kusch.matchNote, /Beverkoog/);
    assert.match(kusch.matchNote, /Ontzet/);
  });

  it("caps the quality band at 4 and still lists the fifth source", () => {
    const check = GeminiCheckSchema.parse({
      sources: [1, 2, 3, 4, 5].map((n) => ({
        id: `p${n}`,
        name: `Club ${n}`,
        url: `https://club${n}.nl/sponsors`,
        category: "sponsorship",
        scope: "local",
      })),
      companies: [
        {
          name: "Vijf Bronnen",
          website: "https://vijf.example",
          claims: [1, 2, 3, 4, 5].map((n) => ({
            kind: "sport",
            outcome: "sponsor",
            about: "company",
            org_name: `Club ${n}`,
            relation: `Sponsor van club ${n}`,
            source_ids: [`p${n}`],
          })),
        },
      ],
    });
    const found = companiesWithLocalMention(
      [{ name: "Vijf Bronnen", website: "https://vijf.example", address: "", phone: "", email: "" }],
      check,
    );
    assert.equal(found.length, 1);
    assert.equal(found[0]!.sourceCount, 4);
    assert.equal(found[0]!.hits.length, 5);
  });
});

describe("first search firms", () => {
  it("keeps a named firm when its site was not in the citations and drops a lead site", () => {
    const kept = selectFoundFirms([
      {
        name: "Dakdekkersbedrijf Zundert",
        website: "https://dakdekker-zundert.nl",
        address: "Molenstraat 1, Zundert",
        phone: "076 123 4567",
        email: "",
      },
      {
        name: "Werkspot",
        website: "https://www.werkspot.nl/dakdekker",
        address: "",
        phone: "085 123 4567",
        email: "",
      },
    ]);
    assert.deepEqual(
      kept.map((row) => row.name),
      ["Dakdekkersbedrijf Zundert"],
    );
  });

  it("keeps a named firm that has a phone and no website", () => {
    const read = proposedCandidates({
      companies: [
        {
          name: "Loodgietersbedrijf De Bollen",
          website: "",
          address: "Heereweg 12, Lisse",
          phone: "0252 412 345",
          email: "",
        },
      ],
    });
    const kept = reviewFoundFirms(read).kept;
    assert.equal(kept.length, 1);
    assert.equal(kept[0]?.name, "Loodgietersbedrijf De Bollen");
    assert.equal(kept[0]?.website, "");
    assert.equal(kept[0]?.phone, "0252 412 345");
  });

  it("sends a firm with a local mention as locally known and keeps phone and email", () => {
    const [known] = companiesFromSearch([candidates[0]!], alkmaarCheck);
    const card = cardFromFound({
      id: "11111111-1111-4111-8111-111111111111",
      row: known!,
      place: "Alkmaar",
      tradeId: "hvac",
      observedAt: "2026-10-26T00:00:00.000Z",
    });
    assert.equal(card.status, "lokaal_verbonden");
    assert.equal(card.phone, "072 - 511 42 30");
    assert.equal(card.email, "info@coppensalkmaar.nl");
    assert.ok(card.evidence.some((item) => item.kind === "ov"));
  });

  it("sends phone and email as gevonden when there is no local mention", () => {
    const listed = partnerCardsFromSearch(
      [
        {
          name: "Dakenonderhoud",
          website: "http://dakenenonderhoud.nl",
          address: "Vennestraat 56c, Lisse",
          phone: "06 29086861",
          email: "info@dakenenonderhoud.nl",
        },
      ],
      "Lisse",
      "roof",
    );
    assert.equal(listed.companies.length, 1);
    assert.equal(listed.companies[0]?.status, "gevonden");
    assert.equal(listed.companies[0]?.phone, "06 29086861");
    assert.equal(listed.companies[0]?.email, "info@dakenenonderhoud.nl");
    assert.equal(listed.companies[0]?.sourceCount, 1);
    assert.deepEqual(
      listed.companies[0]?.evidence.map((item) => item.kind),
      ["search"],
    );
  });

  it("reads a Dutch naam and telefoon", () => {
    const read = proposedCandidates({
      companies: [{ naam: "Loodgietersbedrijf De Bollen", telefoon: "0252 412 345", adres: "Heereweg 12, Lisse" }],
    });
    const kept = reviewFoundFirms(read).kept;
    assert.equal(kept.length, 1);
    assert.equal(kept[0]?.name, "Loodgietersbedrijf De Bollen");
    assert.equal(kept[0]?.phone, "0252 412 345");
    assert.equal(kept[0]?.address, "Heereweg 12, Lisse");
  });
});

describe("first search is enough", () => {
  it("keeps a firm the search found when no club page names it", () => {
    const found = companiesFromSearch(
      [
        candidates[0]!,
        {
          name: "Facilitair Totaal Zundert",
          website: "https://facilitairtotaalzundert.nl/klus-onderhoud",
          address: "Achtmaalseweg 80, 4881 VM Zundert",
          phone: "06-29005196",
          email: "info@facilitairtotaalzundert.nl",
        },
      ],
      alkmaarCheck,
    );
    const local = found.find((row) => row.name === "Facilitair Totaal Zundert");
    assert.ok(local);
    assert.equal(local.hits[0]?.kind, "search");
    assert.equal(found.some((row) => row.name === "Coppens Alkmaar" && row.sourceCount === 2), true);
  });
});

describe("model words for a football sponsor", () => {
  it("keeps kind sponsor and category football_club as one sport source", () => {
    const check = GeminiCheckSchema.parse({
      sources: [
        {
          id: "s1",
          name: "Bedrijvenvereniging Beverkoog",
          url: "https://www.beverkoog.nl/bedrijf-beverkoog/coppens-alkmaar-bv",
          category: "local_business_association",
          scope: "local",
          place: "Alkmaar",
        },
        {
          id: "s2",
          name: "Alkmaarsche Boys",
          url: "https://www.alkmaarscheboys.nl/248/3963/nieuws-van-de-sponsorcommissie/",
          category: "football_club",
          scope: "local",
          place: "Alkmaar",
        },
      ],
      companies: [
        {
          name: "Coppens Alkmaar",
          phone: "072 - 511 42 30",
          email: "info@coppensalkmaar.nl",
          website: "https://coppensalkmaar.nl",
          claims: [
            {
              kind: "ov",
              outcome: "member",
              about: "company",
              org_name: "Bedrijvenvereniging Beverkoog",
              relation: "Vermeld in het bedrijfsregister van het industrieterrein",
              source_ids: ["s1"],
            },
          ],
        },
        {
          name: "Installatiebedrijf Kusch",
          phone: "072 - 562 34 34",
          email: "info@kuschalkmaar.nl",
          website: "https://www.kuschalkmaar.nl",
          claims: [
            {
              kind: "sponsor",
              outcome: "sponsor",
              about: "company",
              org_name: "Alkmaarsche Boys",
              relation: "Sponsor van voetbalclub Alkmaarsche Boys",
              source_ids: ["s2"],
            },
          ],
        },
      ],
    });
    const found = companiesWithLocalMention(
      [
        {
          name: "Coppens Alkmaar",
          website: "https://coppensalkmaar.nl",
          address: "",
          phone: "",
          email: "",
        },
        {
          name: "Installatiebedrijf Kusch",
          website: "https://www.kuschalkmaar.nl",
          address: "",
          phone: "",
          email: "",
        },
      ],
      check,
    );
    assert.deepEqual(
      found.map((row) => [row.name, row.sourceCount, row.hits[0]?.kind]),
      [
        ["Coppens Alkmaar", 1, "ov"],
        ["Installatiebedrijf Kusch", 1, "sport"],
      ],
    );
  });
});

describe("a phone book is not local presence", () => {
  const painters: GeminiCandidate[] = [
    {
      name: "Schildersbedrijf Van der Zaal",
      website: "https://schildersbedrijfvanderzaal.nl",
      address: "Meer en Duin 8a, Lisse",
      phone: "0252 414150",
      email: "",
    },
    {
      name: "Marseille Schilders BV",
      website: "https://marseille-schilders.nl",
      address: "Vennestraat 52k, Lisse",
      phone: "0252 422629",
      email: "",
    },
    {
      name: "Daudeij Schilderwerken",
      website: "https://daudeijschilderwerken.nl",
      address: "Meer en Duin 80, Lisse",
      phone: "0252 506924",
      email: "",
    },
    {
      name: "Schildersbedrijf Van Beek",
      website: "https://schildersbedrijfvanbeek.nl",
      address: "Nassaupark 67, Lisse",
      phone: "06 53264413",
      email: "",
    },
    {
      name: "TKN-Schildersbedrijf",
      website: "https://tkn-schildersbedrijf.nl",
      address: "Rosa Spierstraat 7, Lisse",
      phone: "06 14629884",
      email: "",
    },
  ];

  const lisseCheck = GeminiCheckSchema.parse({
    place: "Lisse",
    trade: "schilder",
    sources: [
      {
        id: "reg",
        name: "Bedrijvenregister.nl – Schilderen en glaszetten in Lisse",
        url: "https://www.bedrijvenregister.nl/schilderen-en-glaszetten/lisse",
        category: "local_business_association",
        scope: "local",
      },
      {
        id: "tel",
        name: "Telefoonboek.nl – Schilders Lisse",
        url: "https://www.telefoonboek.nl/zoeken/schilders/lisse/",
        category: "local_business_association",
        scope: "local",
      },
      {
        id: "fc",
        name: "FC Lisse",
        url: "https://fclisse.nl/sponsors",
        category: "football_club",
        scope: "local",
        place: "Lisse",
      },
      {
        id: "portaal",
        name: "FC Lisse SponsorPortaal",
        url: "https://fclisse.nl/sponsorportaal",
        category: "sponsorship",
        scope: "local",
        place: "Lisse",
      },
      {
        id: "krant",
        name: "Lisse Krant",
        url: "https://www.lissekrant.nl/bedrijvengids",
        category: "local_press",
        scope: "local",
        place: "Lisse",
      },
    ],
    companies: [
      {
        name: "Schildersbedrijf Van der Zaal",
        website: "https://schildersbedrijfvanderzaal.nl",
        claims: [
          {
            kind: "ov",
            outcome: "mentioned",
            about: "company",
            org_name: "Bedrijvenregister",
            relation: "Vermeld in het bedrijvenregister met SBI-code 4334 in Lisse.",
            source_ids: ["reg", "tel"],
          },
          {
            kind: "sport",
            outcome: "sponsor",
            about: "company",
            org_name: "FC Lisse",
            relation: "Balsponsor van FC Lisse bij thuiswedstrijden",
            source_ids: ["fc"],
          },
        ],
      },
      {
        name: "Marseille Schilders BV",
        website: "https://marseille-schilders.nl",
        claims: [
          {
            kind: "sponsor",
            outcome: "sponsor",
            about: "company",
            org_name: "FC Lisse",
            relation: "Opgenomen in het SponsorPortaal van FC Lisse",
            source_ids: ["portaal", "tel"],
          },
        ],
      },
      {
        name: "Daudeij Schilderwerken",
        website: "https://daudeijschilderwerken.nl",
        claims: [
          {
            kind: "ov",
            outcome: "mentioned",
            about: "company",
            relation: "Vermeld in de telefoongids voor schilders in Lisse.",
            source_ids: ["tel", "reg"],
          },
        ],
      },
      {
        name: "Schildersbedrijf Van Beek",
        website: "https://schildersbedrijfvanbeek.nl",
        claims: [
          {
            kind: "press",
            outcome: "mentioned",
            about: "company",
            org_name: "Lisse Krant",
            relation: "Vermeld in de bedrijvengids van de Lisse Krant",
            source_ids: ["krant"],
          },
        ],
      },
      {
        name: "TKN-Schildersbedrijf",
        website: "https://tkn-schildersbedrijf.nl",
        claims: [
          {
            kind: "ov",
            outcome: "mentioned",
            about: "company",
            org_name: "Lijst",
            relation: "Vermeld in het bedrijvenregister met SBI-code 4334 in Lisse.",
            source_ids: ["reg"],
          },
        ],
      },
    ],
  });

  it("keeps the club and the local paper, and drops the shared directory lines", () => {
    assert.deepEqual(directoryHostsIn(lisseCheck), ["bedrijvenregister.nl", "telefoonboek.nl"]);
    const found = companiesFromSearch(painters, lisseCheck);
    const zaal = found.find((row) => row.name === "Schildersbedrijf Van der Zaal");
    const marseille = found.find((row) => row.name === "Marseille Schilders BV");
    const daudeij = found.find((row) => row.name === "Daudeij Schilderwerken");
    const beek = found.find((row) => row.name === "Schildersbedrijf Van Beek");
    const tkn = found.find((row) => row.name === "TKN-Schildersbedrijf");
    assert.equal(zaal?.matchNote, "Balsponsor van FC Lisse bij thuiswedstrijden");
    assert.equal(zaal?.hits[0]?.kind, "sport");
    assert.equal(zaal?.hits.some((hit) => hit.host === "telefoonboek.nl" || hit.host === "bedrijvenregister.nl"), false);
    assert.equal(marseille?.matchNote, "Opgenomen in het SponsorPortaal van FC Lisse");
    assert.equal(marseille?.sourceCount, 1);
    assert.match(daudeij?.matchNote ?? "", /eerste zoekstap/);
    assert.deepEqual(daudeij?.hits.map((hit) => hit.kind), ["search"]);
    assert.equal(beek?.matchNote, "Vermeld in de bedrijvengids van de Lisse Krant");
    assert.equal(beek?.hits[0]?.kind, "ov");
    assert.match(tkn?.matchNote ?? "", /eerste zoekstap/);
    const card = cardFromFound({
      id: "11111111-1111-4111-8111-111111111111",
      row: zaal!,
      place: "Lisse",
      tradeId: "paint",
      observedAt: "2026-10-27T07:29:23.815Z",
    });
    assert.equal(card.status, "lokaal_verbonden");
    const plain = cardFromFound({
      id: "22222222-2222-4222-8222-222222222222",
      row: daudeij!,
      place: "Lisse",
      tradeId: "paint",
      observedAt: "2026-10-27T07:29:23.815Z",
    });
    assert.equal(plain.status, "gevonden");
  });

  it("drops an SBI sentence even when the host is not a known directory", () => {
    const check = GeminiCheckSchema.parse({
      sources: [
        {
          id: "s1",
          name: "Lijst",
          url: "https://ergens-lokaal.nl/schilders",
          category: "local_business_association",
          scope: "local",
        },
      ],
      companies: [
        {
          name: "Daudeij Schilderwerken",
          website: "https://daudeijschilderwerken.nl",
          claims: [
            {
              kind: "ov",
              outcome: "mentioned",
              about: "company",
              org_name: "Bedrijvenregister",
              relation: "Vermeld in het bedrijvenregister met SBI-code 4334 in Lisse.",
              source_ids: ["s1"],
            },
          ],
        },
      ],
    });
    const found = companiesWithLocalMention(
      [
        {
          name: "Daudeij Schilderwerken",
          website: "https://daudeijschilderwerken.nl",
          address: "",
          phone: "",
          email: "",
        },
      ],
      check,
    );
    assert.equal(found.length, 0);
  });
});

describe("stored gevonden lookup", () => {
  const fresh = "2027-01-01T00:00:00.000Z";
  const now = Date.parse("2026-10-18T12:00:00.000Z");

  it("returns gevonden firms and skips a knocked-out firm and a recommendation", () => {
    const companies = selectFreshFound(
      [
        {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Kusch",
          website_url: "https://kusch.example",
          localAuthenticity: { verdict: "thin_local" },
          partnerTrust: {
            status: "gevonden",
            tradeId: "bath",
            postcode4: "1811",
            score: 3,
            elementCodes: [],
            facts: [
              {
                kind: "ov",
                sourceUrl: "https://beverkoog.nl/bedrijfsregister",
                sourceName: "Beverkoog",
                observedAt: "2026-10-18T00:00:00.000Z",
                expiresAt: fresh,
              },
            ],
          },
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          name: "Nep Lokaal",
          website_url: "https://nep.example",
          localAuthenticity: { verdict: "fake_local" },
          partnerTrust: {
            status: "gevonden",
            tradeId: "bath",
            postcode4: "1811",
            score: 2,
            elementCodes: [],
            facts: [
              {
                kind: "sport",
                sourceUrl: "https://club.example/sponsors",
                observedAt: "2026-10-18T00:00:00.000Z",
                expiresAt: fresh,
              },
            ],
          },
        },
        {
          id: "33333333-3333-4333-8333-333333333333",
          name: "Aanbevolen",
          website_url: "https://tip.example",
          partnerTrust: {
            status: "aanbevolen_door_klant",
            tradeId: "bath",
            postcode4: "1811",
            score: 4,
            elementCodes: [],
            facts: [
              {
                kind: "ov",
                sourceUrl: "https://ov.example",
                observedAt: "2026-10-18T00:00:00.000Z",
                expiresAt: fresh,
              },
            ],
          },
        },
      ],
      { tradeId: "bath", postcode4: "1811" },
      now,
    );
    assert.deepEqual(
      companies.map((company) => company.name),
      ["Kusch"],
    );
  });
});
