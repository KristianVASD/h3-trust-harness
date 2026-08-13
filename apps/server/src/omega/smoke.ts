/**
 * Phase 1 + Phase 6 smoke — discover → probe → barrier gate → fulfill →
 * extract → harvest → refresh → coverage, against stub Ω with zero API key.
 *
 *   pnpm --filter @h3-trust/server omega:smoke
 */
import {
  computeMissionCoverage,
  computeRichness,
  computeResultCoverage,
  DEFAULT_SEARCH_PLAN_VERSION,
  isBlockingBarrier,
  SearchPlanSchema,
  SOURCE_FIELD_KEYS,
  type Source,
} from "@h3-trust/schema";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildDiscoverSourceRecords,
  buildFulfilledBarrier,
  buildHarvestCompanyPatch,
  buildHumanCompaniesFromFulfillment,
  buildProbeSourcePatch,
  runExtractGated,
  runOcCommand,
  SOURCE_FIELD_KEYS as ADAPTER_FIELDS,
} from "./adapter.js";

const MISSION_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const SOURCE_ID = "b2c3d4e5-f6a7-8901-bcde-f12345678901"; // KvK in seed
const OPEN_SOURCE_ID = "11111111-1111-4111-8111-111111111111"; // NSB — no barrier
const COMPANY_ID = "11111111-1111-4111-8111-111111111101";

const context = {
  country: "NL",
  location: "Haarlemmermeer",
  sector: "residential_maintenance",
  subsector: "painters",
  goal: "Find trustworthy local painters",
};

