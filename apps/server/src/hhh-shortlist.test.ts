import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  buildVisitList,
  decideAssessment,
  filterHitsToSearch,
  lookupOutcome,
  orderPassers,
  passerStatus,
  publicFromFresh,
  reuseJobId,
  selectFreshPartners,
  selectStalePartners,
  toPublicPartner,
  type PartnerCompanyView,
} from "@h3-trust/schema";
import {
  isHhhPartnerBearer,
  isHhhPartnerPath,
  isWorkerBearer,
  partnerRouteDecision,
} from "./auth.js";
import { toDeskJob } from "./hhh-shortlist-jobs.js";

const NOW = Date.parse("2026-10-16T12:00:00.000Z");
const FRESH = "2027-01-01T00:00:00.000Z";
const STALE = "2026-01-01T00:00:00.000Z";

function firm(partial: Partial<PartnerCompanyView> & Pick<PartnerCompanyView, "id" | "name">): PartnerCompanyView {
  return partial;
}

describe("shortlist rank", () => {
  it("keeps the six search hits and adds at most two local firms", () => {
    const ai = [0, 1, 2, 3, 4, 5].map((n) => ({
      name: `Zoek ${n}`,
      website: `https://zoek${n}.example`,
    }));
    const extras = [
      { name: "Zoek 0", website: "https://zoek0.example", sourceUrl: "https://ov.example", sourceName: "OV" },
      { name: "Lokaal Drie", website: "https://drie.example", sourceUrl: "https://ov.example", sourceName: "OV" },
      { name: "Lokaal Een", website: "https://een.example", sourceUrl: "https://ov.example", sourceName: "OV" },
      { name: "Lokaal Twee", website: "https://twee.example", sourceUrl: "https://ov.example", sourceName: "OV" },
    ];
    const first = buildVisitList(ai, extras);
    const reversed = buildVisitList([...ai].reverse(), [...extras].reverse());
    assert.equal(first.length, 8);
    assert.deepEqual(
      first.slice(0, 6).map((row) => row.website),
      ai.map((row) => row.website),
    );
    assert.deepEqual(
      first.slice(6).map((row) => row.name),
      ["Lokaal Drie", "Lokaal Een"],
    );
    assert.deepEqual(
      reversed.slice(6).map((row) => row.name),
      ["Lokaal Drie", "Lokaal Een"],
    );
    assert.equal(first.slice(6).every((row) => row.signal === "in_category"), true);
    const doubled = first.find((row) => row.website === "https://zoek0.example");
    assert.equal(doubled?.signal, "in_category");
    assert.equal(doubled?.sourceName, "OV");
  });

  it("prefers a local-list firm over a closer search-only specialty", () => {
    const ordered = orderPassers([
      { name: "Gold", website: "https://gold.example", signal: "in_category" as const, elementOverlap: 0, jobTermHits: 0 },
      { name: "Fit", website: "https://fit.example", signal: "not_listed" as const, elementOverlap: 2, jobTermHits: 1 },
      { name: "Plain", website: "https://plain.example", signal: "not_listed" as const, elementOverlap: 1, jobTermHits: 0 },
      { name: "Gold Fit", website: "https://goldfit.example", signal: "in_category" as const, elementOverlap: 1, jobTermHits: 0 },
    ]);
    assert.deepEqual(
      ordered.map((row) => row.name),
      ["Gold Fit", "Gold", "Fit", "Plain"],
    );
  });
});

describe("withhold rules", () => {
  it("hides a fake-local firm and can return a firm that is not on a local list", () => {
    const fake = decideAssessment({
      siteLoaded: true,
      pageMatchesTrade: true,
      verdict: "fake_local",
    });
    const unlisted = decideAssessment({
      siteLoaded: true,
      pageMatchesTrade: true,
      verdict: "thin_local",
    });
    assert.equal(fake.pass, false);
    assert.equal(fake.withholdReason, "fake_local");
    assert.equal(unlisted.pass, true);
    assert.equal(passerStatus("not_listed"), "geverifieerd");
    assert.equal(passerStatus("in_category"), "lokaal_verbonden");
    const hidden = toPublicPartner(
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Lead Gen BV",
        website_url: "https://lead.example",
        partnerTrust: {
          status: "gevonden",
          tradeId: "paint",
          score: 0,
          elementCodes: [],
          facts: [],
        },
      },
      "Haarlem",
    );
    assert.equal(hidden, null);
  });
});

describe("browser search urls", () => {
  it("drops a candidate whose site was not in the search hits", () => {
    const kept = filterHitsToSearch(
      [
        { name: "Echt Schilderwerk", website: "https://www.echt-schilder.nl/contact" },
        { name: "Verzonnen", website: "https://verzonnen.example/over" },
      ],
      ["https://echt-schilder.nl/diensten"],
    );
    assert.deepEqual(kept, [
      { name: "Echt Schilderwerk", website: "https://echt-schilder.nl/contact" },
    ]);
  });
});

