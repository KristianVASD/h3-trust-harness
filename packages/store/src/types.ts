import type {
  CollectionName,
  Company,
  ConfidenceProposal,
  Evidence,
  ExportBundle,
  Finding,
  Hypothesis,
  Investigation,
  JournalEntry,
  Mission,
  MissionSource,
  Observation,
  Pattern,
  Producer,
  Review,
  Signal,
  Source,
} from "@h3-trust/schema";
import type { SourceMissionSummary } from "./source-summary.js";

export type EntityMap = {
  missions: Mission;
  journal: JournalEntry;
  observations: Observation;
  hypotheses: Hypothesis;
  sources: Source;
  missionSources: MissionSource;
  companies: Company;
  evidence: Evidence;
  signals: Signal;
  confidenceProposals: ConfidenceProposal;
  reviews: Review;
  findings: Finding;
  investigations: Investigation;
  patterns: Pattern;
};

export type MissionScopedCollection = Exclude<
  CollectionName,
  "missions" | "patterns"
>;

export interface Store {
  listMissions(): Promise<Mission[]>;
  getMission(id: string): Promise<Mission | null>;
  upsertMission(mission: Mission): Promise<Mission>;

  listByMission<K extends MissionScopedCollection>(
    collection: K,
    missionId: string,
  ): Promise<EntityMap[K][]>;

  /** Count only — do not load payloads (coverage desk). */
  countByMission(
    collection: MissionScopedCollection,
    missionId: string,
  ): Promise<number>;

  /**
   * Lightweight source counts for country/sector desks.
   * Must not load full source payloads or run catalogue-wide migrate.
   */
  summarizeSourcesForMission(missionId: string): Promise<SourceMissionSummary>;

  get<K extends CollectionName>(
    collection: K,
    id: string,
  ): Promise<EntityMap[K] | null>;

  upsert<K extends CollectionName>(
    collection: K,
    entity: EntityMap[K],
  ): Promise<EntityMap[K]>;

  remove(collection: CollectionName, id: string): Promise<boolean>;

  /** Deletes mission + scoped records; unlinks shared sources (keeps if still used). */
  deleteMission(missionId: string): Promise<boolean>;

  listPatterns(): Promise<Pattern[]>;
  exportBundle(missionId: string): Promise<ExportBundle>;

  createSourceInMission(
    missionId: string,
    source: Omit<Source, "first_seen_mission" | "reused_in_missions"> &
      Partial<Pick<Source, "first_seen_mission" | "reused_in_missions">>,
  ): Promise<Source>;

  linkSourceToMission(
    missionId: string,
    sourceId: string,
    producer?: Producer,
  ): Promise<{ source: Source; link: MissionSource }>;

  /**
   * Link reusable CARA-confirmed catalogue sources into a new mission
   * (national cross-sector + regional/local for the same location).
   */
  warmStartMissionSources(
    missionId: string,
    location: string,
  ): Promise<Source[]>;

  listLinkableSources(
    excludeMissionId: string,
    q?: string,
  ): Promise<Source[]>;

  /** Full catalogue — for mechanical coverage (Check bekende bronnen). */
  listAllSources(): Promise<Source[]>;
}
