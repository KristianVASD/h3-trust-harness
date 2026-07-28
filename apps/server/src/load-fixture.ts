/**
 * Load a committed fixture bundle into writable/ (runtime).
 * Usage: pnpm fixtures:load -- demos/haarlem_painters
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ExportBundleSchema } from "@h3-trust/schema";
import { createStore } from "@h3-trust/store";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");
const writableRoot = path.resolve(root, "writable");
const store = createStore({ writableRoot });

async function main() {
  const arg = process.argv.slice(2).find((a) => !a.startsWith("-"))
    ?? "demos/haarlem_painters";
  const bundlePath = path.resolve(root, "fixtures", arg, "bundle.json");

  const raw = await readFile(bundlePath, "utf8");
  const bundle = ExportBundleSchema.parse(JSON.parse(raw));

  await store.deleteMission(bundle.mission.id);

  await store.upsertMission(bundle.mission);
  for (const entry of bundle.journal) await store.upsert("journal", entry);
  for (const obs of bundle.observations) await store.upsert("observations", obs);
  for (const hyp of bundle.hypotheses) await store.upsert("hypotheses", hyp);
  for (const src of bundle.sources) await store.upsert("sources", src);
  for (const ms of bundle.missionSources ?? [])
    await store.upsert("missionSources", ms);
  for (const co of bundle.companies) await store.upsert("companies", co);
  for (const ev of bundle.evidence) await store.upsert("evidence", ev);
  for (const sig of bundle.signals) await store.upsert("signals", sig);
  for (const conf of bundle.confidenceProposals)
    await store.upsert("confidenceProposals", conf);
  for (const rev of bundle.reviews) await store.upsert("reviews", rev);
  for (const f of bundle.findings) await store.upsert("findings", f);
  for (const inv of bundle.investigations)
    await store.upsert("investigations", inv);
  for (const p of bundle.patterns) await store.upsert("patterns", p);

  console.log("Loaded fixture:", arg);
  console.log("Mission:", bundle.mission.location, "/", bundle.mission.subsector);
  console.log("→ writable/", writableRoot);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
