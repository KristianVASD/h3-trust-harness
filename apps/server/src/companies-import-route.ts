import { randomUUID } from "node:crypto";
import type { Company } from "@h3-trust/schema";
import type { Store } from "@h3-trust/store";

export type CompanyImportRow = {
  name: string;
  address?: string;
  region?: string;
  sector?: string;
  kvk_number?: string;
  website_url?: string;
  specialism?: string;
};

export type CompanyImportResult = {
  created: number;
  updated: number;
  skipped: number;
  companies: Company[];
  warnings: string[];
};

function normName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function uniqStrings(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function fillBlank(existing: string | undefined, incoming: string | undefined): string | undefined {
  const cur = (existing ?? "").trim();
  if (cur) return existing;
  const next = (incoming ?? "").trim();
  return next || undefined;
}

function normalizeWebsite(raw: string | undefined): string | undefined {
  const value = (raw ?? "").trim();
  if (!value) return undefined;
  const lower = value.toLowerCase();
  if (lower === "n.v.t." || lower === "nvt" || lower === "n/a" || lower === "-") {
    return undefined;
  }
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value.replace(/^\/\//, "")}`;
}

/**
 * Batch-create / merge Human company candidates for a trusted source list.
 * Dedupes by normalized name within the mission: unions source_ids + list_membership,
 * fills blank fields only (does not overwrite populated values).
 */
export async function importCompaniesForMission(
  store: Store,
  args: {
    missionId: string;
    sourceId: string;
    listLabel: string;
    rows: CompanyImportRow[];
  },
): Promise<CompanyImportResult> {
  const { missionId, sourceId, listLabel, rows } = args;
  const warnings: string[] = [];

  const mission = await store.get("missions", missionId);
  if (!mission) {
    throw new CompanyImportError("Mission not found", 404);
  }

  const source = await store.get("sources", sourceId);
  if (!source) {
    throw new CompanyImportError("Source not found", 404);
  }
  if (source.status !== "accepted" && source.status !== "adjusted") {
    throw new CompanyImportError(
      "Source must be CURAD-accepted or adjusted before list import",
      400,
    );
  }

  const missionSources = (await store.listByMission(
    "sources",
    missionId,
  )) as Array<{ id: string }>;
  if (!missionSources.some((s) => s.id === sourceId)) {
    throw new CompanyImportError(
      "Source is not linked to this mission — accept/link it in Align first",
      400,
    );
  }

  const existing = (await store.listByMission(
    "companies",
    missionId,
  )) as Company[];
  const byName = new Map<string, Company>();
  for (const company of existing) {
    const key = normName(company.name);
    if (!byName.has(key)) byName.set(key, company);
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const touched: Company[] = [];
  const now = new Date().toISOString();
  const label = listLabel.trim() || source.name;

  for (const row of rows) {
    const name = (row.name ?? "").trim();
    if (!name) {
      skipped += 1;
      continue;
    }
    const key = normName(name);
    const website_url = normalizeWebsite(row.website_url);
    const specialism = (row.specialism ?? "").trim() || undefined;
    const address = (row.address ?? "").trim();
    const region = (row.region ?? "").trim();
    const sector = (row.sector ?? "").trim() || specialism?.replace(/,/g, ";") || "";
    const kvk_number = (row.kvk_number ?? "").trim() || undefined;

    const match = byName.get(key);
    if (match) {
      const next: Company = {
        ...match,
        source_ids: uniqStrings([...(match.source_ids ?? []), sourceId]),
        list_membership: uniqStrings([
          ...(match.list_membership ?? []),
          label,
        ]),
        address: fillBlank(match.address, address) ?? match.address ?? "",
        region: fillBlank(match.region, region) ?? match.region ?? "",
        sector: fillBlank(match.sector, sector) ?? match.sector ?? "",
        kvk_number: fillBlank(match.kvk_number, kvk_number),
        website_url: fillBlank(match.website_url, website_url),
        specialism: fillBlank(match.specialism, specialism),
        updatedAt: now,
      };
      const saved = (await store.upsert("companies", next)) as Company;
      byName.set(key, saved);
      touched.push(saved);
      updated += 1;
      continue;
    }

    const company: Company = {
      id: randomUUID(),
      missionId,
      producer: "Human",
      name,
      address,
      region,
      sector,
      category: "",
      kvk_number,
      kvk_gate: "unchecked",
      specialism,
      source_ids: [sourceId],
      list_membership: [label],
      blacklist_flags: [],
      status: "candidate",
      capabilities: [],
      serviceContexts: [],
      differentiators: [],
      servicedElementCodes: [],
      website_url,
      createdAt: now,
      updatedAt: now,
      v: 1,
    };
    const saved = (await store.upsert("companies", company)) as Company;
    byName.set(key, saved);
    touched.push(saved);
    created += 1;
  }

  if (rows.length === 0) {
    warnings.push("No rows in import payload");
  }

  return { created, updated, skipped, companies: touched, warnings };
}

export class CompanyImportError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "CompanyImportError";
    this.status = status;
  }
}
