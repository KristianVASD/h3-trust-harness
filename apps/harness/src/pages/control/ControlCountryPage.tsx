import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ADDRESS_SEARCH_STAGES,
  primaryTradeId,
  resolveSearchQuery,
} from "@h3-trust/schema";
import {
  api,
  type ControlJobRow,
  type PlaceProgressRow,
  type SearchDemandAggregate,
} from "../../api";
import { StatusChip } from "../../components/Badges";
import { EngineRunChip } from "../../components/control/EngineRunChip";
import { PlanReader } from "../../components/control/PlanReader";
import { useAuth } from "../../auth/AuthContext";
import { useCanInteract } from "../../hooks/useCanInteract";
import type { NationLandscape } from "@h3-trust/schema";
import type { ControlDoorRow, WorkerEvent, WorkerRun } from "../../api";

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

const STAGE_LABELS: Record<(typeof ADDRESS_SEARCH_STAGES)[number], string> = {
  geocode: "Place",
  ecology_ov: "OV",
  ecology_sport: "Sport",
  ecology_festivity: "Festivals",
  harvest_match: "Websites",
  trade_search: "Trades",
  local_authenticity: "Local",
  country_corroboration: "Country map",
  score: "Score",
};

function placeTone(place: PlaceProgressRow): "done" | "active" | "waiting" {
  if (place.run?.status === "failed") return "waiting";
  if (place.run?.status === "queued" || place.run?.status === "running") return "active";
  if (place.finishedStages.length >= place.stageTotal && place.fresh) return "done";
  return "waiting";
}

function PlaceCard({ place }: { place: PlaceProgressRow }) {
  const done = new Set(place.finishedStages);
  const where = [place.address, place.postcode4, place.gemeente].filter(Boolean).join(" · ");
  return (
    <article className="control-door-card">
      <h3>{place.label}</h3>
      <p className="muted">
        {where || "No address stored"} · {place.radiusKm} km
        {place.fresh ? "" : " · older than 30 days"}
      </p>
      <div className="row" style={{ gap: "0.4rem", flexWrap: "wrap" }}>
        <StatusChip
          label={`${place.finishedStages.length}/${place.stageTotal} stages`}
          tone={placeTone(place)}
        />
        {place.run ? (
          <StatusChip
            label={`${place.run.status} · ${place.run.progress_pct}%`}
            tone={
              place.run.status === "succeeded"
                ? "done"
                : place.run.status === "failed" || place.run.status === "cancelled"
                  ? "waiting"
                  : "active"
            }
          />
        ) : (
          <StatusChip label="no engine run" />
        )}
        <StatusChip
          label={`${place.candidateCount} candidates · ${place.ecology.ov} OV · ${place.ecology.sport} sport · ${place.ecology.festivity} festivals`}
        />
      </div>
      <div className="place-stage-row" aria-label="Search stages">
        {ADDRESS_SEARCH_STAGES.map((stage) => (
          <span key={stage} className={done.has(stage) ? "place-stage done" : "place-stage"}>
            {STAGE_LABELS[stage]}
          </span>
        ))}
      </div>
      {place.run?.current_action ? (
        <p className="muted" style={{ margin: "0.45rem 0 0" }}>
          {place.run.current_action}
        </p>
      ) : null}
      {place.run?.error ? <p className="error">{place.run.error}</p> : null}
      <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.85rem" }}>
        Updated {formatWhen(place.updatedAt)}
      </p>
      <div className="row" style={{ marginTop: "0.65rem", gap: "0.4rem" }}>
        {place.run ? (
          <Link className="btn small" to={`/admin/engine/${place.run.id}`}>
            Open run
          </Link>
        ) : null}
        <Link className="btn small secondary" to={`/work/${place.missionId}/brief`}>
          Open job
        </Link>
      </div>
    </article>
  );
}

