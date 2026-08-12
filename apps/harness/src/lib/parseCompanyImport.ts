export type ParsedCompanyRow = {
  name: string;
  address: string;
  region: string;
  sector: string;
  kvk_number?: string;
  website_url?: string;
  specialism?: string;
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
const HEADER_ALIASES: Record<keyof ParsedCompanyRow, string[]> = {
  name: ["name", "title", "company", "company_name"],
  address: ["address", "address_line", "street"],
  region: ["region", "city", "locality", "place"],
  sector: ["sector", "category"],
  kvk_number: ["kvk_number", "kvk", "kvk_nr"],
  website_url: ["website_url", "website", "url", "site"],
  specialism: ["specialism", "services", "service"],
};

const ALL_HEADER_KEYS = new Set(
  Object.values(HEADER_ALIASES).flatMap((aliases) => aliases),
);

function cellFor(
  headers: string[],
  cells: string[],
  field: keyof ParsedCompanyRow,
  positionalFallback: number,
  hasHeader: boolean,
): string {
  if (!hasHeader) {
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

/**
 * Parse pasted plain text or CSV into company candidate rows.
 * - Line mode: one company name per non-empty line
 * - CSV mode: header aliases for name/title, address, region/city, website, services, …
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
    const sector =
      cellFor(firstCells, cells, "sector", 4, hasHeader) ||
      (specialism ? specialism.replace(/,/g, ";") : "");
    rows.push({
      name,
      address: cellFor(firstCells, cells, "address", 1, hasHeader),
      region: cellFor(firstCells, cells, "region", 2, hasHeader),
      sector,
      kvk_number: kvk || undefined,
      website_url: normalizeWebsiteUrl(websiteRaw),
      specialism: specialism || undefined,
    });
  }
  return rows;
}
