/**
 * Sprint 6 — OmegaClaw Ready contracts (no live agent).
 * Same payloads humans write; Producer = OmegaClaw.
 */

export type AgentProducer = "OmegaClaw";

export interface AgentJobStub {
  id: string;
  missionId: string;
  kind:
    | "discover_sources"
    | "propose_hypotheses"
    | "collect_evidence"
    | "discover"
    | "probe"
    | "extract"
    | "harvest"
    | "refresh";
  status: "queued" | "running" | "done" | "failed";
  producer: AgentProducer;
  createdAt: string;
  resultRef?: string;
}

export interface OmegaObservationPayload {
  producer: AgentProducer;
  missionId: string;
  statement: string;
  evidenceUrls?: string[];
  tags?: string[];
}

export interface OmegaSourcePayload {
  producer: AgentProducer;
  missionId: string;
  name: string;
  type: string;
  url?: string;
  reason?: string;
  suggestedWeight?: number;
}

/** Endpoints reserved for future agent ingress (documented, not yet live-wired). */
export const AGENT_API = {
  postObservation: "POST /api/missions/:missionId/observations",
  postHypothesis: "POST /api/missions/:missionId/hypotheses",
  postSource: "POST /api/missions/:missionId/sources",
  postCompany: "POST /api/missions/:missionId/companies",
  postEvidence: "POST /api/missions/:missionId/evidence",
  export: "GET /api/missions/:missionId/export",
  /** CARA endpoints are human-only — agents must not call review/finding create as validator. */
  forbiddenFinalValidation: ["POST .../reviews with authority", "final Finding status"],
} as const;
