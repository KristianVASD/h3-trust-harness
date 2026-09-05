import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Source } from "@h3-trust/schema";
import { fetchPage, stripTags } from "./fetch-page.js";
import { isJunkCompanyName, isRegistryOrSearchWall } from "./source-guards.js";
import {
  extractPlaagdierMapJs,
  isPlaagdierList,
  type ScrapedCompany,
} from "./extractors/plaagdier.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");

export async function liveExtract(args: {
  source: Source;
}): Promise<{
  payload: { companies: Array<Record<string, unknown>> };
  csvPath?: string;
  notes: string;
  blocked?: boolean;
}> {
  const url = args.source.listUrl || args.source.url || "";
  if (!url) {
    return { payload: { companies: [] }, notes: "No listUrl on source" };
  }
  if (isRegistryOrSearchWall(args.source, url) && !/echteinstallateur|plaagdier/i.test(url)) {
    return {
      payload: { companies: [] },
      blocked: true,
      notes:
        "Registry / search-form (e.g. KvK) is not a member list. Do not scrape page chrome as companies. Human CSV or single lookup only.",
    };
  }
  const page = await fetchPage(url);
  if (!page.ok) {
    return {
      payload: { companies: [] },
      notes: `Fetch failed ${page.status} ${url}`,
    };
  }

  let rows: ScrapedCompany[] = [];
  let notes = "";
  const guideNotes = args.source.extractionGuide?.notes ?? "";

  if (/echteinstallateur/i.test(url)) {
    const fromCsv = await readLocalCsv("echteinstallateur-electro.csv");
    if (fromCsv.length) {
      rows = fromCsv;
      notes = `local-csv echteinstallateur-electro · ${rows.length} rows`;
    }
  }
  if (
    !rows.length &&
    (isPlaagdierList(page.html, page.url) ||
      /plaagdier-map-js|extractor=plaagdier/i.test(guideNotes))
  ) {
    rows = await extractPlaagdierMapJs(page.html);
    notes = `plaagdier-map-js · ${rows.length} rows`;
  } else if (!rows.length && args.source.extractionGuide?.listPattern === "table") {
    rows = extractTable(page.html);
    notes = `html-table · ${rows.length} rows`;
  } else if (!rows.length) {
    rows = extractLooseCards(page.html);
    notes = `loose-cards · ${rows.length} rows`;
  }

  const companies = rows
    .filter((r) => r.name.trim() && !isJunkCompanyName(r.name))
    .map((r) => ({
      name: r.name.trim(),
      address: r.address,
      region: r.region,
      website_url: r.website_url,
      phone: r.phone,
      email: r.email,
      specialism: r.specialism,
      source_ids: [args.source.id],
      list_membership: [args.source.name],
      fieldsExtracted: [
        "name",
        r.website_url ? "website" : null,
        r.phone ? "phone" : null,
        r.email ? "email" : null,
        r.address ? "address" : null,
        r.specialism ? "specialism" : null,
      ].filter(Boolean),
    }));

  const csvPath = await writeCsvMirror(args.source, companies);
  return { payload: { companies }, csvPath, notes };
}

async function readLocalCsv(fileName: string): Promise<ScrapedCompany[]> {
  try {
    const raw = await readFile(join(ROOT, "writable", "docs", "data", fileName), "utf8");
    const lines = raw.split(/\r?\n/).filter((l) => l.trim());
    const header = splitCsv(lines[0] ?? "");
    const idx = (name: string) => header.findIndex((h) => h.toLowerCase() === name);
    const nameI = idx("name");
    if (nameI < 0) return [];
    return lines.slice(1).map((line) => {
      const cells = splitCsv(line);
      return {
        name: cells[nameI] ?? "",
        address: cells[idx("address")] || undefined,
        region: cells[idx("region")] || undefined,
        website_url: cells[idx("website")] || cells[idx("website_url")] || undefined,
        phone: cells[idx("phone")] || undefined,
        email: cells[idx("email")] || undefined,
        specialism: cells[idx("specialism")] || undefined,
      };
    }).filter((r) => r.name.trim());
  } catch {
    return [];
  }
}

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (const ch of line) {
    if (ch === '"') {
      q = !q;
      continue;
    }
    if (ch === "," && !q) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function extractTable(html: string): ScrapedCompany[] {
  const rows: ScrapedCompany[] = [];
  const trs = html.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
  for (const tr of trs.slice(1, 400)) {
    const cells = [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) =>
      stripTags(m[1] ?? "").trim(),
    );
    if (!cells[0] || cells[0].length < 2) continue;
    if (/naam|name|bedrijf/i.test(cells[0]) && cells.length <= 2) continue;
    rows.push({
      name: cells[0],
      address: cells[1],
      website_url: cells.find((c) => /\./.test(c) && !c.includes(" ")),
      phone: cells.find((c) => /^0[\d\s-]{7,}/.test(c)),
      email: cells.find((c) => c.includes("@")),
    });
  }
  return rows;
}

function extractLooseCards(html: string): ScrapedCompany[] {
  const names = [
    ...html.matchAll(/<(?:h2|h3|strong)[^>]*>([^<]{3,80})<\/(?:h2|h3|strong)>/gi),
  ]
    .map((m) => stripTags(m[1] ?? "").trim())
    .filter((n) => n && !isJunkCompanyName(n) && !/leden|contact|zoek|specialisatie|login/i.test(n));
  return [...new Set(names)].slice(0, 200).map((name) => ({ name }));
}

async function writeCsvMirror(
  source: Source,
  companies: Array<Record<string, unknown>>,
): Promise<string | undefined> {
  if (!companies.length) return undefined;
  const slug = (source.name || source.id)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  const dir = join(ROOT, "writable", "docs", "data");
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${slug}-omega.csv`);
  const headers = ["name", "address", "website_url", "phone", "email", "specialism"];
  const lines = [
    headers.join(","),
    ...companies.map((c) =>
      headers
        .map((h) => csvCell(String(c[h] ?? "")))
        .join(","),
    ),
  ];
  await writeFile(path, lines.join("\n"), "utf8");
  return path;
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
