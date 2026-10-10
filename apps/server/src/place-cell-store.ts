import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PlaceCellSchema, type PlaceCell } from "@h3-trust/schema";
import type { GeoHit } from "./pdok-geocode.js";

export type PlaceCellStore = {
  list(): Promise<PlaceCell[]>;
  get(id: string): Promise<PlaceCell | null>;
  upsert(cell: PlaceCell): Promise<PlaceCell>;
  getGeo(key: string): Promise<GeoHit | null>;
  putGeo(key: string, hit: GeoHit): Promise<void>;
};

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9-]/g, "");
}

function parseCell(raw: unknown): PlaceCell | null {
  const parsed = PlaceCellSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function createFilePlaceCells(writableRoot: string | undefined): PlaceCellStore {
  const root = path.join(
    writableRoot || path.resolve(process.cwd(), "writable"),
    "place-cells",
  );

  async function file(id: string): Promise<string> {
    await mkdir(root, { recursive: true });
    return path.join(root, `${safeId(id)}.json`);
  }

  return {
    async list() {
      try {
        await mkdir(root, { recursive: true });
        const names = await readdir(root);
        const out: PlaceCell[] = [];
        for (const name of names) {
          if (!name.endsWith(".json") || name === "geo-cache.json") continue;
          try {
            const raw = JSON.parse(await readFile(path.join(root, name), "utf8"));
            const cell = parseCell(raw);
            if (cell) out.push(cell);
          } catch {
            /* skip corrupt */
          }
        }
        return out;
      } catch {
        return [];
      }
    },
    async get(id) {
      try {
        const raw = JSON.parse(await readFile(await file(id), "utf8"));
        return parseCell(raw);
      } catch {
        return null;
      }
    },
    async upsert(cell) {
      const next = PlaceCellSchema.parse({
        ...cell,
        updatedAt: new Date().toISOString(),
      });
      await writeFile(await file(next.id), `${JSON.stringify(next, null, 2)}\n`);
      return next;
    },
    async getGeo(key) {
      try {
        const raw = JSON.parse(await readFile(path.join(root, "geo-cache.json"), "utf8")) as Record<
          string,
          GeoHit
        >;
        return raw[key] ?? null;
      } catch {
        return null;
      }
    },
    async putGeo(key, hit) {
      await mkdir(root, { recursive: true });
      const filePath = path.join(root, "geo-cache.json");
      let cache: Record<string, GeoHit> = {};
      try {
        cache = JSON.parse(await readFile(filePath, "utf8")) as Record<string, GeoHit>;
      } catch {
        cache = {};
      }
      cache[key] = hit;
      await writeFile(filePath, `${JSON.stringify(cache, null, 2)}\n`);
    },
  };
}

function createSupabasePlaceCells(
  db: SupabaseClient,
  files: PlaceCellStore,
): PlaceCellStore {
  return {
    async list() {
      const { data, error } = await db.from("place_cells").select("payload");
      if (error) return files.list();
      const out: PlaceCell[] = [];
      for (const row of data ?? []) {
        const cell = parseCell((row as { payload?: unknown }).payload);
        if (cell) out.push(cell);
      }
      return out;
    },
    async get(id) {
      const { data, error } = await db
        .from("place_cells")
        .select("payload")
        .eq("id", id)
        .maybeSingle();
      if (error) return files.get(id);
      return parseCell(data?.payload) ?? files.get(id);
    },
    async upsert(cell) {
      const next = PlaceCellSchema.parse({
        ...cell,
        updatedAt: new Date().toISOString(),
      });
      const { error } = await db.from("place_cells").upsert(
        {
          id: next.id,
          country_slug: next.countrySlug,
          payload: next,
          updated_at: next.updatedAt,
        },
        { onConflict: "id" },
      );
      if (error) {
        try {
          return await files.upsert(next);
        } catch {
          throw new Error(
            `${error.message}. Apply supabase/migrations/20261010_place_cells.sql so address search can store places on the live site.`,
          );
        }
      }
      await files.upsert(next).catch(() => undefined);
      return next;
    },
    async getGeo(key) {
      const { data, error } = await db
        .from("place_geo_cache")
        .select("payload")
        .eq("cache_key", key)
        .maybeSingle();
      if (error || !data) return files.getGeo(key);
      return (data.payload as GeoHit | null) ?? null;
    },
    async putGeo(key, hit) {
      const { error } = await db.from("place_geo_cache").upsert(
        {
          cache_key: key,
          payload: hit,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "cache_key" },
      );
      if (error) {
        await files.putGeo(key, hit).catch(() => undefined);
      }
    },
  };
}

export function createPlaceCellStore(options: {
  admin: SupabaseClient | null;
  writableRoot?: string;
}): PlaceCellStore {
  const files = createFilePlaceCells(options.writableRoot);
  if (options.admin) return createSupabasePlaceCells(options.admin, files);
  return files;
}
