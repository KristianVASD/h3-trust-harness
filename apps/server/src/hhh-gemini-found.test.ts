import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GeminiCheckSchema,
  companiesWithLocalMention,
  selectFreshFound,
  type GeminiCandidate,
} from "@h3-trust/schema";

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
