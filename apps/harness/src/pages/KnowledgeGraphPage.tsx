import { useMemo, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { ProducerBadge } from "../components/Badges";
import type { MissionData } from "../hooks/useMissionData";

type NodeKind =
  | "mission"
  | "hypothesis"
  | "observation"
  | "source"
  | "company"
  | "review";

interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  detail?: string;
  producer?: string;
}

/**
 * Memory — browse investigation records by kind.
 * Honest label: not a graph database.
 */
export function KnowledgeGraphPage() {
  const { missionId = "" } = useParams();
  const {
    mission,
    hypotheses,
    observations,
    sources,
    companies,
    reviews,
    error,
  } = useOutletContext<MissionData>();
  const [selected, setSelected] = useState<GraphNode | null>(null);

  const nodes = useMemo((): GraphNode[] => {
    if (!mission) return [];
    return [
      {
        id: mission.id,
        kind: "mission",
        label: `${mission.location} · ${mission.subsector}`,
        detail: mission.goal,
        producer: mission.producer,
      },
      ...hypotheses.map(
        (h): GraphNode => ({
          id: h.id,
          kind: "hypothesis",
          label: h.statement,
          detail: h.status,
          producer: h.producer,
        }),
      ),
      ...observations.map(
        (o): GraphNode => ({
          id: o.id,
          kind: "observation",
          label: o.statement,
          producer: o.producer,
        }),
      ),
      ...sources.map(
        (s): GraphNode => ({
          id: s.id,
          kind: "source",
          label: s.name,
          detail: `${s.category} · status ${s.status} · suggested ${s.suggestedConfidence ?? "—"}`,
          producer: s.producer,
        }),
      ),
      ...companies.map(
        (c): GraphNode => ({
          id: c.id,
          kind: "company",
          label: c.name,
          detail: `${c.status} · kvk_gate ${c.kvk_gate}`,
          producer: c.producer,
        }),
      ),
      ...reviews.map(
        (r): GraphNode => ({
          id: r.id,
          kind: "review",
          label: `CARA ${r.action} (${r.targetType})`,
          detail: r.reason,
          producer: r.producer,
        }),
      ),
    ];
  }, [mission, hypotheses, observations, sources, companies, reviews]);

  const active = selected ?? nodes[0] ?? null;

  const order: NodeKind[] = [
    "mission",
    "hypothesis",
    "observation",
    "source",
    "company",
    "review",
  ];

  return (
    <div>
      <div className="worker-step-intro">
        <h2>Memory</h2>
        <p className="hint">
          Browse records by kind — Mission → Hypothesis → Observation → Source →
          Company → Review. Not a graph database; a readable chain for this mission
          ({missionId.slice(0, 8)}…).
        </p>
      </div>

      {error ? <div className="error">{error}</div> : null}

      {!mission ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="workspace-layout">
          <section className="panel">
            {order.map((kind) => {
              const group = nodes.filter((n) => n.kind === kind);
              if (!group.length) return null;
              return (
                <div key={kind} style={{ marginBottom: "1rem" }}>
                  <h3
                    style={{
                      textTransform: "capitalize",
                      marginBottom: "0.5rem",
                    }}
                  >
                    {kind}
                  </h3>
                  <div className="list">
                    {group.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        className="item"
                        style={{
                          width: "100%",
                          textAlign: "left",
                          cursor: "pointer",
                          borderColor:
                            active?.id === n.id ? "var(--teal)" : undefined,
                        }}
                        onClick={() => setSelected(n)}
                      >
                        <h4 style={{ margin: 0 }}>{n.label}</h4>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>

          <section className="panel">
            <h2>Record</h2>
            {!active ? (
              <div className="empty">Select a node.</div>
            ) : (
              <>
                <div className="mission-meta" style={{ marginBottom: "0.75rem" }}>
                  {active.producer ? (
                    <ProducerBadge
                      producer={
                        active.producer as
                          | "Human"
                          | "OmegaClaw"
                          | "ExternalAI"
                          | "ImportedDataset"
                      }
                    />
                  ) : null}
                </div>
                <h3 style={{ marginTop: 0 }}>{active.label}</h3>
                <p className="muted" style={{ textTransform: "capitalize" }}>
                  {active.kind}
                </p>
                {active.detail ? <p>{active.detail}</p> : null}
                <p className="mono">{active.id}</p>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
