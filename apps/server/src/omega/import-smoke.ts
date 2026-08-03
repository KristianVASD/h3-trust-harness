/**
 * Verify Qwen Job-1 envelope → discover import → probe batch → extract → coverage.
 *
 *   pnpm --filter @h3-trust/server omega:import-smoke
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  computeMissionCoverage,
  DEFAULT_SEARCH_PLAN_VERSION,
  SearchPlanSchema,
  type Mission,
  type Source,
} from "@h3-trust/schema";
import { FileStore } from "@h3-trust/store";
import { runOmegaImport } from "./import-route.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const qwenPath = path.join(
  repoRoot,
  "writable/docs/Qwen_json_20260803_pvtbeoehy.json",
);
const planPath = path.join(repoRoot, "searchplans/default.v1.json");

async function main(): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "h3-omega-import-"));
  const store = new FileStore(root);
  const missionId = randomUUID();
  const now = new Date().toISOString();

  const mission: Mission = {
    id: missionId,
    location: "Hoofddorp",
    country: "Nederland",
    sector: "Home Maintenance",
    subsector: "Painters",
    goal: "Find trustworthy painters in Hoofddorp (import smoke)",
    search_plan_version: DEFAULT_SEARCH_PLAN_VERSION,
    discoveryBrief: {
      approach: "Import smoke",
      candidateListTypes: ["registry"],
      successCriteria: "≥3 companies",
      producer: "Human",
      updatedAt: now,
    },
    phases: [{ key: "observation", status: "active" }],
    producer: "Human",
    createdAt: now,
    updatedAt: now,
    v: 1,
  };
  await store.upsertMission(mission);

  const qwen = JSON.parse(await readFile(qwenPath, "utf8")) as unknown;
  console.log("Import discover (Qwen gaps envelope)…");
  const discover = await runOmegaImport(store, missionId, {
    job: "discover",
    payload: qwen,
  });
  console.log(
    `  imported=${discover.imported} skipped=${discover.skipped.length} warnings=${discover.warnings.length}`,
  );
  if (discover.imported < 10) {
    throw new Error(
      `Expected ≥10 sources from Qwen Job 1, got ${discover.imported}`,
    );
  }

  let sources = await store.listByMission("sources", missionId);
  const omega = sources.filter((s) => s.producer === "OmegaClaw");
  if (omega.length !== discover.imported) {
    throw new Error("Producer stamp missing on imported sources");
  }

  // Accept strongest extractable-looking lists + attach minimal probes via import
  const prefer = [
    "OnderhoudNL",
    "De Betere Schilder",
    "Ondernemend Hoofddorp",
    "OVHZ",
    "Vakwerk Plusgarantie",
  ];
  const toAccept: Source[] = [];
  for (const name of prefer) {
    const hit = sources.find((s) =>
      s.name.toLowerCase().includes(name.toLowerCase()),
    );
    if (hit) toAccept.push(hit);
  }
  if (toAccept.length < 3) {
    toAccept.push(...sources.filter((s) => !toAccept.includes(s)).slice(0, 5));
  }

  const probeBatch = toAccept.map((s) => ({
    name: s.name,
    url: s.url,
    memberListPublic: true,
    suggestedConfidence: s.suggestedConfidence ?? 70,
    summary_reasons: ["✓ Import-smoke minimal probe"],
    sourceFields: ["name", "website", "address"],
    extractionGuide: {
      listPattern: "directory",
      fields: ["name", "website"],
      pagination: false,
    },
  }));

  console.log("Import probe (minimal guides)…");
  const probe = await runOmegaImport(store, missionId, {
    job: "probe",
    payload: { probes: probeBatch },
  });
  console.log(`  probed=${probe.imported}`);

  sources = await store.listByMission("sources", missionId);
  for (const s of toAccept) {
    const updated = sources.find((x) => x.id === s.id)!;
    await store.upsert("sources", {
      ...updated,
      status: "accepted",
      updatedAt: new Date().toISOString(),
    });
  }

  sources = await store.listByMission("sources", missionId);
  const accepted = sources.filter(
    (s) => s.status === "accepted" || s.status === "adjusted",
  );
  console.log(`Accepted ${accepted.length} sources for extract`);

  const companiesPayload = {
    companies: [
      {
        name: "Schilderbedrijf Hoofddorp Voorbeeld",
        address: "Kruisweg 1, Hoofddorp",
        region: "Haarlemmermeer",
        kvk_number: "12345678",
        list_membership: [accepted[0]!.name],
      },
      {
        name: "Vakschilder Nieuw-Vennep",
        region: "Haarlemmermeer",
        list_membership: [accepted[1]?.name ?? accepted[0]!.name],
      },
      {
        name: "Onderhoud & Schilder Badhoevedorp",
        region: "Haarlemmermeer",
        list_membership: [accepted[0]!.name],
      },
    ],
  };

  console.log("Import extract…");
  const extract = await runOmegaImport(store, missionId, {
    job: "extract",
    payload: companiesPayload,
  });
  console.log(`  companies=${extract.imported}`);
  if (extract.imported < 3) {
    throw new Error(`Expected ≥3 companies, got ${extract.imported}`);
  }

  const planJson = JSON.parse(await readFile(planPath, "utf8"));
  const plan = SearchPlanSchema.parse(planJson);
  const companies = await store.listByMission("companies", missionId);
  const coverage = computeMissionCoverage({
    sources: await store.listByMission("sources", missionId),
    companies,
    planEntries: plan.entries,
  });
  console.log(
    `Coverage completeness=${coverage.completenessScore} ready=${coverage.readyForSearch} reason=${coverage.readyReason}`,
  );
  if (companies.length < 3) {
    throw new Error("Company count regression");
  }

  console.log("Ω import smoke OK");
  await rm(root, { recursive: true, force: true });
}

main().catch(async (err) => {
  console.error(err);
  process.exitCode = 1;
});
