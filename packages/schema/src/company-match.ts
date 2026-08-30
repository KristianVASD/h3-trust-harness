import { extractNlPostcode4 } from "./place-clusters";

const LEGAL_SUFFIX =
  /\b(b\.?\s*v\.?|v\.?\s*o\.?\s*f\.?|n\.?\s*v\.?|bvba|vof|cvba|eenmanszaak)\b/gi;

export function normalizeCompanyName(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(LEGAL_SUFFIX, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeKvk(raw: string | undefined): string | undefined {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length === 8 ? digits : undefined;
}

export function hostnameFromUrl(raw: string | undefined): string | undefined {
  const value = (raw ?? "").trim().toLowerCase();
  if (!value || value === "n.v.t." || value === "nvt" || value === "n/a" || value === "-") {
    return undefined;
  }
  try {
    const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value.replace(/^\/\//, "")}`;
    const host = new URL(withScheme).hostname.replace(/^www\./, "");
    return host || undefined;
  } catch {
    return undefined;
  }
}

export function domainFromEmail(raw: string | undefined): string | undefined {
  const value = (raw ?? "").trim().toLowerCase().replace(/^mailto:\s*/i, "");
  const at = value.lastIndexOf("@");
  if (at < 0) return undefined;
  const domain = value.slice(at + 1).replace(/^www\./, "").trim();
  return domain || undefined;
}

export function matchDomain(raw: string | undefined): string | undefined {
  return hostnameFromUrl(raw) ?? domainFromEmail(raw);
}

export type MatchableCompany = {
  name: string;
  kvk_number?: string;
  website_url?: string;
  email?: string;
  address?: string;
  region?: string;
};

export type CompanyIndexes = {
  byKvk: Map<string, number>;
  byDomain: Map<string, number>;
  byNamePostcode: Map<string, number>;
};

export function namePostcodeKey(name: string, address?: string, region?: string): string | undefined {
  const n = normalizeCompanyName(name);
  const pc = extractNlPostcode4(`${address ?? ""} ${region ?? ""}`);
  if (!n || !pc) return undefined;
  return `${n}|${pc}`;
}

export function buildCompanyIndexes(companies: MatchableCompany[]): CompanyIndexes {
  const byKvk = new Map<string, number>();
  const byDomain = new Map<string, number>();
  const byNamePostcode = new Map<string, number>();
  companies.forEach((company, index) => {
    const kvk = normalizeKvk(company.kvk_number);
    if (kvk && !byKvk.has(kvk)) byKvk.set(kvk, index);
    const domain = matchDomain(company.website_url) ?? matchDomain(company.email);
    if (domain && !byDomain.has(domain)) byDomain.set(domain, index);
    const np = namePostcodeKey(company.name, company.address, company.region);
    if (np && !byNamePostcode.has(np)) byNamePostcode.set(np, index);
  });
  return { byKvk, byDomain, byNamePostcode };
}

/**
 * Waterfall: KvK → email/website domain → normalized name + 4-digit postcode.
 */
export function findCompanyMatchIndex(
  row: MatchableCompany,
  indexes: CompanyIndexes,
): number | undefined {
  const kvk = normalizeKvk(row.kvk_number);
  if (kvk) {
    const hit = indexes.byKvk.get(kvk);
    if (hit != null) return hit;
  }
  const domain = matchDomain(row.website_url) ?? matchDomain(row.email);
  if (domain) {
    const hit = indexes.byDomain.get(domain);
    if (hit != null) return hit;
  }
  const np = namePostcodeKey(row.name, row.address, row.region);
  if (np) {
    const hit = indexes.byNamePostcode.get(np);
    if (hit != null) return hit;
  }
  return undefined;
}

export const HOME_SERVICE_NAME_TOKENS = [
  "schilder",
  "painter",
  "elektr",
  "dak",
  "roof",
  "hovenier",
  "groen",
  "tuin",
  "klus",
  "onderhoud",
  "installat",
  "loodgieter",
  "plumber",
  "timmer",
  "stukado",
  "riool",
  "cv ",
  "warmtepomp",
  "glaszet",
  "gevel",
  "isolat",
] as const;

export function nameLooksLikeHomeService(name: string): boolean {
  const hay = ` ${normalizeCompanyName(name)} `;
  return HOME_SERVICE_NAME_TOKENS.some((token) => hay.includes(token));
}
