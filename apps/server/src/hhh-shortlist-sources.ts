import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalWebsite } from "@h3-trust/schema";
import { geocodeNl } from "./pdok-geocode.js";

export type LocalSourceKind = "ov" | "sport" | "festivity";

export type LocalSourceRow = {
  id: string;
  kind: LocalSourceKind;
  name: string;
  town: string | null;
  postcode: string | null;
  lat: number | null;
  lon: number | null;
  website: string;
  active: boolean;
};

export type ParsedLocalSource = {
  kind: "ov" | "sport";
  name: string;
  town: string;
  postcode: string;
  website: string;
};

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (ch === "," && !quoted) {
      out.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current.trim());
  return out;
}

export function parseLocalSourceCsv(text: string): {
  rows: ParsedLocalSource[];
  skipped: number;
} {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return { rows: [], skipped: 0 };
  const header = splitCsvLine(lines[0] ?? "").map((cell) => cell.toLowerCase());
  const hasHeader = header.includes("website") && header.includes("kind");
  const start = hasHeader ? 1 : 0;
  const index = (name: string, fallback: number) => {
    const at = header.indexOf(name);
    return hasHeader && at >= 0 ? at : fallback;
  };
  const kindAt = index("kind", 0);
  const nameAt = index("name", 1);
  const townAt = index("town", 2);
  const postcodeAt = index("postcode", 3);
  const websiteAt = index("website", 4);
  const bySite = new Map<string, ParsedLocalSource>();
  let skipped = 0;
  for (const line of lines.slice(start)) {
    const cells = splitCsvLine(line);
    const kind = (cells[kindAt] ?? "").trim().toLowerCase();
    const name = (cells[nameAt] ?? "").trim();
    const website = canonicalWebsite(cells[websiteAt] ?? "");
    if ((kind !== "ov" && kind !== "sport") || !name || !website) {
      skipped += 1;
      continue;
    }
    bySite.set(website, {
      kind,
      name,
      town: (cells[townAt] ?? "").trim(),
      postcode: (cells[postcodeAt] ?? "").trim(),
      website,
    });
  }
  return { rows: [...bySite.values()], skipped };
}

export async function upsertLocalSources(
  admin: SupabaseClient,
  rows: ParsedLocalSource[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const { data, error } = await admin
    .from("local_sources")
    .select("id,website")
    .in(
      "website",
      rows.map((row) => row.website),
    );
  if (error) throw new Error(error.message);
  const existing = new Map(
    (data ?? []).map((row) => [String(row.website), String(row.id)] as const),
  );
  const inserts: Record<string, unknown>[] = [];
  const updates: { id: string; row: ParsedLocalSource }[] = [];
  for (const row of rows) {
    const id = existing.get(row.website);
    if (id) updates.push({ id, row });
    else {
      inserts.push({
        id: randomUUID(),
        kind: row.kind,
        name: row.name,
        town: row.town || null,
        postcode: row.postcode || null,
        website: row.website,
        active: true,
      });
    }
  }
  if (inserts.length > 0) {
    const inserted = await admin.from("local_sources").insert(inserts);
    if (inserted.error) throw new Error(inserted.error.message);
  }
  await Promise.all(
    updates.map(async ({ id, row }) => {
      const updated = await admin
        .from("local_sources")
        .update({
          kind: row.kind,
          name: row.name,
          town: row.town || null,
          postcode: row.postcode || null,
          active: true,
        })
        .eq("id", id);
      if (updated.error) throw new Error(updated.error.message);
    }),
  );
  return rows.length;
}

export async function listActiveLocalSources(
  admin: SupabaseClient,
): Promise<LocalSourceRow[]> {
  const { data, error } = await admin
    .from("local_sources")
    .select("id,kind,name,town,postcode,lat,lon,website,active")
    .eq("active", true)
    .in("kind", ["ov", "sport"]);
  if (error) throw new Error(error.message);
  return (data ?? []) as LocalSourceRow[];
}

export async function summarizeLocalSources(admin: SupabaseClient): Promise<{
  ov: number;
  sport: number;
  located: number;
  pending: number;
}> {
  const { data, error } = await admin
    .from("local_sources")
    .select("kind,lat")
    .eq("active", true)
    .in("kind", ["ov", "sport"]);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  return {
    ov: rows.filter((row) => row.kind === "ov").length,
    sport: rows.filter((row) => row.kind === "sport").length,
    located: rows.filter((row) => typeof row.lat === "number").length,
    pending: rows.filter((row) => row.lat == null).length,
  };
}

export async function geocodePendingSources(
  admin: SupabaseClient,
  limit = 12,
): Promise<{ geocoded: number; remaining: boolean }> {
  const { data, error } = await admin
    .from("local_sources")
    .select("id,town,postcode,website")
    .eq("active", true)
    .is("lat", null)
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  let geocoded = 0;
  for (const row of rows) {
    const query = [row.postcode, row.town].filter(Boolean).join(" ").trim() || row.town || row.postcode;
    if (!query) continue;
    const hit =
      (await geocodeNl(String(query), "woonplaats")) ??
      (await geocodeNl(String(query), "adres"));
    if (!hit) continue;
    const { error: updateError } = await admin
      .from("local_sources")
      .update({ lat: hit.lat, lon: hit.lon })
      .eq("id", row.id);
    if (!updateError) geocoded += 1;
  }
  return { geocoded, remaining: rows.length === limit };
}
