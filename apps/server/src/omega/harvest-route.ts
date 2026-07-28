/**
 * Phase 7 — Harvest orchestration.
 * Runs runOcCommand("harvest"), persists Can/For/Notable on the company.
 * On failure: writes an Observation (tag harvest-failed), leaves company unchanged.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { v4 as uuid } from "uuid";
import {
  CapabilityAliasesSchema,
  SERVICE_CONTEXTS,
  type Company,
  type Observation,
} from "@h3-trust/schema";
import type { HarvestOutput } from "@h3-trust/schema/omega";
import type { FileStore } from "@h3-trust/store";
import { buildHarvestCompanyPatch, runOcCommand } from "./adapter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const aliasesPath = path.resolve(
  __dirname,
  "../../../../searchplans/capability_aliases.v1.json",
);

export type HarvestRouteSuccess = {
  ok: true;
  company: Company;
  harvest_confidence?: HarvestOutput["harvest_confidence"];
  webpageTrustProbe?: HarvestOutput["webpageTrustProbe"];
};

export type HarvestRouteSoftFail = {
  ok: false;
  observationId: string;
  error: string;
};

export type HarvestRouteResult = HarvestRouteSuccess | HarvestRouteSoftFail;

export async function runHarvestForCompany(
  store: FileStore,
  missionId: string,
  companyId: string,
): Promise<HarvestRouteResult> {
  const mission = await store.getMission(missionId);
  if (!mission) {
    throw new HarvestRouteError("Mission not found", 404);
  }

  const companies = await store.listByMission("companies", missionId);
  const company = companies.find((c) => c.id === companyId);
  if (!company) {
    throw new HarvestRouteError("Company not found on this mission", 404);
  }

  const website_url = company.website_url ?? company.profileSourceUrl;
  const capability_aliases = await loadCapabilityAliases();

  try {
    const out = await runOcCommand("harvest", {
      missionId,
      companyId: company.id,
      name: company.name,
      website_url,
      capability_aliases,
      service_contexts_allowed: [...SERVICE_CONTEXTS],
    });

    const patch = buildHarvestCompanyPatch(out, {
      profileSourceUrl: website_url ?? company.profileSourceUrl,
    });
    const updated = await store.upsert("companies", {
      ...company,
      ...patch,
    });

    return {
      ok: true,
      company: updated,
      harvest_confidence: out.harvest_confidence,
      webpageTrustProbe: out.webpageTrustProbe,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Harvest failed";
    const now = new Date().toISOString();
    const observation: Observation = {
      id: uuid(),
      missionId,
      producer: "OmegaClaw",
      createdAt: now,
      updatedAt: now,
      v: 1,
      statement: `Harvest failed for ${company.name} (${companyId}): ${message}`,
      evidenceUrls: website_url ? [website_url] : [],
      evidenceIds: [],
      tags: ["harvest-failed", `company:${companyId}`],
    };
    await store.upsert("observations", observation);
    return {
      ok: false,
      observationId: observation.id,
      error: message,
    };
  }
}

async function loadCapabilityAliases(): Promise<Record<string, string[]>> {
  try {
    const raw = JSON.parse(await readFile(aliasesPath, "utf8"));
    const parsed = CapabilityAliasesSchema.parse(raw);
    return parsed.aliases;
  } catch {
    return {};
  }
}

export class HarvestRouteError extends Error {
  status: 400 | 404 | 500;
  constructor(message: string, status: 400 | 404 | 500) {
    super(message);
    this.name = "HarvestRouteError";
    this.status = status;
  }
}
