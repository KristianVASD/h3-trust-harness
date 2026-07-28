import { useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { api } from "../../api";
import { ProducerBadge, StatusChip } from "../../components/Badges";
import type { MissionData } from "../../hooks/useMissionData";

type Confidence = "high" | "medium" | "low";

/**
 * Profile step — Can / For / Notable.
 * Phase 7: live Harvest via runOcCommand("harvest") stub.
 */
export function WorkerProfilePage() {
  const { missionId = "" } = useParams();
  const { companies, reload } = useOutletContext<MissionData>();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const [confidenceById, setConfidenceById] = useState<
    Record<string, Confidence>
  >({});
  const [noteById, setNoteById] = useState<Record<string, string>>({});

  const thin = companies.filter(
    (c) => c.capabilities.length === 0 && !(c.profileSnippet ?? "").trim(),
  ).length;

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllThin() {
    const ids = companies
      .filter(
        (c) => c.capabilities.length === 0 && !(c.profileSnippet ?? "").trim(),
      )
      .map((c) => c.id);
    setSelected(new Set(ids));
  }

  async function harvestOne(companyId: string): Promise<boolean> {
    const result = await api.harvestCompany(missionId, companyId);
    if (!result.ok) {
      setNoteById((prev) => ({
        ...prev,
        [companyId]: `Ω couldn't harvest — ${result.error}`,
      }));
      return false;
    }
    if (result.harvest_confidence) {
      setConfidenceById((prev) => ({
        ...prev,
        [companyId]: result.harvest_confidence!,
      }));
    }
    if (result.harvest_confidence === "low") {
      setNoteById((prev) => ({
        ...prev,
        [companyId]:
          "Ω couldn't read the site — profile is name+address only.",
      }));
    } else {
      setNoteById((prev) => {
        const next = { ...prev };
        delete next[companyId];
        return next;
      });
    }
    return true;
  }

  async function onHarvest(companyId: string) {
    setBusyId(companyId);
    setError(null);
    setDoneMsg(null);
    try {
      const ok = await harvestOne(companyId);
      await reload();
      setDoneMsg(ok ? "Harvested." : "Harvest soft-failed (observation written).");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Harvest failed");
    } finally {
      setBusyId(null);
    }
  }

  async function onHarvestSelected() {
    const ids = [...selected];
    if (!ids.length) return;
    setBatchBusy(true);
    setError(null);
    setDoneMsg(null);
    let okCount = 0;
    try {
      for (const id of ids) {
        setBusyId(id);
        if (await harvestOne(id)) okCount += 1;
      }
      await reload();
      setDoneMsg(
        `Harvested ${okCount} of ${ids.length} selected.`,
      );
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Batch harvest failed");
    } finally {
      setBusyId(null);
      setBatchBusy(false);
    }
  }

  return (
    <div className="worker-step-page">
      <div className="worker-step-intro">
        <h2>Profile</h2>
        <p className="hint">
          Harvest Can / For / Notable from company websites (stub Ω today).
          Missing websites yield a low-confidence name-only profile — never a
          barrier.
        </p>
        <p className="muted">
          {companies.length} companies · {thin} still thin
        </p>
      </div>

      {error ? <div className="error">{error}</div> : null}
      {doneMsg ? (
        <div className="thesis" style={{ borderColor: "var(--teal)" }}>
          {doneMsg}
        </div>
      ) : null}

      {companies.length === 0 ? (
        <div className="worker-empty-hero">
          <p>No companies yet. Extract from accepted + guided sources first.</p>
          <Link className="btn" to={`/work/${missionId}/extract`}>
            ← Extract
          </Link>
        </div>
      ) : (
        <>
          <div className="worker-profile-toolbar">
            <button
              type="button"
              className="btn secondary small"
              onClick={selectAllThin}
              disabled={thin === 0 || batchBusy}
            >
              Select thin
            </button>
            <button
              type="button"
              className="btn small"
              onClick={() => void onHarvestSelected()}
              disabled={selected.size === 0 || batchBusy}
            >
              {batchBusy
                ? "Harvesting…"
                : `Harvest selected (${selected.size})`}
            </button>
          </div>

          <div className="worker-profile-grid">
            {companies.map((c) => {
              const needsHarvest =
                c.capabilities.length === 0 &&
                !(c.profileSnippet ?? "").trim();
              const confidence = confidenceById[c.id];
              const note = noteById[c.id];
              const busy = busyId === c.id || batchBusy;
              return (
                <article key={c.id} className="worker-profile-card">
                  <div className="worker-profile-card-top">
                    <label className="worker-profile-select">
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggleSelect(c.id)}
                        disabled={batchBusy}
                      />
                      <strong>{c.name}</strong>
                    </label>
                    <div className="worker-profile-card-meta">
                      {confidence ? (
                        <span
                          className={`worker-harvest-dot worker-harvest-dot--${confidence}`}
                          title={`harvest_confidence: ${confidence}`}
                          aria-label={`Confidence ${confidence}`}
                        />
                      ) : null}
                      <StatusChip label={c.status} />
                    </div>
                  </div>
                  <p
                    className="muted"
                    style={{ margin: "0.35rem 0", fontSize: "0.85rem" }}
                  >
                    {c.region || "—"} · kvk {c.kvk_gate}
                    {c.website_url || c.profileSourceUrl
                      ? ` · ${c.website_url ?? c.profileSourceUrl}`
                      : " · no website"}
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
                  {note ? (
                    <p className="worker-harvest-note muted">{note}</p>
                  ) : null}
                  <div style={{ marginTop: "0.75rem" }}>
                    <button
                      type="button"
                      className="btn secondary small"
                      disabled={busy}
                      onClick={() => void onHarvest(c.id)}
                    >
                      {busyId === c.id
                        ? "Harvesting…"
                        : needsHarvest
                          ? "Harvest"
                          : "Re-harvest"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </>
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
