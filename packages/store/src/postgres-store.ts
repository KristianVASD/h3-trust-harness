import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  ExportBundleSchema,
  SourceSchema,
  type CollectionName,
  type ExportBundle,
  type Mission,
  type MissionSource,
  type Pattern,
  type Producer,
  type Source,
} from "@h3-trust/schema";
import {
  CollectionNameSchema,
  entitySchemas,
  missionKey,
  nowIso,
  sortByUpdatedDesc,
} from "./schemas.js";
import {
  emptySourceSummary,
  liteRowFromUnknown,
  summarizeSourceLiteRows,
  type SourceLiteRow,
  type SourceMissionSummary,
} from "./source-summary.js";
import type { EntityMap, MissionScopedCollection, Store } from "./types.js";

type EntityRow = {
  collection: string;
  id: string;
  mission_id: string | null;
  payload: unknown;
  updated_at: string;
  v: number;
};

/** PostgREST returns at most 1000 rows unless we page. */
const ENTITY_PAGE_SIZE = 1000;

export type PostgresStoreOptions = {
  url: string;
  serviceRoleKey: string;
};

export class PostgresStore implements Store {
  private readonly db: SupabaseClient;

  constructor(options: PostgresStoreOptions) {
    this.db = createClient(options.url, options.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  private async fetchPayloads(
    collection: string,
    missionId?: string,
  ): Promise<unknown[]> {
    const payloads: unknown[] = [];
    for (let offset = 0; ; offset += ENTITY_PAGE_SIZE) {
      let query = this.db
        .from("entities")
        .select("payload")
        .eq("collection", collection)
        .order("id", { ascending: true })
        .range(offset, offset + ENTITY_PAGE_SIZE - 1);
      if (missionId) {
        query = query.eq("mission_id", missionId);
      }
      const { data, error } = await query;
      if (error) {
        throw new Error(
          `entities list ${collection}${missionId ? `/${missionId}` : ""}: ${error.message}`,
        );
      }
      const page = data ?? [];
      for (const row of page) payloads.push(row.payload);
      if (page.length < ENTITY_PAGE_SIZE) break;
    }
    return payloads;
  }

  /** Expose client for auth/admin helpers on the server. */
  get client(): SupabaseClient {
    return this.db;
  }

  private async readAll<K extends CollectionName>(
    collection: K,
  ): Promise<EntityMap[K][]> {
    const payloads = await this.fetchPayloads(collection);
    const items: EntityMap[K][] = [];
    for (const payload of payloads) {
      const parsed = entitySchemas[collection].parse(payload);
      items.push(parsed as EntityMap[K]);
    }
    return items;
  }

  async listMissions(): Promise<Mission[]> {
    const missions = await this.readAll("missions");
    return missions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getMission(id: string): Promise<Mission | null> {
    return this.get("missions", id);
  }

  async upsertMission(mission: Mission): Promise<Mission> {
    return this.upsert("missions", mission);
  }

  async listByMission<K extends MissionScopedCollection>(
    collection: K,
    missionId: string,
  ): Promise<EntityMap[K][]> {
    if (collection === "sources") {
      await this.ensureMissionSourceLinks(missionId);
      return (await this.listSourcesForMission(missionId)) as EntityMap[K][];
    }

    try {
      const payloads = await this.fetchPayloads(collection, missionId);
      if (payloads.length === 0) {
        const all = await this.readAll(collection);
        const filtered = all.filter((item) => missionKey(item) === missionId);
        if (filtered.length > 0) {
          return sortByUpdatedDesc(filtered) as EntityMap[K][];
        }
      }
      const items: EntityMap[K][] = [];
      for (const payload of payloads) {
        const parsed = entitySchemas[collection].parse(payload);
        items.push(parsed as EntityMap[K]);
      }
      return sortByUpdatedDesc(items) as EntityMap[K][];
    } catch {
      const all = await this.readAll(collection);
      return sortByUpdatedDesc(
        all.filter((item) => missionKey(item) === missionId),
      ) as EntityMap[K][];
    }
  }

  async countByMission(
    collection: MissionScopedCollection,
    missionId: string,
  ): Promise<number> {
    if (collection === "sources") {
      await this.ensureMissionSourceLinks(missionId);
      const { count, error } = await this.db
        .from("entities")
        .select("id", { count: "exact", head: true })
        .eq("collection", "missionSources")
        .eq("mission_id", missionId);
      if (!error && typeof count === "number") return count;
      const links = await this.readAll("missionSources");
      return links.filter((l) => l.mission_id === missionId).length;
    }
    const { count, error } = await this.db
      .from("entities")
      .select("id", { count: "exact", head: true })
      .eq("collection", collection)
      .eq("mission_id", missionId);
    if (!error && typeof count === "number") return count;
    const all = await this.readAll(collection);
    return all.filter((item) => missionKey(item) === missionId).length;
  }

  async summarizeSourcesForMission(
    missionId: string,
  ): Promise<SourceMissionSummary> {
    const sourceIds = await this.listLinkedSourceIds(missionId);
    if (!sourceIds.length) return emptySourceSummary();

    const rows: SourceLiteRow[] = [];
    for (let i = 0; i < sourceIds.length; i += 80) {
      const chunk = sourceIds.slice(i, i + 80);
      const { data, error } = await this.db
        .from("entities")
        .select(
          "name:payload->>name, category:payload->>category, scope:payload->>scope, status:payload->>status, list_pattern:payload->extractionGuide->>listPattern",
        )
        .eq("collection", "sources")
        .in("id", chunk);
      if (error) {
        const fallback = await this.db
          .from("entities")
          .select("payload")
          .eq("collection", "sources")
          .in("id", chunk);
        if (fallback.error) {
          throw new Error(
            `entities summarize sources: ${error.message}; fallback ${fallback.error.message}`,
          );
        }
        for (const row of fallback.data ?? []) {
          const lite = liteRowFromUnknown(row.payload);
          if (lite) rows.push(lite);
        }
        continue;
      }
      for (const row of data ?? []) {
        const lite = liteRowFromUnknown(row);
        if (lite) rows.push(lite);
      }
    }
    return summarizeSourceLiteRows(rows);
  }

  private async listLinkedSourceIds(missionId: string): Promise<string[]> {
    const { data, error } = await this.db
      .from("entities")
      .select("source_id:payload->>source_id")
      .eq("collection", "missionSources")
      .eq("mission_id", missionId);
    if (error) {
      const { data: raw, error: rawErr } = await this.db
        .from("entities")
        .select("payload")
        .eq("collection", "missionSources")
        .eq("mission_id", missionId);
      if (rawErr) {
        throw new Error(`entities missionSources: ${error.message}`);
      }
      const ids: string[] = [];
      for (const row of raw ?? []) {
        const rec = row.payload as { source_id?: string } | null;
        const id = rec?.source_id?.trim();
        if (id) ids.push(id);
      }
      return ids;
    }
    const ids: string[] = [];
    for (const row of data ?? []) {
      const id = String(
        (row as { source_id?: string }).source_id ?? "",
      ).trim();
      if (id) ids.push(id);
    }
    return ids;
  }

  private async listSourcesForMission(missionId: string): Promise<Source[]> {
    const links = (await this.readAll("missionSources")).filter(
      (l) => l.mission_id === missionId,
    );
    const sources: Source[] = [];
    for (const link of links) {
      const source = await this.get("sources", link.source_id);
      if (source) sources.push(source);
    }
    return sources.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  private async ensureMissionSourceLinks(missionId: string): Promise<void> {
    const existing = await this.readAll("missionSources");
    const linked = new Set(
      existing
        .filter((l) => l.mission_id === missionId)
        .map((l) => l.source_id),
    );

    const allSources = await this.readAll("sources");
    for (const source of allSources) {
      const belongs =
        source.first_seen_mission === missionId ||
        source.reused_in_missions.includes(missionId);
      if (!belongs || linked.has(source.id)) continue;

      const link: MissionSource = {
        id: randomUUID(),
        mission_id: missionId,
        source_id: source.id,
        added_at: source.createdAt,
        producer: "ImportedDataset",
        updatedAt: nowIso(),
        v: 1,
      };
      await this.upsert("missionSources", link);
      linked.add(source.id);
    }
  }

  async get<K extends CollectionName>(
    collection: K,
    id: string,
  ): Promise<EntityMap[K] | null> {
    CollectionNameSchema.parse(collection);
    const { data, error } = await this.db
      .from("entities")
      .select("payload")
      .eq("collection", collection)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`entities get ${collection}/${id}: ${error.message}`);
    if (!data) return null;
    return entitySchemas[collection].parse(data.payload) as EntityMap[K];
  }

  async upsert<K extends CollectionName>(
    collection: K,
    entity: EntityMap[K],
  ): Promise<EntityMap[K]> {
    const stamped = {
      ...entity,
      updatedAt: nowIso(),
      v: "v" in entity ? Number(entity.v) || 1 : 1,
    };
    const parsed = entitySchemas[collection].parse(stamped) as EntityMap[K];
    const mid = missionKey(parsed);
    const updatedAt =
      "updatedAt" in parsed && typeof parsed.updatedAt === "string"
        ? parsed.updatedAt
        : nowIso();
    const row: EntityRow = {
      collection,
      id: parsed.id,
      mission_id: mid,
      payload: parsed,
      updated_at: updatedAt,
      v: Number(("v" in parsed && parsed.v) || 1),
    };
    const { error } = await this.db.from("entities").upsert(row, {
      onConflict: "collection,id",
    });
    if (error) {
      throw new Error(`entities upsert ${collection}/${parsed.id}: ${error.message}`);
    }
    return parsed;
  }

  async remove(collection: CollectionName, id: string): Promise<boolean> {
    const { error, count } = await this.db
      .from("entities")
      .delete({ count: "exact" })
      .eq("collection", collection)
      .eq("id", id);
    if (error) throw new Error(`entities delete: ${error.message}`);
    return (count ?? 0) > 0;
  }

  async createSourceInMission(
    missionId: string,
    sourceInput: Omit<Source, "first_seen_mission" | "reused_in_missions"> &
      Partial<Pick<Source, "first_seen_mission" | "reused_in_missions">>,
  ): Promise<Source> {
    const source: Source = SourceSchema.parse({
      ...sourceInput,
      first_seen_mission: sourceInput.first_seen_mission ?? missionId,
      reused_in_missions: sourceInput.reused_in_missions ?? [],
    });
    const saved = await this.upsert("sources", source);
    await this.ensureLink(missionId, saved.id, saved.producer, saved.createdAt);
    return saved;
  }

  async linkSourceToMission(
    missionId: string,
    sourceId: string,
    producer: Producer = "Human",
  ): Promise<{ source: Source; link: MissionSource }> {
    const source = await this.get("sources", sourceId);
    if (!source) {
      throw new Error(`Source not found: ${sourceId}`);
    }

    const existing = (await this.readAll("missionSources")).find(
      (l) => l.mission_id === missionId && l.source_id === sourceId,
    );
    if (existing) {
      return { source, link: existing };
    }

    const link = await this.ensureLink(
      missionId,
      sourceId,
      producer,
      nowIso(),
    );

    let next = source;
    if (source.first_seen_mission !== missionId) {
      const reused = new Set(source.reused_in_missions);
      reused.add(missionId);
      next = await this.upsert("sources", {
        ...source,
        reused_in_missions: [...reused],
      });
    }

    return { source: next, link };
  }

  async warmStartMissionSources(
    missionId: string,
    location: string,
  ): Promise<Source[]> {
    const CROSS_SECTOR_NATIONAL = new Set([
      "registry",
      "labor_market_presence",
      "internship_market",
      "digital_presence",
      "trade_fair",
    ]);
    const LOCATION_REUSABLE = new Set([
      "local_business_association",
      "networking_group",
      "sponsorship",
      "municipal_initiative",
      "local_media",
      "labor_market_presence",
    ]);

    const loc = location.trim().toLowerCase();
    const all = await this.listAllSources();
    const linked: Source[] = [];

    for (const source of all) {
      if (source.status !== "accepted" && source.status !== "adjusted") {
        continue;
      }

      let reuse = false;
      if (source.scope === "national") {
        reuse = CROSS_SECTOR_NATIONAL.has(source.category);
      } else if (source.scope === "regional" || source.scope === "local") {
        const region = (source.region ?? "").trim().toLowerCase();
        reuse =
          Boolean(loc) &&
          region === loc &&
          LOCATION_REUSABLE.has(source.category);
      }

      if (!reuse) continue;

      const { source: next } = await this.linkSourceToMission(
        missionId,
        source.id,
        "ImportedDataset",
      );
      linked.push(next);
    }

    return linked;
  }

  private async ensureLink(
    missionId: string,
    sourceId: string,
    producer: Producer,
    addedAt: string,
  ): Promise<MissionSource> {
    const existing = (await this.readAll("missionSources")).find(
      (l) => l.mission_id === missionId && l.source_id === sourceId,
    );
    if (existing) return existing;

    const link: MissionSource = {
      id: randomUUID(),
      mission_id: missionId,
      source_id: sourceId,
      added_at: addedAt,
      producer,
      updatedAt: nowIso(),
      v: 1,
    };
    return this.upsert("missionSources", link);
  }

  async listAllSources(): Promise<Source[]> {
    const all = await this.readAll("sources");
    return all.sort((a, b) => a.name.localeCompare(b.name));
  }

  async listLinkableSources(
    excludeMissionId: string,
    q = "",
  ): Promise<Source[]> {
    await this.ensureMissionSourceLinks(excludeMissionId);
    const linkedIds = new Set(
      (await this.readAll("missionSources"))
        .filter((l) => l.mission_id === excludeMissionId)
        .map((l) => l.source_id),
    );
    const needle = q.trim().toLowerCase();
    const all = await this.readAll("sources");
    return all
      .filter((s) => !linkedIds.has(s.id))
      .filter((s) => {
        if (!needle) return true;
        return (
          s.name.toLowerCase().includes(needle) ||
          s.category.toLowerCase().includes(needle) ||
          (s.type?.toLowerCase().includes(needle) ?? false)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async deleteMission(missionId: string): Promise<boolean> {
    const mission = await this.getMission(missionId);
    if (!mission) return false;

    await this.ensureMissionSourceLinks(missionId);

    const investigationIds = new Set(
      (await this.listByMission("investigations", missionId)).map((i) => i.id),
    );

    const links = (await this.readAll("missionSources")).filter(
      (l) => l.mission_id === missionId,
    );
    const linkedSourceIds = links.map((l) => l.source_id);

    const scoped = CollectionNameSchema.options.filter(
      (name) =>
        name !== "missions" &&
        name !== "patterns" &&
        name !== "sources" &&
        name !== "missionSources",
    ) as Exclude<
      CollectionName,
      "missions" | "patterns" | "sources" | "missionSources"
    >[];

    for (const collection of scoped) {
      const items = await this.listByMission(collection, missionId);
      for (const item of items) {
        await this.remove(collection, item.id);
      }
    }

    for (const link of links) {
      await this.remove("missionSources", link.id);
    }

    const remainingLinks = await this.readAll("missionSources");
    for (const sourceId of linkedSourceIds) {
      const still = remainingLinks.filter((l) => l.source_id === sourceId);
      if (still.length === 0) {
        await this.remove("sources", sourceId);
        continue;
      }
      const source = await this.get("sources", sourceId);
      if (!source) continue;

      let first = source.first_seen_mission;
      let reused = source.reused_in_missions.filter((m) => m !== missionId);
      if (first === missionId) {
        const ordered = [...still].sort((a, b) =>
          a.added_at.localeCompare(b.added_at),
        );
        first = ordered[0]!.mission_id;
        reused = ordered.slice(1).map((l) => l.mission_id);
      }
      await this.upsert("sources", {
        ...source,
        first_seen_mission: first,
        reused_in_missions: reused,
      });
    }

    for (const pattern of await this.listPatterns()) {
      const kept = pattern.investigationIds.filter(
        (id) => !investigationIds.has(id),
      );
      if (kept.length === 0) {
        await this.remove("patterns", pattern.id);
      } else if (kept.length !== pattern.investigationIds.length) {
        await this.upsert("patterns", {
          ...pattern,
          investigationIds: kept,
        });
      }
    }

    return this.remove("missions", missionId);
  }

  async listPatterns(): Promise<Pattern[]> {
    return this.readAll("patterns");
  }

  async exportBundle(missionId: string): Promise<ExportBundle> {
    const mission = await this.getMission(missionId);
    if (!mission) {
      throw new Error(`Mission not found: ${missionId}`);
    }

    await this.ensureMissionSourceLinks(missionId);

    const [
      investigations,
      observations,
      evidence,
      hypotheses,
      sources,
      missionSources,
      companies,
      signals,
      confidenceProposals,
      reviews,
      findings,
      journal,
    ] = await Promise.all([
      this.listByMission("investigations", missionId),
      this.listByMission("observations", missionId),
      this.listByMission("evidence", missionId),
      this.listByMission("hypotheses", missionId),
      this.listByMission("sources", missionId),
      this.listByMission("missionSources", missionId),
      this.listByMission("companies", missionId),
      this.listByMission("signals", missionId),
      this.listByMission("confidenceProposals", missionId),
      this.listByMission("reviews", missionId),
      this.listByMission("findings", missionId),
      this.listByMission("journal", missionId),
    ]);

    const investigationIds = new Set(investigations.map((i) => i.id));
    const patterns = (await this.listPatterns()).filter((p) =>
      p.investigationIds.some((id) => investigationIds.has(id)),
    );

    const bundle = {
      exportedAt: nowIso(),
      mission,
      investigations,
      observations,
      evidence,
      hypotheses,
      sources,
      missionSources,
      companies,
      signals,
      confidenceProposals,
      reviews,
      findings,
      patterns,
      journal,
    };

    return ExportBundleSchema.parse(bundle);
  }
}
