/**
 * Phase 1 smoke — runs discover → probe → extract → harvest → refresh
 * against stub Ω with zero API key. Exits non-zero on schema/invariant failure.
 *
 *   pnpm --filter @h3-trust/server omega:smoke
 */
import {
  computeMissionCoverage,
  computeRichness,
  DEFAULT_SEARCH_PLAN_VERSION,
  SearchPlanSchema,
  SOURCE_FIELD_KEYS,
} from "@h3-trust/schema";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildDiscoverSourceRecords,
  buildHarvestCompanyPatch,
  buildProbeSourcePatch,
  runOcCommand,
  SOURCE_FIELD_KEYS as ADAPTER_FIELDS,
} from "./adapter.js";

const MISSION_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const SOURCE_ID = "b2c3d4e5-f6a7-8901-bcde-f12345678901"; // KvK in seed
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

  console.log("Ω smoke — probe");
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
  const richnessCheck = computeRichness(probe.sourceFields);
  if (richnessCheck.score !== probe.richness.score) {
    throw new Error(
      `richness mismatch: computed ${richnessCheck.score} vs probe ${probe.richness.score}`,
    );
  }
  if (patch.richness.score !== richnessCheck.score) {
    throw new Error(
      `patch richness ${patch.richness.score} ≠ computed ${richnessCheck.score}`,
    );
  }
  const guideExtra = patch.extractionGuide.fields.filter(
    (f) => !patch.sourceFields.includes(f),
  );
  if (guideExtra.length > 0) {
    throw new Error(
      `guide.fields not ⊆ sourceFields: ${guideExtra.join(", ")}`,
    );
  }
  console.log(
    `  → fields=[${probe.sourceFields.join(",")}] richness=${probe.richness.score} pattern=${probe.extractionGuide.listPattern}`,
  );
  console.log(
    `  → buildProbeSourcePatch: probed, guide⊆fields, richness=${patch.richness.score}`,
  );

  console.log("Ω smoke — extract");
  const extract = await runOcCommand("extract", {
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
  });
  if (!extract.companies.length) throw new Error("extract returned no companies");
  console.log(`  → ${extract.companies.length} company(ies), first=${extract.companies[0]?.name}`);

  console.log("Ω smoke — harvest");
  const harvest = await runOcCommand("harvest", {
    missionId: MISSION_ID,
    companyId: COMPANY_ID,
    name: extract.companies[0]!.name,
    website_url: "https://example.stub/painter",
    capability_aliases: {},
    service_contexts_allowed: ["private", "hoa"],
  });
  const harvestPatch = buildHarvestCompanyPatch(harvest);
  if (!harvestPatch.profileSnippet) throw new Error("harvest missing profileSnippet");
  console.log(`  → snippet=${harvest.profileSnippet.slice(0, 60)}…`);

  console.log("Ω smoke — refresh");
  const refresh = await runOcCommand("refresh", {
    missionId: MISSION_ID,
    check_type: "full_mission",
    context,
  });
  if (refresh.overall_status !== "no_changes") {
    console.log(`  → status=${refresh.overall_status} (stub may vary)`);
  } else {
    console.log(`  → status=${refresh.overall_status}`);
  }

  // Coverage on a synthetic probed+extracted snapshot
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

  const coverage = computeMissionCoverage({
    sources: [
      {
        status: "accepted",
        scope: "national",
        category: "registry",
        probeStatus: "probed",
        extractionGuide: probe.extractionGuide,
        sourceFields: probe.sourceFields,
        richness: probe.richness,
      },
      {
        status: "accepted",
        scope: "local",
        category: "local_business_association",
        probeStatus: "probed",
        extractionGuide: probe.extractionGuide,
        sourceFields: probe.sourceFields,
      },
    ],
    companies: extract.companies.map((c) => ({
      capabilities: harvest.capabilities,
      profileSnippet: harvest.profileSnippet,
      kvk_gate: c.kvk_gate,
    })),
    planEntries,
  });

  console.log(
    `Ω smoke — coverage score=${coverage.completenessScore} ready=${coverage.readyForSearch} reason=${coverage.readyReason}`,
  );
  console.log("Ω smoke — OK");
}

main().catch((err) => {
  console.error("Ω smoke — FAILED", err);
  process.exit(1);
});
