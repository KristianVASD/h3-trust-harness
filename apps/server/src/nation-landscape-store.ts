import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  NationLandscapeSchema,
  countrySlug,
  emptyNationLandscape,
  mergeLandscapeChannels,
  type NationLandscape,
} from "@h3-trust/schema";

export type NationLandscapeStore = {
  list(): Promise<NationLandscape[]>;
  get(country: string): Promise<NationLandscape | null>;
  upsert(landscape: NationLandscape): Promise<NationLandscape>;
  ensure(country: string): Promise<{ landscape: NationLandscape; created: boolean }>;
};

function fileSafeSlug(country: string): string {
  return countrySlug(country).replace(/[^a-z0-9-]+/g, "-");
}

function parseLandscape(raw: unknown): NationLandscape | null {
  const parsed = NationLandscapeSchema.safeParse(raw);
  if (!parsed.success) return null;
  return mergeLandscapeChannels(parsed.data);
}

class FileNationStore implements NationLandscapeStore {
  constructor(private readonly rootDir: string) {}

  private dir(): string {
    return path.join(this.rootDir, "nations");
  }

  private file(country: string): string {
    return path.join(this.dir(), `${fileSafeSlug(country)}.json`);
  }

  async list(): Promise<NationLandscape[]> {
    await mkdir(this.dir(), { recursive: true });
    const names = await readdir(this.dir());
    const out: NationLandscape[] = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      try {
        const raw = JSON.parse(await readFile(path.join(this.dir(), name), "utf8"));
        const landscape = parseLandscape(raw);
        if (landscape) out.push(landscape);
      } catch {
        /* skip corrupt */
      }
    }
    return out.sort((a, b) => a.country.localeCompare(b.country));
  }

  async get(country: string): Promise<NationLandscape | null> {
    try {
      const raw = JSON.parse(await readFile(this.file(country), "utf8"));
      return parseLandscape(raw);
    } catch {
      return null;
    }
  }

  async upsert(landscape: NationLandscape): Promise<NationLandscape> {
    await mkdir(this.dir(), { recursive: true });
    const next = mergeLandscapeChannels(
      NationLandscapeSchema.parse({
        ...landscape,
        countrySlug: countrySlug(landscape.country),
        updatedAt: new Date().toISOString(),
      }),
    );
    await writeFile(this.file(next.country), `${JSON.stringify(next, null, 2)}\n`);
    return next;
  }

  async ensure(country: string): Promise<{ landscape: NationLandscape; created: boolean }> {
    const existing = await this.get(country);
    if (existing) return { landscape: existing, created: false };
    const landscape = await this.upsert(emptyNationLandscape(country));
    return { landscape, created: true };
  }
}

class SupabaseNationStore implements NationLandscapeStore {
  constructor(
    private readonly db: SupabaseClient,
    private readonly fallback: FileNationStore | null,
  ) {}

  async list(): Promise<NationLandscape[]> {
    const { data, error } = await this.db
      .from("nation_landscapes")
      .select("payload")
      .order("updated_at", { ascending: false });
    if (error) {
      if (this.fallback) return this.fallback.list();
      return [];
    }
    const out: NationLandscape[] = [];
    for (const row of data ?? []) {
      const landscape = parseLandscape(row.payload);
      if (landscape) out.push(landscape);
    }
    return out.sort((a, b) => a.country.localeCompare(b.country));
  }

  async get(country: string): Promise<NationLandscape | null> {
    const slug = countrySlug(country);
    const { data, error } = await this.db
      .from("nation_landscapes")
      .select("payload")
      .eq("country_slug", slug)
      .maybeSingle();
    if (error) {
      if (this.fallback) return this.fallback.get(country);
      return null;
    }
    return parseLandscape(data?.payload) ?? (this.fallback ? this.fallback.get(country) : null);
  }

  async upsert(landscape: NationLandscape): Promise<NationLandscape> {
    const next = mergeLandscapeChannels(
      NationLandscapeSchema.parse({
        ...landscape,
        countrySlug: countrySlug(landscape.country),
        updatedAt: new Date().toISOString(),
      }),
    );
    const { error } = await this.db.from("nation_landscapes").upsert(
      {
        country_slug: next.countrySlug,
        country: next.country,
        status: next.status,
        payload: next,
        updated_at: next.updatedAt,
      },
      { onConflict: "country_slug" },
    );
    if (error) {
      if (this.fallback) return this.fallback.upsert(next);
      throw new Error(error.message);
    }
    if (this.fallback) {
      await this.fallback.upsert(next).catch(() => undefined);
    }
    return next;
  }

  async ensure(country: string): Promise<{ landscape: NationLandscape; created: boolean }> {
    const existing = await this.get(country);
    if (existing) return { landscape: existing, created: false };
    const landscape = await this.upsert(emptyNationLandscape(country));
    return { landscape, created: true };
  }
}

class MemoryNationStore implements NationLandscapeStore {
  private readonly bySlug = new Map<string, NationLandscape>();

  async list(): Promise<NationLandscape[]> {
    return [...this.bySlug.values()].sort((a, b) => a.country.localeCompare(b.country));
  }

  async get(country: string): Promise<NationLandscape | null> {
    return this.bySlug.get(countrySlug(country)) ?? null;
  }

  async upsert(landscape: NationLandscape): Promise<NationLandscape> {
    const next = mergeLandscapeChannels(
      NationLandscapeSchema.parse({
        ...landscape,
        countrySlug: countrySlug(landscape.country),
        updatedAt: new Date().toISOString(),
      }),
    );
    this.bySlug.set(next.countrySlug, next);
    return next;
  }

  async ensure(country: string): Promise<{ landscape: NationLandscape; created: boolean }> {
    const existing = await this.get(country);
    if (existing) return { landscape: existing, created: false };
    const landscape = await this.upsert(emptyNationLandscape(country));
    return { landscape, created: true };
  }
}

export function createNationLandscapeStore(options: {
  admin: SupabaseClient | null;
  writableRoot?: string;
}): NationLandscapeStore {
  const file = options.writableRoot
    ? new FileNationStore(options.writableRoot)
    : null;
  if (options.admin) {
    return new SupabaseNationStore(options.admin, file);
  }
  if (file) return file;
  return new MemoryNationStore();
}
