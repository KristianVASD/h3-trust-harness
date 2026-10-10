import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
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

export function createPlaceCellStore(writableRoot: string | undefined): PlaceCellStore {
  const root = path.join(writableRoot || path.resolve(process.cwd(), "writable"), "place-cells");

  async function file(id: string): Promise<string> {
    await mkdir(root, { recursive: true });
    return path.join(root, `${safeId(id)}.json`);
  }

  return {
    async list() {
      await mkdir(root, { recursive: true });
      const names = await readdir(root);
      const out: PlaceCell[] = [];
      for (const name of names) {
        if (!name.endsWith(".json") || name === "geo-cache.json") continue;
        try {
          const raw = JSON.parse(await readFile(path.join(root, name), "utf8"));
          const parsed = PlaceCellSchema.safeParse(raw);
          if (parsed.success) out.push(parsed.data);
        } catch {
          /* skip corrupt */
        }
      }
      return out;
    },
    async get(id) {
      try {
        const raw = JSON.parse(await readFile(await file(id), "utf8"));
        const parsed = PlaceCellSchema.safeParse(raw);
        return parsed.success ? parsed.data : null;
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
