import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  acceptLocalPage,
  companyNameOnPage,
  companySiteFromEmail,
  decideRecommendation,
  domainAgeYears,
  geographicPhones,
  inviteAddress,
  inviteStillFresh,
  knownAreaCodes,
  matchingGeographicPhone,
  phoneMatchesArea,
  placeInSiteIdentity,
  recommendationCard,
  recommendationKeepsSearchStatus,
  recommendationLetter,
  registrationMillis,
  tradeIdentityNames,
  type RecommendationSignals,
  cardFromStoredFound,
} from "@h3-trust/schema";

const NOW = Date.parse("2026-10-31T12:00:00.000Z");

function openGate(patch: Partial<RecommendationSignals> = {}): RecommendationSignals {
  return {
    siteLoaded: true,
    nameOnPage: true,
    tradeMatch: true,
    fakeLocal: false,
    leadHost: false,
    platformHost: false,
    geographicPhone: true,
    areaKnown: true,
    areaMatched: true,
    domainAgeYears: 12,
    placeInIdentity: false,
    localMention: false,
    ...patch,
  };
}

describe("recommendation site", () => {
  it("uses the email domain as the company site", () => {
    const site = companySiteFromEmail("info@jansenschilders.nl");
    assert.equal(site.ok, true);
    if (!site.ok) return;
    assert.equal(site.host, "jansenschilders.nl");
    assert.equal(site.website, "https://jansenschilders.nl");
  });

  it("drops a free mailbox, a platform, and a lead site", () => {
    assert.equal(companySiteFromEmail("jan@gmail.com").ok, false);
    assert.equal(companySiteFromEmail("jan@wixsite.com").ok, false);
    assert.equal(companySiteFromEmail("info@werkspot.nl").ok, false);
  });
});

describe("recommendation gate", () => {
  it("publishes as geverifieerd when the fraud gate passes without a local page", () => {
    const decision = decideRecommendation(openGate());
    assert.equal(decision.publish, true);
    assert.equal(decision.status, "geverifieerd");
    assert.deepEqual(decision.reasons, []);
  });

  it("publishes as lokaal verbonden when a local page names the company", () => {
    const decision = decideRecommendation(openGate({ localMention: true }));
    assert.equal(decision.publish, true);
    assert.equal(decision.status, "lokaal_verbonden");
  });

  it("withholds a young domain, a national number, and a place-name site", () => {
    assert.equal(decideRecommendation(openGate({ domainAgeYears: 2 })).publish, false);
    assert.ok(
      decideRecommendation(openGate({ domainAgeYears: null })).reasons.includes(
        "domain_age_unknown",
      ),
    );
    assert.ok(
      decideRecommendation(openGate({ geographicPhone: false, areaMatched: false })).reasons.includes(
        "no_local_phone",
      ),
    );
    assert.ok(
      decideRecommendation(openGate({ placeInIdentity: true })).reasons.includes("place_in_identity"),
    );
    assert.equal(decideRecommendation(openGate({ fakeLocal: true })).publish, false);
  });

  it("notes an unmapped place and still publishes on a geographic number", () => {
    const decision = decideRecommendation(
      openGate({ areaKnown: false, areaMatched: false }),
    );
    assert.equal(decision.publish, true);
    assert.deepEqual(decision.notes, ["area_unmapped"]);
  });

  it("does not ask the age of a site that never loaded", () => {
    const decision = decideRecommendation(openGate({ siteLoaded: false, domainAgeYears: null }));
    assert.deepEqual(decision.reasons, ["site_unreachable"]);
  });
});

