export type ParsedCompanyRow = {
  name: string;
  address: string;
  region: string;
  sector: string;
  kvk_number?: string;
  website_url?: string;
  specialism?: string;
  phone?: string;
  email?: string;
};

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

/** Canonical field ← accepted header aliases (source scrapes vary). */
const HEADER_ALIASES: Record<keyof ParsedCompanyRow | "postal_code", string[]> = {
  name: ["name", "title", "company", "company_name"],
  address: ["address", "address_line", "street"],
  region: ["region", "city", "locality", "place"],
  sector: ["sector", "category"],
  kvk_number: ["kvk_number", "kvk", "kvk_nr"],
  website_url: ["website_url", "website", "url", "site"],
  specialism: ["specialism", "services", "service"],
  phone: ["phone", "tel", "telephone", "public_phone"],
  email: ["email", "mailto", "mail", "public_email"],
  postal_code: ["postal_code", "postcode", "zip", "zipcode"],
};

const ALL_HEADER_KEYS = new Set(
  Object.values(HEADER_ALIASES).flatMap((aliases) => aliases),
);

function cellFor(
  headers: string[],
  cells: string[],
  field: keyof typeof HEADER_ALIASES,
  positionalFallback: number,
  hasHeader: boolean,
): string {
  if (!hasHeader) {
    if (positionalFallback < 0) return "";
    return (cells[positionalFallback] ?? "").trim();
  }
  for (const alias of HEADER_ALIASES[field]) {
    const idx = headers.indexOf(alias);
    if (idx >= 0) return (cells[idx] ?? "").trim();
  }
  return "";
}

/** Normalize scraped websites to absolute https URLs when scheme is missing. */
export function normalizeWebsiteUrl(raw: string): string | undefined {
  const value = raw.trim();
  if (!value) return undefined;
  const lower = value.toLowerCase();
  if (lower === "n.v.t." || lower === "nvt" || lower === "n/a" || lower === "-") {
    return undefined;
  }
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value.replace(/^\/\//, "")}`;
}

/** Strip tel: / mailto: prefixes from scrape exports. */
export function normalizePhone(raw: string): string | undefined {
  const value = raw.trim().replace(/^tel:\s*/i, "").trim();
  return value || undefined;
}

export function normalizeEmail(raw: string): string | undefined {
  const value = raw.trim().replace(/^mailto:\s*/i, "").trim();
  return value || undefined;
}

function composeAddress(street: string, postal: string, city: string): string {
  const parts = [street, postal, city].map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return "";
  // Avoid duplicating city/postal if street already contains them
  if (postal && street.includes(postal) && city && street.includes(city)) {
    return street;
  }
  if (parts.length === 1) return parts[0]!;
  if (street && (postal || city)) {
    const tail = [postal, city].filter(Boolean).join(" ");
    if (street.includes(tail)) return street;
    return `${street}, ${tail}`.replace(/,\s*$/, "");
  }
  return parts.join(", ");
}

/**
 * Parse pasted plain text or CSV into company candidate rows.
 * - Line mode: one company name per non-empty line
 * - CSV mode: header aliases for name/title, address, region/city, website, tel, mailto, …
 */
export function parseCompanyImport(raw: string): ParsedCompanyRow[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (!lines.length) return [];

  const looksCsv = lines.some((l) => l.includes(","));
  if (!looksCsv) {
    return lines.map((name) => ({
      name,
      address: "",
      region: "",
      sector: "",
    }));
  }

  const firstCells = splitCsvLine(lines[0]).map(normalizeHeader);
  const hasHeader = firstCells.some((c) => ALL_HEADER_KEYS.has(c));

  const dataLines = hasHeader ? lines.slice(1) : lines;
  const rows: ParsedCompanyRow[] = [];
  for (const line of dataLines) {
    const cells = splitCsvLine(line);
    const name = cellFor(firstCells, cells, "name", 0, hasHeader);
    if (!name) continue;
    const kvk = cellFor(firstCells, cells, "kvk_number", 3, hasHeader);
    const websiteRaw = cellFor(firstCells, cells, "website_url", -1, hasHeader);
    const specialism = cellFor(firstCells, cells, "specialism", -1, hasHeader);
    const street = cellFor(firstCells, cells, "address", 1, hasHeader);
    const postal = cellFor(firstCells, cells, "postal_code", -1, hasHeader);
    const cityOrRegion = cellFor(firstCells, cells, "region", 2, hasHeader);
    const sector =
      cellFor(firstCells, cells, "sector", 4, hasHeader) ||
      (specialism ? specialism.replace(/,/g, ";") : "");
    rows.push({
      name,
      address: composeAddress(street, postal, cityOrRegion),
      region: cityOrRegion,
      sector,
      kvk_number: kvk || undefined,
      website_url: normalizeWebsiteUrl(websiteRaw),
      specialism: specialism || undefined,
      phone: normalizePhone(cellFor(firstCells, cells, "phone", -1, hasHeader)),
      email: normalizeEmail(cellFor(firstCells, cells, "email", -1, hasHeader)),
    });
  }
  return rows;
}
