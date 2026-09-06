import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  CollectionNameSchema,
  CompanySchema,
  ConfidenceProposalSchema,
  EvidenceSchema,
  ExportBundleSchema,
  FindingSchema,
  HypothesisSchema,
  InvestigationSchema,
  JournalEntrySchema,
  MissionSchema,
  MissionSourceSchema,
  ObservationSchema,
  PatternSchema,
  ReviewSchema,
  SignalSchema,
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
  emptySourceSummary,
  summarizeSourceLiteRows,
  type SourceMissionSummary,
} from "./source-summary.js";
import type { EntityMap, MissionScopedCollection, Store } from "./types.js";

const schemas = {
  missions: MissionSchema,
  journal: JournalEntrySchema,
  observations: ObservationSchema,
  hypotheses: HypothesisSchema,
  sources: SourceSchema,
  missionSources: MissionSourceSchema,
  companies: CompanySchema,
  evidence: EvidenceSchema,
  signals: SignalSchema,
  confidenceProposals: ConfidenceProposalSchema,
  reviews: ReviewSchema,
  findings: FindingSchema,
  investigations: InvestigationSchema,
  patterns: PatternSchema,
} as const;

function nowIso(): string {
  return new Date().toISOString();
}

function missionKey(item: unknown): string | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  if (typeof o.missionId === "string") return o.missionId;
  if (typeof o.mission_id === "string") return o.mission_id;
  return null;
}

export class FileStore implements Store {
  constructor(private readonly rootDir: string) {}

  private dir(collection: CollectionName): string {
    return path.join(this.rootDir, collection);
  }

  private file(collection: CollectionName, id: string): string {
    return path.join(this.dir(collection), `${id}.json`);
  }

  private async ensureDir(collection: CollectionName): Promise<void> {
    await mkdir(this.dir(collection), { recursive: true });
  }

  private async readAll<K extends CollectionName>(
    collection: K,
  ): Promise<EntityMap[K][]> {
    await this.ensureDir(collection);
    const files = await readdir(this.dir(collection));
    const items: EntityMap[K][] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const raw = await readFile(path.join(this.dir(collection), file), "utf8");
      const parsed = schemas[collection].parse(JSON.parse(raw));
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

    const all = await this.readAll(collection);
    return all
      .filter((item) => missionKey(item) === missionId)
      .sort((a, b) => {
        const au =
          "updatedAt" in a && typeof a.updatedAt === "string"
            ? a.updatedAt
            : "added_at" in a && typeof a.added_at === "string"
              ? a.added_at
              : "";
        const bu =
          "updatedAt" in b && typeof b.updatedAt === "string"
            ? b.updatedAt
            : "added_at" in b && typeof b.added_at === "string"
              ? b.added_at
              : "";
        return bu.localeCompare(au);
      }) as EntityMap[K][];
  }

  async countByMission(
    collection: MissionScopedCollection,
    missionId: string,
  ): Promise<number> {
    if (collection === "sources") {
      await this.ensureMissionSourceLinks(missionId);
      const links = await this.readAll("missionSources");
      return links.filter((l) => l.mission_id === missionId).length;
    }
    const all = await this.readAll(collection);
    return all.filter((item) => missionKey(item) === missionId).length;
  }

  async summarizeSourcesForMission(
    missionId: string,
  ): Promise<SourceMissionSummary> {
    const links = (await this.readAll("missionSources")).filter(
      (l) => l.mission_id === missionId,
    );
    if (!links.length) return emptySourceSummary();
    const rows = [];
    for (const link of links) {
      const source = await this.get("sources", link.source_id);
      if (!source) continue;
      rows.push({
        name: source.name,
        category: source.category,
        scope: source.scope,
        status: source.status,
        listPattern: source.extractionGuide?.listPattern,
      });
    }
    return summarizeSourceLiteRows(rows);
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

  /** Lazy migrate: old owner-missionId sources get a MissionSource row. */
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

    // Also catch raw files that still only have legacy missionId on disk
    // (preprocess already mapped first_seen_mission on read above).
  }

  async get<K extends CollectionName>(
    collection: K,
    id: string,
  ): Promise<EntityMap[K] | null> {
    CollectionNameSchema.parse(collection);
    try {
      const raw = await readFile(this.file(collection, id), "utf8");
      return schemas[collection].parse(JSON.parse(raw)) as EntityMap[K];
    } catch {
      return null;
    }
  }

  async upsert<K extends CollectionName>(
    collection: K,
    entity: EntityMap[K],
  ): Promise<EntityMap[K]> {
    await this.ensureDir(collection);
    const stamped = {
      ...entity,
      updatedAt: nowIso(),
      v: "v" in entity ? Number(entity.v) || 1 : 1,
    };
    const parsed = schemas[collection].parse(stamped) as EntityMap[K];
    await writeFile(
      this.file(collection, parsed.id),
      `${JSON.stringify(parsed, null, 2)}\n`,
      "utf8",
    );
    return parsed;
  }

  async remove(collection: CollectionName, id: string): Promise<boolean> {
    try {
      await unlink(this.file(collection, id));
      return true;
    } catch {
      return false;
    }
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

  /**
   * Scenario B/C warm-start: reuse CARA-confirmed lists that apply across
   * sectors (national registry etc.) or across the same location (local
   * associations). Sector-specific lists (branch_association, quality_mark,
   * sector_qualification) stay out — those remain gaps for the new sector.
   */
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

    // Migrate legacy owner-links before unlinking/deleting.
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

    try {
      await unlink(path.join(this.rootDir, "export", `${missionId}.json`));
    } catch {
      /* no export file */
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

export type { Store, EntityMap } from "./types.js";