describe("stored matches", () => {
  it("skips browser search when three fresh companies already match", () => {
    const companies: PartnerCompanyView[] = [1, 2, 3].map((n) =>
      firm({
        id: `11111111-1111-4111-8111-11111111111${n}`,
        name: `Firma ${n}`,
        website_url: `https://firma${n}.example`,
        partnerTrust: {
          status: "geverifieerd",
          tradeId: "paint",
          postcode4: "2132",
          score: 40 + n,
          elementCodes: [],
          matchNote: `Firma ${n} matches this Schilders job.`,
          facts: [
            {
              kind: "website",
              sourceUrl: `https://firma${n}.example`,
              observedAt: "2026-10-01T00:00:00.000Z",
              expiresAt: FRESH,
            },
          ],
        },
      }),
    );
    companies.push(
      firm({
        id: "11111111-1111-4111-8111-111111111119",
        name: "Oud",
        website_url: "https://oud.example",
        partnerTrust: {
          status: "geverifieerd",
          tradeId: "paint",
          postcode4: "2132",
          score: 90,
          elementCodes: [],
          facts: [
            {
              kind: "website",
              sourceUrl: "https://oud.example",
              observedAt: "2025-01-01T00:00:00.000Z",
              expiresAt: STALE,
            },
          ],
        },
      }),
    );
    const query = { tradeId: "paint", postcode4: "2132" };
    const fresh = selectFreshPartners(companies, query, NOW);
    const stale = selectStalePartners(companies, query, NOW);
    assert.equal(lookupOutcome(fresh.length, stale.length), "ready");
    assert.equal(publicFromFresh(fresh, "Hoofddorp").length, 3);
    assert.equal(stale.length, 1);
    assert.equal(lookupOutcome(0, 0), "search");
    assert.equal(lookupOutcome(1, 2), "recheck");
  });
});

describe("request id", () => {
  it("returns the existing job for a repeated request id", () => {
    const jobs = [{ id: "job-1", requestId: "hhh-42" }];
    assert.equal(reuseJobId(jobs, "hhh-42"), "job-1");
    assert.equal(reuseJobId(jobs, "hhh-42"), reuseJobId(jobs, " hhh-42 ".trim() ? "hhh-42" : ""));
    assert.equal(reuseJobId(jobs, "other"), null);
  });
});

describe("partner token", () => {
  const previousPartner = process.env.H3_HHH_TOKEN;
  const previousWorker = process.env.H3_WORKER_TOKEN;

  afterEach(() => {
    if (previousPartner === undefined) delete process.env.H3_HHH_TOKEN;
    else process.env.H3_HHH_TOKEN = previousPartner;
    if (previousWorker === undefined) delete process.env.H3_WORKER_TOKEN;
    else process.env.H3_WORKER_TOKEN = previousWorker;
  });

  it("cannot call internal worker routes", () => {
    process.env.H3_HHH_TOKEN = "hhh-partner-token1";
    process.env.H3_WORKER_TOKEN = "worker-token-value1";
    assert.equal(isHhhPartnerBearer("Bearer hhh-partner-token1"), true);
    assert.equal(isWorkerBearer("Bearer hhh-partner-token1"), false);
    assert.equal(isHhhPartnerPath("/api/internal/hhh-shortlist/step"), false);
    assert.equal(partnerRouteDecision(true, "/api/internal/hhh-shortlist/step"), "deny");
    assert.equal(partnerRouteDecision(true, "/api/internal/hhh-found/knockout"), "deny");
    assert.equal(partnerRouteDecision(true, "/api/internal/address-search/step"), "deny");
    assert.equal(partnerRouteDecision(true, "/api/partner/hhh/shortlist"), "allow");
    assert.equal(
      partnerRouteDecision(true, "/api/partner/hhh/shortlist/11111111-1111-4111-8111-111111111111"),
      "allow",
    );
    assert.equal(partnerRouteDecision(true, "/api/control/hhh-shortlist"), "deny");
    assert.equal(
      partnerRouteDecision(true, "/api/control/hhh-shortlist/11111111-1111-4111-8111-111111111111/step"),
      "deny",
    );
  });
});

describe("shortlist desk", () => {
  it("summarises a stored job without the full payload", () => {
    const desk = toDeskJob({
      id: "job-1",
      request_id: "hhh-1",
      status: "ready",
      updated_at: "2026-10-17T10:00:00.000Z",
      payload: {
        placeLabel: "Amsterdam",
        postcode4: "1012",
        tradeId: "roof",
        jobText: "lekkage onder de dakgoot",
        stage: "store",
        fromCache: false,
        drops: ["Scam BV: fake_local"],
      },
      public_result: {
        fromCache: false,
        companies: [
          {
            name: "Dakwerk",
            website: "https://dak.example",
            status: "geverifieerd",
            score: 40,
            matchNote: "Dakwerk matches this roof job.",
          },
        ],
      },
    });
    assert.equal(desk.requestId, "hhh-1");
    assert.equal(desk.place, "Amsterdam");
    assert.equal(desk.companies[0]?.name, "Dakwerk");
    assert.deepEqual(desk.withheld, ["Scam BV: fake_local"]);
    assert.deepEqual(desk.progress, []);
  });
});
