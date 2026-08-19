import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import type { Company } from "@h3-trust/schema";
import { api } from "../../api";
import { OmegaJsonImportPanel } from "../../components/worker/OmegaJsonImportPanel";
import type { MissionData } from "../../hooks/useMissionData";
import { buildClassifyJobPrompt } from "../../lib/omegaJobPrompts";
import { useCanInteract } from "../../hooks/useCanInteract";

export function WorkerClassifyPage() {
  const { missionId = "" } = useParams();
  const { mission, reload } = useOutletContext<MissionData>();
  const { canInteract } = useCanInteract();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [directory, setDirectory] = useState<{
    missionId: string;
    companies: Company[];
    unknown: number;
    potentials: number;
  } | null>(null);

  async function loadDirectory() {
    if (!mission) return;
    try {
      const res = await api.listDirectoryCompanies(mission.country);
      setDirectory({
        missionId: res.mission?.id ?? "",
        companies: res.companies,
        unknown: res.unknown,
        potentials: res.potentials,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load directory");
    }
  }

  useEffect(() => {
    void loadDirectory();
  }, [mission?.country]);

  const potentials = useMemo(
    () =>
      (directory?.companies ?? []).filter(
        (c) => c.status === "unknown" && c.classify?.verdict === "home_service",
      ),
    [directory],
  );
  const unknowns = useMemo(
    () => (directory?.companies ?? []).filter((c) => c.status === "unknown"),
    [directory],
  );

  async function promote(company: Company) {
    if (!mission || !canInteract) return;
    const subsector =
      company.classify?.suggestedSubsector?.trim() || mission.subsector;
    setBusyId(company.id);
    setError(null);
    try {
      const res = await api.promoteDirectoryCompany(company.id, {
        country: mission.country,
        subsector,
        reviewer: "Human",
      });
      setMessage(
        `CARA agreed — ${company.name} promoted onto ${res.mission.subsector}.`,
      );
      await loadDirectory();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Promote failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="worker-step-page">
      <div className="worker-step-intro">
        <h2>Classify</h2>
        <p className="hint">
          Mixed-list bijvangst lives in the country local directory as unknown.
          Copy the Ω prompt, paste verdicts, then CARA-agree to promote onto a
          sector pack. Same step OmegaClaw will run later.
        </p>
      </div>

      {error ? <div className="error">{error}</div> : null}
      {message ? (
        <div className="thesis" style={{ borderColor: "var(--teal)" }}>
          {message}
        </div>
      ) : null}

      <p className="muted">
        {directory
          ? `${directory.potentials} potentials · ${directory.unknown} unknown · ${directory.companies.length} directory rows`
          : "Loading directory…"}
      </p>

      {directory && directory.missionId && mission ? (
        <OmegaJsonImportPanel
          missionId={directory.missionId}
          job="classify"
          title="Job 6 · Classify bijvangst"
          hint="Paste classify JSON. Import writes suggestions only — promote below is the CARA act."
          onImported={() => void loadDirectory()}
          buildPrompt={() =>
            buildClassifyJobPrompt({
              mission,
              companies: unknowns.map((c) => ({
                id: c.id,
                name: c.name,
                website_url: c.website_url,
                address: c.address,
                region: c.region,
              })),
            })
          }
        />
      ) : null}

      <section className="panel" style={{ marginTop: "1rem" }}>
        <h3 style={{ marginTop: 0 }}>CARA — promote potentials</h3>
        {potentials.length === 0 ? (
          <p className="muted">No home_service potentials yet.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
            {potentials.map((c) => (
              <li key={c.id} style={{ marginBottom: "0.6rem" }}>
                <strong>{c.name}</strong>{" "}
                <span className="muted">
                  → {c.classify?.suggestedSubsector || "sector?"} ·{" "}
                  {c.classify?.confidence}
                </span>
                <div style={{ marginTop: "0.3rem" }}>
                  <button
                    type="button"
                    className="btn small"
                    disabled={!canInteract || busyId === c.id}
                    onClick={() => void promote(c)}
                  >
                    {busyId === c.id ? "Promoting…" : "Agree · promote"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="hint" style={{ marginTop: "0.75rem" }}>
          <Link to={`/work/${missionId}/align`}>Source Align (CARA)</Link> still
          reviews list weights. This queue is company promotions only.
        </p>
      </section>
    </div>
  );
}
