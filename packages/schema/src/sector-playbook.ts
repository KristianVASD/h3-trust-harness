import { DISCOVERY_CHANNELS, type DiscoveryChannelDef } from "./nation-landscape";

function stripPlaybookFences(raw: string): string {
  const fenced = raw.match(/```(?:json|csv|text)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] ?? raw).trim();
}

export type SectorPlaybookDraft = {
  layer: "national" | "regional" | "local";
  category: string;
  channelTitle: string;
  name: string;
  suggestedWeight?: number;
  url?: string;
  listUrl?: string;
  filterHints?: string;
  reason?: string;
  notes?: string;
};

function foldLabel(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function cell(rec: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const hit = rec[key];
    if (typeof hit === "string" && hit.trim()) return hit.trim();
    if (typeof hit === "number" && Number.isFinite(hit)) return String(hit);
  }
  return "";
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
        continue;
      }
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

function parseCsvTable(text: string): Record<string, unknown>[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]!).map((h) =>
    h.trim().toLowerCase().replace(/\s+/g, "_"),
  );
  const rows: Record<string, unknown>[] = [];
  for (const line of lines.slice(1)) {
    const values = splitCsvLine(line);
    const rec: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      rec[h] = values[i] ?? "";
    });
    rows.push(rec);
  }
  return rows;
}

function parseWeight(raw: string): number | undefined {
  const n = Number(String(raw).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function foldAudience(raw: string): string {
  const f = foldLabel(raw);
  if (!f || f === "unknown") return "unknown";
  if (f === "b2c" || f === "private" || f.includes("b2c") || f.includes("private")) {
    return "private";
  }
  if (f === "b2b" || f === "commercial" || f.includes("b2b") || f.includes("commercial")) {
    return "commercial";
  }
  if (f === "hoa" || f === "vve" || f.includes("hoa") || f.includes("vve")) {
    return "hoa";
  }
  if (f.includes("municipal")) return "municipal";
  return f;
}

function foldPurity(raw: string): string {
  const f = foldLabel(raw);
  if (f.includes("mixed")) return "mixed";
  if (f.includes("niche")) return "niche";
  return f;
}

export function sourceTypeForCategory(
  category: string,
): "registry" | "association" | "directory" | "municipality" | "news" {
  if (category === "registry") return "registry";
  if (
    category === "branch_association" ||
    category === "local_business_association" ||
    category === "networking_group"
  ) {
    return "association";
  }
  if (category === "municipal_initiative") return "municipality";
  if (category === "local_media") return "news";
  return "directory";
}

function matchChannel(partial: {
  layer?: string;
  category?: string;
  title?: string;
}): DiscoveryChannelDef | null {
  const layerRaw = foldLabel(partial.layer ?? "");
  const categoryRaw = foldLabel(partial.category ?? "");
  if (
    (layerRaw === "national" || layerRaw === "regional" || layerRaw === "local") &&
    categoryRaw
  ) {
    const exact = DISCOVERY_CHANNELS.find(
      (c) => c.layer === layerRaw && foldLabel(c.category) === categoryRaw,
    );
    if (exact) return exact;
  }

  const title = foldLabel(partial.title ?? "");
  if (title) {
    const byTitle = DISCOVERY_CHANNELS.find((c) => {
      const t = foldLabel(c.title);
      const s = foldLabel(c.shortLabel);
      return (
        t === title ||
        s === title ||
        t.includes(title) ||
        title.includes(t) ||
        s.includes(title) ||
        title.includes(s)
      );
    });
    if (byTitle) return byTitle;
  }

  const combo = foldLabel(
    [partial.layer, partial.category, partial.title].filter(Boolean).join(" "),
  );
  if (combo) {
    const hit = DISCOVERY_CHANNELS.find((c) => {
      const key = foldLabel(`${c.layer} ${c.category}`);
      const titled = foldLabel(`${c.layer} ${c.title}`);
      return combo.includes(key) || combo.includes(titled) || key === combo;
    });
    if (hit) return hit;
  }
  return null;
}

function coerceRow(raw: unknown): SectorPlaybookDraft | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const name = cell(rec, [
    "source_name",
    "sourceName",
    "name",
    "title",
    "list",
    "list_name",
  ]);
  if (!name) return null;

  const channelRaw = cell(rec, ["channel", "chapter", "door_channel"]);
  const categoryCell = cell(rec, ["category", "type", "list_type"]);
  let layer = cell(rec, ["layer", "scope"]);
  let category = categoryCell;
  if (!layer && categoryCell.includes("/")) {
    const [left, ...rest] = categoryCell.split("/");
    layer = left.trim();
    category = rest.join("/").trim();
  }
  const ch = matchChannel({
    layer,
    category,
    title: channelRaw || (categoryCell.includes("/") ? "" : categoryCell),
  });
  if (!ch) return null;

  const weight = parseWeight(
    cell(rec, ["trust_weight", "suggestedWeight", "weight", "score"]),
  );
  const url = cell(rec, ["url", "href", "source_url"]) || undefined;
  const listUrl = cell(rec, ["listUrl", "list_url"]) || url;
  const matchKeys = cell(rec, ["match_keys", "matchKeys", "dedup"]);
  const notesRaw = cell(rec, ["notes", "note", "reason", "comment"]);
  const purity = foldPurity(cell(rec, ["sector_purity", "purity", "mixed"]));
  const audience = foldAudience(
    cell(rec, ["service_context_default", "audience", "default_audience", "for"]),
  );
  const meta = [
    purity ? `purity=${purity}` : "",
    audience ? `audience=${audience}` : "",
    matchKeys ? `match=${matchKeys}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const notes = [meta, notesRaw].filter(Boolean).join("\n") || undefined;

  return {
    layer: ch.layer,
    category: ch.category,
    channelTitle: ch.title,
    name,
    suggestedWeight: weight,
    url,
    listUrl,
    filterHints: matchKeys || undefined,
    reason: notesRaw || notes,
    notes,
  };
}

function incomingRows(doc: unknown): unknown[] {
  if (Array.isArray(doc)) return doc;
  const rec = asRecord(doc);
  if (!rec) return [];
  const nested =
    rec.rows ?? rec.channels ?? rec.sources ?? rec.entries ?? rec.items ?? rec.playbook;
  return Array.isArray(nested) ? nested : [];
}

/**
 * Accept paste from Qwen / Cursor: CSV with channel/source_name/weight,
 * JSON array, { rows }, or a fenced block. Unmatched channels are dropped.
 */
export function coerceSectorPlaybook(raw: unknown): SectorPlaybookDraft[] {
  let doc: unknown = raw;
  if (typeof raw === "string") {
    const text = stripPlaybookFences(raw).replace(/^\uFEFF/, "");
    if (!text) return [];
    try {
      doc = JSON.parse(text);
    } catch {
      const csvRows = parseCsvTable(text);
      if (csvRows.length) {
        return csvRows
          .map(coerceRow)
          .filter((d): d is SectorPlaybookDraft => Boolean(d));
      }
      return [];
    }
  }

  const rec = asRecord(doc);
  if (rec?.playbook && !Array.isArray(doc)) {
    return coerceSectorPlaybook(rec.playbook);
  }
  if (rec?.data && !rec.rows && !rec.channels) {
    return coerceSectorPlaybook(rec.data);
  }

  return incomingRows(doc)
    .map(coerceRow)
    .filter((d): d is SectorPlaybookDraft => Boolean(d));
}
