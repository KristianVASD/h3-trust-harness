import { randomUUID } from "node:crypto";
import {
  buildCompanyIndexes,
  findCompanyMatchIndex,
  type Company,
  type Producer,
  type ServiceContext,
} from "@h3-trust/schema";
import type { Store } from "@h3-trust/store";

export type CompanyImportRow = {
  name: string;
  address?: string;
  region?: string;
  sector?: string;
  kvk_number?: string;
  website_url?: string;
  specialism?: string;
  phone?: string;
  email?: string;
};

export type CompanyImportResult = {
  created: number;
  updated: number;
  skipped: number;
  companies: Company[];
  warnings: string[];
};

/** CSV `services` / specialism → Can chips. Never invents For / Notable. */
export function servicesToCapabilities(specialism?: string): string[] {
  if (!specialism) return [];
  return uniqStrings(
    specialism
      .split(/[,;|]/)
      .map((part) => part.trim())
      .filter(Boolean),
  );
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

function normalizePhone(raw: string | undefined): string | undefined {
  const value = (raw ?? "").trim().replace(/^tel:\s*/i, "").trim();
  return value || undefined;
}

function normalizeEmail(raw: string | undefined): string | undefined {
  const value = (raw ?? "").trim().replace(/^mailto:\s*/i, "").trim();
  return value || undefined;
}

function mergeCompany(
  match: Company,
  args: {
    sourceId: string;
    label: string;
    address: string;
    region: string;
    sector: string;
    kvk_number?: string;
    website_url?: string;
    specialism?: string;
    incomingCaps: string[];
    phone?: string;
    email?: string;
    serviceContexts?: ServiceContext[];
    now: string;
  },
): Company {
  const nextContexts =
    (match.serviceContexts ?? []).length > 0
      ? match.serviceContexts
      : args.serviceContexts ?? match.serviceContexts;
  return {
    ...match,
    source_ids: uniqStrings([...(match.source_ids ?? []), args.sourceId]),
    list_membership: uniqStrings([
      ...(match.list_membership ?? []),
      args.label,
    ]),
    address: fillBlank(match.address, args.address) ?? match.address ?? "",
    region: fillBlank(match.region, args.region) ?? match.region ?? "",
    sector: fillBlank(match.sector, args.sector) ?? match.sector ?? "",
    kvk_number: fillBlank(match.kvk_number, args.kvk_number),
    website_url: fillBlank(match.website_url, args.website_url),
    specialism: fillBlank(match.specialism, args.specialism),
    capabilities: args.incomingCaps.length ? args.incomingCaps : match.capabilities,
    phone: fillBlank(match.phone, args.phone),
    email: fillBlank(match.email, args.email),
    serviceContexts: nextContexts ?? [],
    updatedAt: args.now,
  };
}

/**
 * Batch-create / merge company candidates for a trusted source list.
 * Waterfall dedup: KvK (8 digits) → email/website domain → name + 4-digit postcode.
 */
export async function importCompaniesForMission(
  store: Store,
  args: {
    missionId: string;
    sourceId: string;
    listLabel: string;
    rows: CompanyImportRow[];
    producer?: Producer;
    /** Skip rows that do not match an existing company (niche match-only). */
    matchOnly?: boolean;
    status?: Company["status"];
    serviceContexts?: ServiceContext[];
  },
): Promise<CompanyImportResult> {
  const { missionId, sourceId, listLabel, rows } = args;
  const producer: Producer = args.producer ?? "Human";
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
  const companies = [...existing];
  let indexes = buildCompanyIndexes(companies);

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
    const website_url = normalizeWebsite(row.website_url);
    const specialism = (row.specialism ?? "").trim() || undefined;
    const incomingCaps = servicesToCapabilities(specialism);
    const address = (row.address ?? "").trim();
    const region = (row.region ?? "").trim();
    const sector = (row.sector ?? "").trim() || specialism?.replace(/,/g, ";") || "";
    const kvk_number = (row.kvk_number ?? "").trim() || undefined;
    const phone = normalizePhone(row.phone);
    const email = normalizeEmail(row.email);

    const matchIndex = findCompanyMatchIndex(
      { name, kvk_number, website_url, email, address, region },
      indexes,
    );
    const match = matchIndex != null ? companies[matchIndex] : undefined;

    if (match) {
      const next = mergeCompany(match, {
        sourceId,
        label,
        address,
        region,
        sector,
        kvk_number,
        website_url,
        specialism,
        incomingCaps,
        phone,
        email,
        serviceContexts: args.serviceContexts,
        now,
      });
      const saved = (await store.upsert("companies", next)) as Company;
      companies[matchIndex!] = saved;
      indexes = buildCompanyIndexes(companies);
      touched.push(saved);
      updated += 1;
      continue;
    }

    if (args.matchOnly) {
      skipped += 1;
      continue;
    }

    const company: Company = {
      id: randomUUID(),
      missionId,
      producer,
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
      status: args.status ?? "candidate",
      capabilities: incomingCaps,
      serviceContexts: args.serviceContexts ?? [],
      differentiators: [],
      servicedElementCodes: [],
      website_url,
      phone,
      email,
      createdAt: now,
      updatedAt: now,
      v: 1,
    };
    const saved = (await store.upsert("companies", company)) as Company;
    companies.push(saved);
    indexes = buildCompanyIndexes(companies);
    touched.push(saved);
    created += 1;
  }

  if (rows.length === 0) {
    warnings.push("No rows in import payload");
  }

  return { created, updated, skipped, companies: touched, warnings };
}

export { mergeCompany };

export class CompanyImportError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "CompanyImportError";
    this.status = status;
  }
}
