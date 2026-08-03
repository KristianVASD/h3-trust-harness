import { useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import type { MissionData } from "../../hooks/useMissionData";
import { GapFillBoard } from "../../components/worker/GapFillBoard";
import { OmegaJsonImportPanel } from "../../components/worker/OmegaJsonImportPanel";
import { buildDiscoverJobPrompt } from "../../lib/omegaJobPrompts";
import { api } from "../../api";

export function WorkerSourcesPage() {
  const { missionId = "" } = useParams();
  const data = useOutletContext<MissionData>();
  const { mission, sources, catalogue, searchPlan, reload } = data;
  const [warmBusy, setWarmBusy] = useState(false);
  const [warmMsg, setWarmMsg] = useState<string | null>(null);

  if (!mission) {
    return <p className="muted">Loading…</p>;
  }

  const caraQueue = sources.filter(
    (s) => s.status === "draft" || s.status === "pending_review",
  ).length;
  const candidates = sources.filter((s) => s.status === "candidate").length;
  const planEntries = searchPlan?.entries ?? [];

  async function warmStart() {
    setWarmBusy(true);
    setWarmMsg(null);
    try {
      const res = await api.warmStartSources(missionId);
      setWarmMsg(
        res.linked
          ? `Linked ${res.linked} reusable list(s) from the catalogue (KvK, local associations, …).`
          : "No reusable CARA-confirmed lists found to link yet.",
      );
      await reload();
    } catch (err) {
      setWarmMsg(err instanceof Error ? err.message : "Warm-start failed");
    } finally {
      setWarmBusy(false);
    }
  }

  return (
    <div className="worker-step-page">
      <div className="worker-step-intro">
        <h2>Gaps</h2>
        <p className="hint">
          Add found lists under each category — multiple per category is fine.
          <strong> Ask Ω</strong> writes provisional candidates (unprobed) onto
          the board; keep what is worth rating, then send drafts to CURAD · Align.
          No final decision here; only selection. Without a live API, paste Job 1
          JSON from Qwen below.
        </p>
        <p className="muted">
          {candidates} candidates · {caraQueue} ready for align
        </p>
        {sources.length === 0 ? (
          <div className="worker-warm-start">
            <p className="muted" style={{ marginBottom: "0.5rem" }}>
              No sources linked yet. Pull reusable seed lists (national registry
              + confirmed lists for this location) so the board is not empty.
            </p>
            <button
              type="button"
              className="btn"
              disabled={warmBusy}
              onClick={() => void warmStart()}
            >
              {warmBusy ? "Linking…" : "Warm-start from catalogue"}
            </button>
            {warmMsg ? (
              <p className="muted" style={{ marginTop: "0.5rem" }}>
                {warmMsg}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <OmegaJsonImportPanel
        missionId={missionId}
        job="discover"
        onImported={reload}
        buildPrompt={() =>
          buildDiscoverJobPrompt({
            mission,
            planEntries,
            sources,
          })
        }
      />

      <GapFillBoard
        missionId={missionId}
        mission={mission}
        sources={sources}
        catalogue={catalogue}
        planEntries={planEntries}
        onChanged={reload}
      />

      <footer className="worker-step-footer">
        <Link className="btn secondary" to={`/work/${missionId}/brief`}>
          ← Brief
        </Link>
        <Link className="btn secondary" to={`/work/${missionId}/probe`}>
          Probe →
        </Link>
        <Link
          className={`btn ${caraQueue > 0 ? "" : "secondary"}`}
          to={`/work/${missionId}/align`}
        >
          {caraQueue > 0
            ? `Continue to Align (${caraQueue}) →`
            : "Continue to Align →"}
        </Link>
      </footer>
    </div>
  );
}