async function main(): Promise<void> {
  if (ADAPTER_FIELDS.length !== SOURCE_FIELD_KEYS.length) {
    throw new Error("Adapter field universe drift vs schema SOURCE_FIELD_KEYS");
  }

  console.log("Ω smoke — discover");
  const discover = await runOcCommand("discover", {
    missionId: MISSION_ID,
    gap: {
      layer: "local",
      category: "local_business_association",
      nuance_rule: "Prefer independent chambers over ad directories.",
    },
    context,
    existingSourceNames: [],
    recentFeedback: [],
  });
  if (discover.producer !== "OmegaClaw") throw new Error("Mirror: discover missing producer");
  if (!discover.candidates.length) throw new Error("discover returned no candidates");
  console.log(`  → ${discover.candidates.length} candidate(s), first=${discover.candidates[0]?.name}`);

  const { sources: discoverRows, skipped } = buildDiscoverSourceRecords(
    discover,
    MISSION_ID,
  );
  if (!discoverRows.length) {
    throw new Error(
      `discover builder produced no sources (skipped=${skipped.length})`,
    );
  }
  for (const row of discoverRows) {
    if (row.producer !== "OmegaClaw") {
      throw new Error("discover source missing OmegaClaw producer");
    }
    if (row.status !== "candidate") {
      throw new Error(`discover source status=${row.status}, expected candidate`);
    }
    if (row.probeStatus !== "unprobed") {
      throw new Error(
        `discover source probeStatus=${row.probeStatus}, expected unprobed`,
      );
    }
  }
  console.log(
    `  → buildDiscoverSourceRecords: ${discoverRows.length} row(s), probeStatus=unprobed`,
  );

  console.log("Ω smoke — probe (KvK → expect access barrier)");
  const probe = await runOcCommand("probe", {
    missionId: MISSION_ID,
    sourceId: SOURCE_ID,
    url: "https://www.kvk.nl",
    category: "registry",
    context,
    fieldUniverse: [...SOURCE_FIELD_KEYS],
  });
  const patch = buildProbeSourcePatch(probe);
  if (patch.probeStatus !== "probed") throw new Error("probe patch not probed");
  if (patch.producer !== "OmegaClaw") {
    throw new Error("probe patch missing OmegaClaw producer");
  }
  if (!patch.extractionGuide) throw new Error("probe patch missing extractionGuide");
  if (!patch.sourceFields.length) throw new Error("probe patch missing sourceFields");
  if (!probe.accessBarrier) {
    throw new Error("KvK stub probe must raise accessBarrier");
  }
  if (!isBlockingBarrier(probe.accessBarrier)) {
    throw new Error("KvK barrier should be blocking");
  }
  if (!patch.accessBarrier) {
    throw new Error("buildProbeSourcePatch must copy accessBarrier when present");
  }
  const richnessCheck = computeRichness(probe.sourceFields);
  if (richnessCheck.score !== probe.richness.score) {
    throw new Error(
      `richness mismatch: computed ${richnessCheck.score} vs probe ${probe.richness.score}`,
    );
  }
  console.log(
    `  → fields=[${probe.sourceFields.join(",")}] richness=${probe.richness.score} barrier=${probe.accessBarrier.kind}`,
  );

  const blockedSource: Source = {
    id: SOURCE_ID,
    producer: "OmegaClaw",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    v: 1,
    first_seen_mission: MISSION_ID,
    reused_in_missions: [],
    name: "KvK Handelsregister",
    type: "registry",
    category: "registry",
    scope: "national",
    region: "",
    url: "https://www.kvk.nl",
    status: "accepted",
    signalIds: [],
    evidenceIds: [],
    sourceFields: probe.sourceFields,
    richness: probe.richness,
    extractionGuide: probe.extractionGuide,
    probeStatus: "probed",
    accessBarrier: probe.accessBarrier,
  };

  console.log("Ω smoke — extract gated (blocked)");
  const gatedBlocked = await runExtractGated(
    {
      missionId: MISSION_ID,
      sources: [
        {
          id: SOURCE_ID,
          url: "https://www.kvk.nl",
          sourceFields: probe.sourceFields,
          extractionGuide: probe.extractionGuide,
        },
      ],
      context,
      existingCompanyNames: [],
      kvkFormat: "^[0-9]{8}$",
    },
    [blockedSource],
  );
  if (!gatedBlocked.blocked.length) {
    throw new Error("anti-bypass failed: blocked source reached extract");
  }
  if (gatedBlocked.companies.length) {
    throw new Error("anti-bypass failed: companies extracted from blocked source");
  }
  console.log(
    `  → blocked=${gatedBlocked.blocked.length} companies=${gatedBlocked.companies.length}`,
  );

  console.log("Ω smoke — fulfillBarrier (manual-rows → Human)");
  const fulfillment = {
    kind: "manual-rows" as const,
    by: "smoke-curator",
    manual_companies: [
      {
        name: "Human Paste Schilders BV",
        kvk_number: "12345678",
        address: "Stubweg 1",
        specialism: "interior painting",
      },
    ],
  };
  const fulfilledBarrier = buildFulfilledBarrier(
    probe.accessBarrier,
    fulfillment,
  );
  if (fulfilledBarrier.status !== "human-fulfilled") {
    throw new Error("fulfillment did not set human-fulfilled");
  }
  const humanCompanies = buildHumanCompaniesFromFulfillment({
    missionId: MISSION_ID,
    source: { ...blockedSource, accessBarrier: fulfilledBarrier },
    fulfillment,
  });
  if (!humanCompanies.length || humanCompanies[0]!.producer !== "Human") {
    throw new Error("manual-rows must create Human-produced companies");
  }
  console.log(
    `  → Human company=${humanCompanies[0]!.name} producer=${humanCompanies[0]!.producer}`,
  );

  const unlockedSource: Source = {
    ...blockedSource,
    accessBarrier: fulfilledBarrier,
  };

  console.log("Ω smoke — extract gated (unlocked after fulfill)");
  const gatedOpen = await runExtractGated(
    {
      missionId: MISSION_ID,
      sources: [
        {
          id: SOURCE_ID,
          url: "https://www.kvk.nl",
          sourceFields: probe.sourceFields,
          extractionGuide: probe.extractionGuide,
        },
      ],
      context,
      existingCompanyNames: humanCompanies.map((c) => c.name),
      kvkFormat: "^[0-9]{8}$",
    },
    [unlockedSource],
  );
  if (gatedOpen.blocked.length) {
    throw new Error("fulfilled barrier still blocking extract");
  }
  if (!gatedOpen.companies.length) {
    throw new Error("unlocked extract returned no companies");
  }
  console.log(
    `  → ${gatedOpen.companies.length} Ω compan(y/ies), first=${gatedOpen.companies[0]?.name}`,
  );

  console.log("Ω smoke — probe open source (no barrier) + extract");
  const openProbe = await runOcCommand("probe", {
    missionId: MISSION_ID,
    sourceId: OPEN_SOURCE_ID,
    url: "https://example.stub/nsb",
    category: "branch_association",
    context,
    fieldUniverse: [...SOURCE_FIELD_KEYS],
  });
  if (openProbe.accessBarrier) {
    throw new Error("non-KvK stub probe should not raise barrier");
  }

  console.log("Ω smoke — harvest (with URL)");
  const harvest = await runOcCommand("harvest", {
    missionId: MISSION_ID,
    companyId: COMPANY_ID,
    name: gatedOpen.companies[0]!.name,
    website_url: "https://example.stub/painter",
    capability_aliases: {},
    service_contexts_allowed: ["private", "hoa"],
  });
  const harvestPatch = buildHarvestCompanyPatch(harvest, {
    profileSourceUrl: "https://example.stub/painter",
  });
  if (!harvestPatch.profileSnippet) throw new Error("harvest missing profileSnippet");
  if (harvest.harvest_confidence !== "low") {
    throw new Error(`expected stub harvest confidence low, got ${harvest.harvest_confidence}`);
  }
  if (harvest.capabilities.length > 0 || harvest.serviceContexts.length > 0) {
    throw new Error("stub harvest must not invent Can / For");
  }
  if (harvest.differentiators.length > 0) {
    throw new Error("stub harvest must not invent Notable");
  }
  if (!harvest.profileSnippet.toUpperCase().includes("STUB")) {
    throw new Error("stub harvest snippet must be labelled STUB");
  }
  if (!harvestPatch.profileSourceUrl) {
    throw new Error("harvest patch missing profileSourceUrl");
  }
  if (
    harvest.webpageTrustProbe &&
    !harvest.webpageTrustProbe.notes?.includes("not wired")
  ) {
    throw new Error("webpageTrustProbe should stay a placeholder");
  }
  console.log(
    `  → confidence=${harvest.harvest_confidence} snippet=${harvest.profileSnippet.slice(0, 50)}…`,
  );

  console.log("Ω smoke — harvest (no URL → low confidence)");
  const harvestThin = await runOcCommand("harvest", {
    missionId: MISSION_ID,
    companyId: COMPANY_ID,
    name: "Thin Painter BV",
    capability_aliases: {},
    service_contexts_allowed: ["private"],
  });
  if (harvestThin.harvest_confidence !== "low") {
    throw new Error(
      `expected low confidence without URL, got ${harvestThin.harvest_confidence}`,
    );
  }
  if (!harvestThin.profileSnippet) {
    throw new Error("no-URL harvest must still return a profileSnippet");
  }
  if (harvestThin.capabilities.length > 0) {
    throw new Error("no-URL harvest should not invent capabilities");
  }
  console.log(
    `  → confidence=${harvestThin.harvest_confidence} snippet=${harvestThin.profileSnippet.slice(0, 50)}…`,
  );

  console.log("Ω smoke — refresh");
  const refresh = await runOcCommand("refresh", {
    missionId: MISSION_ID,
    check_type: "full_mission",
    context,
  });
  console.log(`  → status=${refresh.overall_status}`);

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const planPath = path.resolve(
    __dirname,
    `../../../../searchplans/${DEFAULT_SEARCH_PLAN_VERSION}.json`,
  );
  let planEntries: { layer: "national" | "regional" | "local"; category: string }[] = [];
  try {
    const raw = JSON.parse(await readFile(planPath, "utf8"));
    planEntries = SearchPlanSchema.parse(raw).entries;
  } catch {
    planEntries = [
      { layer: "national", category: "registry" },
      { layer: "local", category: "local_business_association" },
    ];
  }

  console.log("Ω smoke — coverage (barrier-aware)");
  const coverageBlocked = computeMissionCoverage({
    sources: [
      {
        status: "accepted",
        scope: "national",
        category: "registry",
        probeStatus: "probed",
        extractionGuide: probe.extractionGuide,
        sourceFields: probe.sourceFields,
        richness: probe.richness,
        accessBarrier: probe.accessBarrier,
      },
      {
        status: "accepted",
        scope: "local",
        category: "local_business_association",
        probeStatus: "probed",
        extractionGuide: openProbe.extractionGuide,
        sourceFields: openProbe.sourceFields,
      },
    ],
    companies: humanCompanies.map((c) => ({
      capabilities: [],
      profileSnippet: undefined,
      kvk_gate: c.kvk_gate,
      source_ids: c.source_ids,
    })),
    planEntries,
  });
  if (coverageBlocked.sourcesBlockedByBarrier < 1) {
    throw new Error("coverage must count blocking barriers");
  }
  if (coverageBlocked.readyForSearch) {
    throw new Error("readyForSearch must be false while barriers block");
  }
  if (!coverageBlocked.readyReason.includes("barrier")) {
    throw new Error(`readyReason missing barrier text: ${coverageBlocked.readyReason}`);
  }
  console.log(
    `  → blocked score=${coverageBlocked.completenessScore} ready=${coverageBlocked.readyForSearch} reason=${coverageBlocked.readyReason}`,
  );

  const coverageClear = computeMissionCoverage({
    sources: [
      {
        status: "accepted",
        scope: "national",
        category: "registry",
        probeStatus: "probed",
        extractionGuide: probe.extractionGuide,
        sourceFields: probe.sourceFields,
        richness: probe.richness,
        accessBarrier: fulfilledBarrier,
      },
      {
        status: "accepted",
        scope: "local",
        category: "local_business_association",
        probeStatus: "probed",
        extractionGuide: openProbe.extractionGuide,
        sourceFields: openProbe.sourceFields,
      },
    ],
    companies: [
      ...humanCompanies.map((c) => ({
        capabilities: harvest.capabilities,
        profileSnippet: harvest.profileSnippet,
        kvk_gate: c.kvk_gate,
        source_ids: c.source_ids,
      })),
      ...gatedOpen.companies.map((c) => ({
        capabilities: harvest.capabilities,
        profileSnippet: harvest.profileSnippet,
        kvk_gate: c.kvk_gate,
        source_ids: c.source_ids,
      })),
    ],
    planEntries,
  });
  if (coverageClear.sourcesBlockedByBarrier !== 0) {
    throw new Error("fulfilled barrier must not count as blocking");
  }
  const conf = computeResultCoverage(humanCompanies[0]!, coverageClear);
  if (conf < 0 || conf > 100) throw new Error("coverageConfidence out of range");
  console.log(
    `  → clear score=${coverageClear.completenessScore} ready=${coverageClear.readyForSearch} conf=${conf}`,
  );

  console.log("Ω smoke — OK");
}

main().catch((err) => {
  console.error("Ω smoke — FAILED", err);
  process.exit(1);
});
