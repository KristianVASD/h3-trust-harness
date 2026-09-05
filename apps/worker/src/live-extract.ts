import { writeFile, mkdir } from "node:fs/promises";
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
  if (isRegistryOrSearchWall(args.source, url)) {
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

  if (
    isPlaagdierList(page.html, page.url) ||
    /plaagdier-map-js|extractor=plaagdier/i.test(guideNotes)
  ) {
    rows = await extractPlaagdierMapJs(page.html);
    notes = `plaagdier-map-js · ${rows.length} rows`;
  } else if (args.source.extractionGuide?.listPattern === "table") {
    rows = extractTable(page.html);
    notes = `html-table · ${rows.length} rows`;
  } else {
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
