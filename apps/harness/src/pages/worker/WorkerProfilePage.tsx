import { Link, useOutletContext, useParams } from "react-router-dom";
import { ProducerBadge, StatusChip } from "../../components/Badges";
import type { MissionData } from "../../hooks/useMissionData";

/**
 * Profile step — Can / For / Notable when present.
 * Harvest CTA stub until Phase 7.
 */
export function WorkerProfilePage() {
  const { missionId = "" } = useParams();
  const { companies } = useOutletContext<MissionData>();

  const thin = companies.filter(
    (c) => c.capabilities.length === 0 && !(c.profileSnippet ?? "").trim(),
  ).length;

  return (
    <div className="worker-step-page">
      <div className="worker-step-intro">
        <h2>Profile</h2>
        <p className="hint">
          Can / For / Notable from harvest (or seed). Live Harvest wires in Phase
          7.
        </p>
        <p className="muted">
          {companies.length} companies · {thin} still thin
        </p>
      </div>

      {companies.length === 0 ? (
        <div className="worker-empty-hero">
          <p>No companies yet. Extract from accepted + guided sources first.</p>
          <Link className="btn" to={`/work/${missionId}/extract`}>
            ← Extract
          </Link>
        </div>
      ) : (
        <div className="worker-profile-grid">
          {companies.map((c) => {
            const needsHarvest =
              c.capabilities.length === 0 && !(c.profileSnippet ?? "").trim();
            return (
              <article key={c.id} className="worker-profile-card">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "0.5rem",
                  }}
                >
                  <strong>{c.name}</strong>
                  <StatusChip label={c.status} />
                </div>
                <p className="muted" style={{ margin: "0.35rem 0", fontSize: "0.85rem" }}>
                  {c.region || "—"} · kvk {c.kvk_gate}
                  {c.profileProducer ? (
                    <>
                      {" · "}
                      <ProducerBadge producer={c.profileProducer} />
                    </>
                  ) : null}
                </p>
                {c.profileSnippet ? (
                  <p style={{ margin: "0.4rem 0", fontSize: "0.9rem" }}>
                    {c.profileSnippet}
                  </p>
                ) : (
                  <p className="muted">No profile snippet yet.</p>
                )}
                {c.capabilities.length > 0 ? (
                  <div className="worker-profile-tags">
                    {c.capabilities.map((cap) => (
                      <span key={cap} className="worker-profile-tag">
                        Can: {cap}
                      </span>
                    ))}
                  </div>
                ) : null}
                {c.serviceContexts.length > 0 ? (
                  <div className="worker-profile-tags">
                    {c.serviceContexts.map((sc) => (
                      <span key={sc} className="worker-profile-tag">
                        For: {sc}
                      </span>
                    ))}
                  </div>
                ) : null}
                {c.differentiators.length > 0 ? (
                  <div className="worker-profile-tags">
                    {c.differentiators.map((d) => (
                      <span key={d} className="worker-profile-tag">
                        Notable: {d}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div style={{ marginTop: "0.75rem" }}>
                  <button
                    type="button"
                    className="btn secondary small"
                    disabled
                    title="Wires in Phase 7 — runOcCommand('harvest')"
                  >
                    {needsHarvest ? "Harvest" : "Re-harvest"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="worker-step-footer">
        <Link className="btn secondary" to={`/work/${missionId}/extract`}>
          ← Extract
        </Link>
        <Link className="btn" to={`/work/${missionId}/coverage`}>
          Coverage →
        </Link>
      </div>
    </div>
  );
}