function JobRow({ job }: { job: ControlJobRow }) {
  return (
    <div className="mission-card">
      <h3>
        {job.location} · {job.subsector}
      </h3>
      <p className="muted">{job.goal}</p>
      <div className="mission-meta">
        <StatusChip
          label={`${job.companyCount} companies`}
          tone={job.companyCount > 0 ? "done" : "waiting"}
        />
        <StatusChip
          label={`${job.trustListCount ?? job.trustedCount} trust lists · ${job.identityToolCount ?? 0} identity tools`}
        />
        {job.directory ? (
          <StatusChip label="local directory" tone="active" />
        ) : (
          <StatusChip label="national pack" tone="active" />
        )}
      </div>
      {job.listNames.length ? (
        <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.85rem" }}>
          Linked: {job.listNames.join(" · ")}
        </p>
      ) : null}
      <div className="row" style={{ marginTop: "0.65rem" }}>
        <Link className="btn small" to={`/work/${job.id}/brief`}>
          Open job
        </Link>
      </div>
    </div>
  );
}

export function ControlCountryPage() {
  const { country = "" } = useParams();
  const navigate = useNavigate();
  const { isAdmin, loading: authLoading, session } = useAuth();
  const { canInteract, needsLogin } = useCanInteract();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paste, setPaste] = useState("");
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [street, setStreet] = useState("");
  const [postcode, setPostcode] = useState("");
  const [place, setPlace] = useState("");
  const [searchMsg, setSearchMsg] = useState<string | null>(null);
  const [data, setData] = useState<{
    country: string;
    countrySlug: string;
    landscape: NationLandscape;
    doors: ControlDoorRow[];
    directory: ControlDoorRow | null;
    jobs: ControlJobRow[];
    demands: SearchDemandAggregate[];
    latestRun: WorkerRun | null;
    events: WorkerEvent[];
    places: PlaceProgressRow[];
  } | null>(null);

  async function load() {
    try {
      setError(null);
      setData(await api.getControlCountry(country));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load country");
    }
  }

  useEffect(() => {
    if (authLoading) return;
    if (needsLogin) {
      setError("Sign in to open this country.");
      return;
    }
    void load();
  }, [country, authLoading, needsLogin, session?.access_token]);

  const placeRunsLive = (data?.places ?? []).some(
    (place) => place.run?.status === "queued" || place.run?.status === "running",
  );

  useEffect(() => {
    if (!placeRunsLive) return;
    const timer = window.setInterval(() => {
      void load();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [placeRunsLive, country]);

  async function onMap() {
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      await api.startControlCountry({ country: data.country, map: true });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Map failed");
    } finally {
      setBusy(false);
    }
  }

  async function onNationHarvest() {
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      const { run } = await api.enqueueWorkerRun({
        command: "nation_harvest",
        country: data.country,
        model: "minimax/minimax-m3:free",
      });
      navigate(`/admin/engine/${run.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Harvest failed");
    } finally {
      setBusy(false);
    }
  }

  async function onAlkmaarTest() {
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      const { run } = await api.enqueueWorkerRun({
        command: "place_test",
        country: data.country,
        location: "Alkmaar",
        tradeId: "paint",
        model: "minimax/minimax-m3:free",
      });
      navigate(`/admin/engine/${run.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Place test failed");
    } finally {
      setBusy(false);
    }
  }

  async function onAddressSearch(e: FormEvent) {
    e.preventDefault();
    if (!data || !canInteract || !isAdmin) return;
    const address = street.trim();
    if (!address && !postcode.trim() && !place.trim()) return;
    setBusy(true);
    setError(null);
    setSearchMsg(null);
    try {
      const res = await api.startAddressSearch(data.countrySlug, {
        address,
        postcode: postcode.trim() || undefined,
        place: place.trim() || undefined,
      });
      setSearchMsg(
        res.reused
          ? `Reused ${res.cell.label}. Filling only what is still missing.`
          : `Queued a new cell for ${res.cell.label}.`,
      );
      await load();
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Address search failed";
      let message = raw;
      try {
        const parsed = JSON.parse(raw) as { error?: string };
        if (parsed.error) message = parsed.error;
      } catch {
        /* keep raw */
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function importLandscape(text: string) {
    if (!data || !text.trim()) return;
    setBusy(true);
    setError(null);
    setImportMsg(null);
    try {
      const { landscape } = await api.putControlLandscape(data.countrySlug, {
        text,
      });
      setPaste("");
      await load();
      const filled = landscape.channels.filter(
        (ch) => ch.howToFind.trim() || ch.platforms.length,
      ).length;
      setImportMsg(
        `Saved to Supabase · ${filled}/12 channels · landscape ${landscape.status}`,
      );
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Import failed";
      let message = raw;
      try {
        const parsed = JSON.parse(raw) as { error?: unknown };
        if (typeof parsed.error === "string") message = parsed.error;
      } catch {
        /* keep raw */
      }
      setError(message);
      setImportMsg(message);
    } finally {
      setBusy(false);
    }
  }

  async function onImportPlan() {
    await importLandscape(paste);
  }

  async function onUploadJson(file: File) {
    const text = await file.text();
    setPaste(text);
    await importLandscape(text);
  }

  if (!data && !error) {
    return <p className="muted">Loading country…</p>;
  }

  return (
    <div>
      <p className="control-crumb">
        <Link to="/control">← Countries</Link>
      </p>
      <header className="control-hero">
        <p className="control-eyebrow">Nation mapping</p>
        <h1>{data?.country ?? country}</h1>
        <p className="muted">
          Trust landscape first — 12 discovery channels for how local proof is
          found. An address search reads that map at the end. It does not
          extract the country.
        </p>
      </header>
      {isAdmin ? (
        <section className="panel">
          <h2>Address search</h2>
          <p className="hint">
            One Dutch address is enough. The list under this form is the map of
            towns: each card is a 15 km circle and shows which of the 9 stages
            are done. A running search refreshes itself.
          </p>
          <form onSubmit={onAddressSearch} className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
            <input
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              placeholder="Street and number"
              aria-label="Street and number"
              disabled={!canInteract || busy}
            />
            <input
              value={postcode}
              onChange={(e) => setPostcode(e.target.value)}
              placeholder="Postcode"
              aria-label="Postcode"
              disabled={!canInteract || busy}
              style={{ maxWidth: "8rem" }}
            />
            <input
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              placeholder="Place"
              aria-label="Place"
              disabled={!canInteract || busy}
              style={{ maxWidth: "12rem" }}
            />
            <button type="submit" className="btn small" disabled={!canInteract || busy}>
              {busy ? "Queuing…" : "Search this address"}
            </button>
          </form>
          {searchMsg ? <p className="hint">{searchMsg}</p> : null}
        </section>
      ) : null}

      <section className="panel" style={{ marginTop: "1.25rem" }}>
        <h2>Searched places</h2>
        <p className="hint">
          Towns this country has already grown from an address. A filled stage
          stays filled. A fresh circle is reused for 30 days when the next
          address falls inside it.
        </p>
        {(data?.places ?? []).length === 0 ? (
          <div className="empty">
            No places yet. Search a Dutch address above — Haarlem and Alkmaar
            show up here as separate circles.
          </div>
        ) : (
          <div className="control-door-grid">
            {(data?.places ?? []).map((place) => (
              <PlaceCard key={place.id} place={place} />
            ))}
          </div>
        )}
      </section>
      {error ? <div className="error">{error}</div> : null}

      <section className="panel">
        <h2>Trust landscape</h2>
        <p className="hint">
          Traineeships, local business clubs, sport-club platforms, yearly
          festivities. This playbook guides local overlay searches. CARA still
          locks list weight.
        </p>
        {data ? (
          <>
            <EngineRunChip run={data.latestRun} events={data.events} />
            <div className="row" style={{ marginBottom: "0.75rem", gap: "0.5rem" }}>
              {isAdmin ? (
                <>
                  <button
                    type="button"
                    className="btn small"
                    disabled={busy}
                    onClick={() => void onMap()}
                  >
                    {busy ? "Queuing…" : "Map trust landscape"}
                  </button>
                  <button
                    type="button"
                    className="btn small"
                    disabled={busy}
                    onClick={() => void onNationHarvest()}
                  >
                    {busy ? "Queuing…" : "Netherlands · 12 doors"}
                  </button>
                  <button
                    type="button"
                    className="btn small secondary"
                    disabled={busy}
                    onClick={() => void onAlkmaarTest()}
                  >
                    {busy ? "Queuing…" : "Alkmaar place test"}
                  </button>
                </>
              ) : null}
              <StatusChip
                label={`landscape ${data.landscape.status}`}
                tone={
                  data.landscape.status === "ready"
                    ? "done"
                    : data.landscape.status === "mapping"
                      ? "active"
                      : "waiting"
                }
              />
            </div>
            <PlanReader
              key={data.landscape.updatedAt}
              landscape={data.landscape}
            />
            {canInteract ? (
              <details className="worker-advanced" style={{ marginTop: "1rem" }}>
                <summary>Paste or upload landscape JSON</summary>
                <textarea
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  style={{ minHeight: "8rem" }}
                  placeholder='{"overview":"…","channels":[…]}'
                />
                <p className="hint">
                  Paste Qwen / Cursor JSON or a fenced block. The server maps it
                  onto the 12 discovery channels and stores it in Supabase
                  (`nation_landscapes`). Plain prose becomes the overview.
                </p>
                <div className="plan-import-actions">
                  <button
                    type="button"
                    className="btn small"
                    disabled={busy || !paste.trim()}
                    onClick={() => void onImportPlan()}
                  >
                    {busy ? "Saving…" : "Import playbook"}
                  </button>
                  <label className="btn small secondary plan-file-btn">
                    Upload JSON
                    <input
                      type="file"
                      accept="application/json,.json,.txt"
                      disabled={busy}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void onUploadJson(file);
                      }}
                    />
                  </label>
                </div>
                {importMsg ? <p className="muted">{importMsg}</p> : null}
              </details>
            ) : null}
          </>
        ) : null}
      </section>

      <section className="panel" style={{ marginTop: "1.25rem" }}>
        <h2>Explored sectors</h2>
        <p className="hint">
          Always the 12 HHH trade doors. Candidate lists from the worker count
          here — CARA later locks which ones rank. Click a door to see them.
        </p>
        <div className="control-door-grid">
          {(data?.doors ?? []).map((door) => (
            <Link
              key={door.key}
              className="control-door-card"
              to={`/control/${data?.countrySlug}/${door.tradeId ?? door.subsector}`}
            >
              <h3>{door.tradeLabel ?? door.subsector}</h3>
              <p className="muted">
                {door.tradeId} · {door.companyCount} companies ·{" "}
                {door.trustListCount ?? 0} trust lists ·{" "}
                {door.identityToolCount ?? 0} identity tools
                {" · "}
                {door.nationalSourceCount} national / {door.localSourceCount} local
              </p>
              <StatusChip
                label={packStatusLabel(door.status)}
                tone={
                  door.status === "searchable"
                    ? "done"
                    : door.status === "needs_overlay" || door.status === "lists_found"
                      ? "active"
                      : "waiting"
                }
              />
            </Link>
          ))}
          {data?.directory ? (
            <Link
              className="control-door-card"
              to={`/control/${data.countrySlug}/unclassified`}
            >
              <h3>Unclassified</h3>
              <p className="muted">
                Mixed-list bijvangst · {data.directory.companyCount} companies
              </p>
              <StatusChip label="searchable" tone="done" />
            </Link>
          ) : null}
        </div>
      </section>

      <div className="grid-missions" style={{ marginTop: "1.25rem" }}>
        <section className="panel">
          <h2>Recent packs</h2>
          <p className="hint">National packs and Local Directory only — max 5.</p>
          {(data?.jobs ?? []).length === 0 ? (
            <div className="empty">No national packs yet. Explore a sector.</div>
          ) : (
            data?.jobs.map((job) => <JobRow key={job.id} job={job} />)
          )}
        </section>
        <section className="panel">
          <h2>Unmet demand</h2>
          <p className="hint">Local overlay queue for this country — max 5.</p>
          {(data?.demands ?? []).length === 0 ? (
            <div className="empty">No demand rows for this country.</div>
          ) : (
            data?.demands.map((d) => (
              <article key={d.key} className="demand-card">
                <div className="demand-card-main">
                  <h3>
                    {d.location} · {d.what}
                  </h3>
                  <p className="muted">
                    {d.count}× asked · last {formatWhen(d.lastAt)}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => {
                    const trade =
                      resolveSearchQuery(d.what).tradeId ??
                      primaryTradeId(d.what) ??
                      "paint";
                    navigate(`/control/${data?.countrySlug}/${trade}#attach`, {
                      state: { location: d.location, what: d.what },
                    });
                  }}
                >
                  Prefill attach list
                </button>
              </article>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
