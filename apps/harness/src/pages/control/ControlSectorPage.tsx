import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  displayCountry,
  primaryTradeId,
  resolveSearchQuery,
  tradeLabel,
  type SourceCategory,
} from "@h3-trust/schema";
import {
  api,
  type ControlDoorRow,
  type ControlJobRow,
  type ListStyleGroup,
  type ListStyleSource,
  type SearchDemandAggregate,
  type WorkerEvent,
  type WorkerRun,
} from "../../api";
import { StatusChip } from "../../components/Badges";
import { AttachListForm, type AttachPrefill } from "../../components/control/AttachListForm";
import { DoorPlaybookForm } from "../../components/control/DoorPlaybookForm";
import { EngineRunChip } from "../../components/control/EngineRunChip";
import { useAuth } from "../../auth/AuthContext";
import { useCanInteract } from "../../hooks/useCanInteract";

function packStatusLabel(status: ControlDoorRow["status"]): string {
  if (status === "searchable") return "searchable";
  if (status === "needs_overlay") return "needs local list";
  if (status === "lists_found") return "lists found";
  return "empty";
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function sourceTone(status: string): "done" | "active" | "waiting" {
  if (status === "accepted" || status === "adjusted") return "done";
  if (status === "pending_review" || status === "draft") return "active";
  return "waiting";
}

export function ControlSectorPage() {
  const { country = "", tradeId = "" } = useParams();
  const loc = useLocation();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { canInteract } = useCanInteract();
  const state = loc.state as { location?: string; what?: string } | null;
  const resolvedTrade =
    tradeId === "unclassified"
      ? "unclassified"
      : resolveSearchQuery(tradeId).tradeId ??
        primaryTradeId(tradeId) ??
        tradeId;

  const [error, setError] = useState<string | null>(null);
  const [startingEngineId, setStartingEngineId] = useState<string | null>(null);
  const [peelingId, setPeelingId] = useState<string | null>(null);
  const [data, setData] = useState<{
    country: string;
    countrySlug: string;
    tradeId: string;
    door: ControlDoorRow;
    groups: ListStyleGroup[];
    directorySources: ListStyleSource[];
    jobs: ControlJobRow[];
    demands: SearchDemandAggregate[];
    latestRun: WorkerRun | null;
    events: WorkerEvent[];
  } | null>(null);

  async function load() {
    try {
      setError(null);
      setData(await api.getControlDoor(country, resolvedTrade));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sector");
    }
  }

  useEffect(() => {
    void load();
  }, [country, resolvedTrade]);

  useEffect(() => {
    if (loc.hash === "#attach") {
      document.getElementById("attach")?.scrollIntoView({ behavior: "smooth" });
    }
  }, [loc.hash, data]);

  const prefill = useMemo<AttachPrefill | undefined>(() => {
    if (!state?.location && !data) return undefined;
    const fromDemand = Boolean(state?.location);
    return {
      country: data?.country,
      ...(fromDemand
        ? {
            location: state?.location,
            sourceLayer: "local" as const,
            sourceCategory: "local_business_association" as SourceCategory,
            mixed: true,
            suggestedWeight: "65",
            sourceName: `${state?.location} local list`,
            listLabel: `${state?.location} overlay`,
          }
        : {
            sourceLayer: "national" as const,
            sourceCategory: "quality_mark" as SourceCategory,
            mixed: false,
            suggestedWeight: "75",
          }),
      subsector: resolvedTrade === "unclassified" ? "paint" : resolvedTrade,
    };
  }, [state, data, resolvedTrade]);

  async function onExportHhh() {
    if (!data) return;
    try {
      const result = await api.exportHhhLeads(data.country, resolvedTrade);
      const blob = new Blob([JSON.stringify(result, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hhh-leads-${data.country}-${resolvedTrade}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    }
  }

  async function onStartEngine(missionId: string) {
    if (!isAdmin) return;
    setStartingEngineId(missionId);
    try {
      const { run } = await api.enqueueWorkerRun({
        missionId,
        command: "full_mission",
      });
      navigate(`/admin/engine/${run.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start engine");
    } finally {
      setStartingEngineId(null);
    }
  }

  async function onPeel(missionId: string, label: string) {
    if (
      !window.confirm(
        `Peel mixed-list-only members off “${label}”? OV / sportclub firms with no sector list move to Local Directory.`,
      )
    ) {
      return;
    }
    setPeelingId(missionId);
    try {
      await api.peelMixedOnly(missionId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Peel failed");
    } finally {
      setPeelingId(null);
    }
  }

  async function onDelete(missionId: string, label: string) {
    if (!window.confirm(`Delete mission “${label}”? This cannot be undone.`)) {
      return;
    }
    try {
      await api.deleteMission(missionId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  const title =
    resolvedTrade === "unclassified"
      ? "Unclassified"
      : data?.door.tradeLabel ?? tradeLabel(resolvedTrade);

  return (
    <div>
      <p className="control-crumb">
        <Link to="/control">Countries</Link>
        {" · "}
        <Link to={`/control/${country}`}>
          {data?.country ?? displayCountry(country)}
        </Link>
      </p>
      <header className="control-hero">
        <p className="control-eyebrow">List styles</p>
        <h1>
          {data?.country ?? displayCountry(country)} · {title}
        </h1>
        <p className="muted">
          {data
            ? `${data.door.companyCount} companies · ${data.door.sourceCount ?? data.door.nationalSourceCount} lists (${data.door.nationalSourceCount} national / ${data.door.localSourceCount} local)`
            : "Loading…"}
        </p>
        {data ? (
          <StatusChip
            label={packStatusLabel(data.door.status)}
            tone={
              data.door.status === "searchable"
                ? "done"
                :                 data.door.status === "needs_overlay" ||
                data.door.status === "lists_found"
                  ? "active"
                  : "waiting"
            }
          />
        ) : null}
      </header>
      {error ? <div className="error">{error}</div> : null}

      {resolvedTrade !== "unclassified" ? (
        <DoorPlaybookForm
          country={data?.country ?? country}
          tradeId={resolvedTrade}
          tradeLabel={title}
          onDone={() => void load()}
        />
      ) : null}

      <section className="panel">
        <h2>How lists look on this door</h2>
        <p className="hint">
          Grouped by the 12 discovery channels. Mixed OV / sportclub rows stay
          mixed; unknowns sit on Unclassified.
        </p>
        <EngineRunChip run={data?.latestRun ?? null} events={data?.events ?? []} />
        {(data?.groups ?? []).map((group) => (
          <div key={`${group.layer}|${group.category}`} className="list-style-group">
            <h3>
              {group.title}
              <span className="muted">
                {" "}
                · {group.layer} / {group.category}
              </span>
            </h3>
            {group.sources.length === 0 ? (
              <p className="empty">No list of this style yet.</p>
            ) : (
              group.sources.map((s) => (
                <div key={s.id} className="card-row">
                  <div>
                    <strong>{s.name}</strong>
                    <div className="muted">
                      {s.listUrl || s.url || "no listUrl"}
                      {s.suggestedWeight != null ? ` · weight ${s.suggestedWeight}` : ""}
                    </div>
                  </div>
                  <StatusChip label={s.status} tone={sourceTone(s.status)} />
                </div>
              ))
            )}
          </div>
        ))}
        {(data?.directorySources ?? []).length ? (
          <div className="list-style-group">
            <h3>Local Directory leftovers</h3>
            {data!.directorySources.map((s) => (
              <div key={s.id} className="card-row">
                <div>
                  <strong>{s.name}</strong>
                  <div className="muted">{s.category}</div>
                </div>
                <StatusChip label={s.status} tone={sourceTone(s.status)} />
              </div>
            ))}
          </div>
        ) : null}
        <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn secondary small"
            onClick={() => void onExportHhh()}
          >
            Download HHH high-trust leads
          </button>
        </div>
      </section>

      {resolvedTrade !== "unclassified" ? (
        <div style={{ marginTop: "1.25rem" }}>
          <AttachListForm
            country={data?.country ?? country}
            tradeId={resolvedTrade}
            prefill={prefill}
            onDone={() => void load()}
          />
        </div>
      ) : null}

      <section className="panel" style={{ marginTop: "1.25rem" }}>
        <h2>Packs</h2>
        <p className="hint">National pack for this door — max 5.</p>
        {(data?.jobs ?? []).length === 0 ? (
          <div className="empty">
            No pack yet.{" "}
            <a href="#seed">Seed the 12 channels</a>, attach a list, or create an
            empty job.
          </div>
        ) : (
          data?.jobs.map((job) => (
            <div key={job.id} className="mission-card">
              <h3>
                {job.location} · {job.subsector}
              </h3>
              <p className="muted">{job.goal}</p>
              <div className="mission-meta">
                <StatusChip
                  label={`${job.companyCount} companies`}
                  tone={job.companyCount > 0 ? "done" : "waiting"}
                />
                <StatusChip label={`${job.trustedCount} lists`} />
              </div>
              {job.listNames.length ? (
                <p className="muted" style={{ fontSize: "0.85rem" }}>
                  Linked: {job.listNames.join(" · ")}
                </p>
              ) : null}
              <div className="row" style={{ marginTop: "0.65rem", flexWrap: "wrap" }}>
                <Link className="btn small" to={`/work/${job.id}/brief`}>
                  Open job
                </Link>
                {isAdmin ? (
                  <>
                    <button
                      type="button"
                      className="btn small"
                      disabled={startingEngineId === job.id}
                      onClick={() => void onStartEngine(job.id)}
                    >
                      {startingEngineId === job.id ? "Queuing…" : "Start engine run"}
                    </button>
                    <Link
                      className="btn secondary small"
                      to={`/admin/engine?missionId=${job.id}`}
                    >
                      Engine
                    </Link>
                  </>
                ) : null}
                <Link className="btn secondary small" to={`/missions/${job.id}`}>
                  Investigation
                </Link>
                {job.directory ? null : (
                  <button
                    type="button"
                    className="btn secondary small"
                    disabled={!canInteract || peelingId === job.id}
                    onClick={() =>
                      void onPeel(job.id, `${job.location} · ${job.subsector}`)
                    }
                  >
                    {peelingId === job.id ? "Peeling…" : "Peel mixed-only"}
                  </button>
                )}
                <button
                  type="button"
                  className="btn danger small"
                  onClick={() =>
                    void onDelete(job.id, `${job.location} · ${job.subsector}`)
                  }
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </section>

      <section className="panel" style={{ marginTop: "1.25rem" }}>
        <h2>Demand for this door</h2>
        {(data?.demands ?? []).length === 0 ? (
          <div className="empty">No overlay demand for this sector.</div>
        ) : (
          data?.demands.map((d) => (
            <article key={d.key} className="demand-card">
              <div>
                <h3>
                  {d.location} · {d.what}
                </h3>
                <p className="muted">
                  {d.count}× asked · last {formatWhen(d.lastAt)}
                </p>
              </div>
              <a className="btn small" href="#attach">
                Prefill attach
              </a>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
