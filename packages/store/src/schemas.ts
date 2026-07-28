import {
  CollectionNameSchema,
  CompanySchema,
  ConfidenceProposalSchema,
  EvidenceSchema,
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
} from "@h3-trust/schema";

export const entitySchemas = {
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

export function nowIso(): string {
  return new Date().toISOString();
}

export function missionKey(item: unknown): string | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  if (typeof o.missionId === "string") return o.missionId;
  if (typeof o.mission_id === "string") return o.mission_id;
  return null;
}

export function sortByUpdatedDesc<T extends object>(items: T[]): T[] {
  return [...items].sort((a, b) => {
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
  });
}

export { CollectionNameSchema };
export type { CollectionName };