describe("recommendation evidence", () => {
  it("reads a geographic number and ignores 06 and 085", () => {
    const phones = geographicPhones("Bel 0252 412 345 of 06 12345678 of 085 123 4567");
    assert.deepEqual(phones, ["0252412345"]);
    assert.equal(phoneMatchesArea(phones, knownAreaCodes("Lisse") ?? []), true);
    assert.equal(phoneMatchesArea(["0721234567"], knownAreaCodes("Lisse") ?? []), false);
    assert.equal(knownAreaCodes("Zaandam"), null);
    assert.equal(matchingGeographicPhone(["0721234567", "0252412345"], ["0252"]), "0252412345");
  });

  it("treats a trade-plus-place domain or title as the site identity", () => {
    const names = tradeIdentityNames("paint");
    assert.equal(
      placeInSiteIdentity({
        host: "schilder-lisse.nl",
        title: "Jansen Schilders",
        place: "Lisse",
        tradeNames: names,
      }),
      true,
    );
    assert.equal(
      placeInSiteIdentity({
        host: "jansenschilders.nl",
        title: "Schilderwerk Lisse",
        place: "Lisse",
        tradeNames: names,
      }),
      true,
    );
    assert.equal(
      placeInSiteIdentity({
        host: "jansenschilders.nl",
        title: "Jansen Schilders, gevestigd in Lisse",
        place: "Lisse",
        tradeNames: names,
      }),
      false,
    );
  });

  it("accepts a club page and rejects the company's own site and a directory", () => {
    assert.equal(companyNameOnPage("Jansen Schilders", "Welkom bij Jansen Schilders in de bollenstreek"), true);
    assert.equal(
      acceptLocalPage({
        companyName: "Jansen Schilders",
        ownHost: "jansenschilders.nl",
        url: "https://fclisse.nl/sponsors",
        text: "Sponsor: Jansen Schilders",
      }),
      true,
    );
    assert.equal(
      acceptLocalPage({
        companyName: "Jansen Schilders",
        ownHost: "jansenschilders.nl",
        url: "https://jansenschilders.nl/club",
        text: "Wij sponsoren de club. Jansen Schilders",
      }),
      false,
    );
    assert.equal(
      acceptLocalPage({
        companyName: "Jansen Schilders",
        ownHost: "jansenschilders.nl",
        url: "https://www.detelefoongids.nl/lisse",
        text: "Jansen Schilders",
      }),
      false,
    );
  });

  it("reads a registration date from RDAP", () => {
    const at = registrationMillis({
      events: [{ eventAction: "registration", eventDate: "2014-03-01T00:00:00Z" }],
    });
    assert.ok(at);
    assert.ok(domainAgeYears(at ?? 0, NOW) > 5);
    assert.equal(registrationMillis({ events: [] }), null);
  });
});

describe("recommendation card and letter", () => {
  it("shows only Aanbevolen until a local page is confirmed", () => {
    const card = recommendationCard({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Jansen Schilders",
      place: "Lisse",
      website: "https://jansenschilders.nl",
      phone: "0252412345",
      email: "info@jansenschilders.nl",
      tradeId: "paint",
      status: "geverifieerd",
      matchNote: "Aanbevolen door een klant uit Lisse.",
      evidence: [],
    });
    assert.deepEqual(card.badges, ["aanbevolen"]);
    assert.equal(card.status, "geverifieerd");
    const local = recommendationCard({ ...card, status: "lokaal_verbonden", evidence: card.evidence });
    assert.deepEqual(local.badges, ["aanbevolen", "lokaal_verbonden"]);
  });

  it("puts Aanbevolen on a stored find without changing its search status", () => {
    assert.equal(recommendationKeepsSearchStatus("gevonden"), true);
    assert.equal(recommendationKeepsSearchStatus("aanbevolen_door_klant"), false);
    const card = cardFromStoredFound(
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Jansen Schilders",
        website_url: "https://jansenschilders.nl",
        partnerTrust: {
          status: "gevonden",
          tradeId: "paint",
          postcode4: "2161",
          score: 2,
          elementCodes: [],
          recommendedAt: "2026-10-01T00:00:00.000Z",
          facts: [
            {
              kind: "sport",
              sourceUrl: "https://fclisse.nl/sponsors",
              sourceName: "FC Lisse",
              observedAt: "2026-10-01T00:00:00.000Z",
              expiresAt: "2027-01-01T00:00:00.000Z",
            },
          ],
        },
      },
      "Lisse",
    );
    assert.equal(card?.status, "lokaal_verbonden");
    assert.ok(card?.badges.includes("aanbevolen"));
    assert.ok(card?.badges.includes("gevonden"));
  });

  it("writes the invitation only to an address on the company domain", () => {
    assert.equal(
      inviteAddress({
        submitted: "info@jansenschilders.nl",
        ownHost: "jansenschilders.nl",
        found: [],
      }),
      "info@jansenschilders.nl",
    );
    assert.equal(
      inviteAddress({
        submitted: "jan@gmail.com",
        ownHost: "jansenschilders.nl",
        found: ["klant@jansenschilders.nl"],
      }),
      "klant@jansenschilders.nl",
    );
    assert.equal(
      inviteAddress({
        submitted: "jan@gmail.com",
        ownHost: "jansenschilders.nl",
        found: ["jan@gmail.com"],
      }),
      null,
    );
    const letter = recommendationLetter({
      to: "info@jansenschilders.nl",
      place: "Lisse",
      company: "Jansen Schilders",
      tradeLabel: "Schilders",
    });
    assert.equal(letter.subject, "Een klant uit Lisse heeft Jansen Schilders aanbevolen");
    assert.match(letter.text, /handyhousehelp\.ai\/bedrijven/);
    assert.equal(letter.text.includes("geverifieerd"), false);
    assert.equal(inviteStillFresh("2026-10-01T00:00:00.000Z", NOW), true);
    assert.equal(inviteStillFresh("2026-01-01T00:00:00.000Z", NOW), false);
  });
});
