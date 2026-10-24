import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { TRADE_IDS, tradeLabel } from "@h3-trust/schema";
import { api, type HhhDeskJob, type LocalSourceSummary } from "../../api";
import { StatusChip } from "../../components/Badges";
import { useAuth } from "../../auth/AuthContext";
import { useCanInteract } from "../../hooks/useCanInteract";

const LIST_EXAMPLE = `kind,name,town,postcode,website
ov,Ondernemersvereniging Bollenstreek,Lisse,2161,https://www.ov-bollenstreek.nl
sport,FC Lisse,Lisse,2161,https://www.fclisse.nl`;

const STAGE_RAIL = [
  { id: "lookup", label: "Stored" },
  { id: "find", label: "Find" },
  { id: "check", label: "Check" },
  { id: "gate", label: "Local mention" },
  { id: "done", label: "Result" },
] as const;

function tone(status: HhhDeskJob["status"]): "done" | "active" | "waiting" {
  if (status === "ready") return "done";
  if (status === "failed") return "waiting";
  return "active";
}

function placeOf(job: HhhDeskJob): string {
  const bits = [job.place, job.postcode4, job.gemeente].filter(Boolean);
  return bits.length > 0 ? bits.join(" · ") : "Place not stored yet";
}

function railIndex(job: HhhDeskJob): number {
  if (job.status === "ready" || job.stage === "done" || job.stage === "store") return 4;
  if (job.stage === "gate" || job.stage === "assess") return 3;
  if (job.stage === "check" || job.stage === "category") return 2;
  if (job.stage === "find" || job.stage === "search" || job.stage === "recheck") return 1;
  return 0;
}

function liveJob(job: HhhDeskJob): boolean {
  return job.status === "queued" || job.status === "running";
}

export function ControlHhhPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const { needsLogin } = useCanInteract();
  const [jobs, setJobs] = useState<HhhDeskJob[]>([]);
  const [sources, setSources] = useState<LocalSourceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [postcode4, setPostcode4] = useState("");
  const [gemeente, setGemeente] = useState("");
  const [tradeId, setTradeId] = useState<string>(TRADE_IDS[0] ?? "handyman");
  const [jobText, setJobText] = useState("");
  const [requestId, setRequestId] = useState("");
  const [saving, setSaving] = useState(false);
  const [csv, setCsv] = useState("");
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [drivingId, setDrivingId] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const driveRef = useRef(false);

  async function load() {
    try {
      const [jobsRes, sourceRes] = await Promise.all([
        api.listHhhShortlistJobs(),
        api.getLocalSources(),
      ]);
      setJobs(jobsRes.jobs);
      setSources(sourceRes);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load shortlist jobs");
    } finally {
      setLoading(false);
    }
  }

  async function drive(jobId: string) {
    if (driveRef.current) return;
    driveRef.current = true;
    setDrivingId(jobId);
    setOpenId(jobId);
    try {
      for (let step = 0; step < 24; step += 1) {
        const res = await api.stepHhhShortlist(jobId);
        setJobs((current) => current.map((job) => (job.id === res.job.id ? res.job : job)));
        if (res.job.status === "ready" || res.job.status === "failed") break;
        if (!res.continued) await new Promise((resolve) => window.setTimeout(resolve, 3000));
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the shortlist");
    } finally {
      driveRef.current = false;
      setDrivingId(null);
    }
  }

  useEffect(() => {
    if (authLoading || needsLogin || !isAdmin) {
      setLoading(false);
      return;
    }
    void load();
  }, [authLoading, needsLogin, isAdmin]);

  const live = jobs.some(liveJob);
  useEffect(() => {
    if (!live || !isAdmin || driveRef.current) return;
    const timer = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(timer);
  }, [live, isAdmin]);

  async function onAbortLive() {
    if (!isAdmin || stopping) return;
    setStopping(true);
    setError(null);
    try {
      const res = await api.abortLiveHhhShortlistJobs();
      setImportNote(`Stopped ${res.aborted} live job(s).`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not stop jobs");
    } finally {
      setStopping(false);
    }
  }

  async function onDeleteRecent() {
    if (!isAdmin || stopping) return;
    if (
      !window.confirm(
        "Delete the 40 most recent HHH shortlist jobs? Live ones are stopped first.",
      )
    ) {
      return;
    }
    setStopping(true);
    setError(null);
    try {
      const res = await api.deleteRecentHhhShortlistJobs(40);
      setImportNote(`Deleted ${res.deleted} recent job(s).`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete jobs");
    } finally {
      setStopping(false);
    }
  }

  async function onStart(e: FormEvent) {
    e.preventDefault();
    if (!isAdmin || saving) return;
    const code = postcode4.trim();
    const town = gemeente.trim();
    if (!code && !town) {
      setError("Enter a 4-digit postcode or a gemeente.");
      return;
    }
    if (code && !/^\d{4}$/.test(code)) {
      setError("Postcode must be exactly four digits.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const started = await api.startHhhShortlist({
        requestId: requestId.trim() || `desk-${crypto.randomUUID()}`,
        ...(code ? { postcode4: code } : {}),
        ...(town ? { gemeente: town } : {}),
        tradeId,
        ...(jobText.trim() ? { jobText: jobText.trim() } : {}),
      });
      setRequestId("");
      setJobText("");
      await load();
      void drive(started.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the shortlist");
    } finally {
      setSaving(false);
    }
  }

  async function onImport(e: FormEvent) {
    e.preventDefault();
    if (!csv.trim() || importing) return;
    setImporting(true);
    setImportNote(null);
    setError(null);
    try {
      const res = await api.importLocalSources(csv);
      setImportNote(`Saved ${res.imported} organisations. Skipped ${res.skipped} rows. Placing them on the map next.`);
      setCsv("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not import the list");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div>
      <header className="control-hero">
        <p className="control-eyebrow">Mission Control</p>
        <h1>HandyHouseHelp</h1>
        <p className="muted">
          Incoming company shortlists from handyhousehelp.ai, and a desk to start
          the same request by hand.{" "}
          <Link to="/control">Back to countries</Link>
        </p>
        {isAdmin ? (
          <div className="row" style={{ marginTop: "0.85rem", gap: "0.5rem" }}>
            <button
              className="btn secondary small"
              type="button"
              disabled={stopping || !live}
              onClick={() => void onAbortLive()}
            >
              {stopping ? "Stopping…" : "Stop live jobs"}
            </button>
            <button
              className="btn secondary small"
              type="button"
              disabled={stopping}
              onClick={() => void onDeleteRecent()}
            >
              Delete recent jobs
            </button>
          </div>
        ) : null}
        {importNote ? <p className="muted">{importNote}</p> : null}
      </header>

      {needsLogin ? <div className="error">Sign in to open Mission Control.</div> : null}
      {!needsLogin && !authLoading && !isAdmin ? (
        <div className="error">Admin access is required to see partner shortlists.</div>
      ) : null}
      {error ? <div className="error">{error}</div> : null}

      {isAdmin ? (
        <section className="panel control-start">
          <h2>Local lists</h2>
          <p className="hint">
            Upload ondernemersverenigingen and sport clubs. These are organisation
            websites, not the painting companies themselves. The search still runs
            without them. With them, a firm named on a nearby list is preferred.
          </p>
          <p className="muted">
            {sources
              ? `${sources.ov} ondernemersverenigingen · ${sources.sport} sport clubs · ${sources.located} placed on the map · ${sources.pending} still waiting for a location`
              : "Loading lists…"}
          </p>
          <form className="form-stack" onSubmit={(e) => void onImport(e)}>
            <label>
              CSV file
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  void file.text().then(setCsv);
                }}
              />
            </label>
            <label>
              Or paste the CSV
              <textarea
                value={csv}
                onChange={(e) => setCsv(e.target.value)}
                rows={6}
                placeholder={LIST_EXAMPLE}
              />
            </label>
            <pre className="muted" style={{ margin: 0, whiteSpace: "pre-wrap" }}>
              {LIST_EXAMPLE}
            </pre>
            <p className="hint">
              Columns: kind, name, town, postcode, website. kind is ov or sport.
              postcode is four digits. website is the organisation’s own site.
            </p>
            <button className="btn" type="submit" disabled={importing || !csv.trim()}>
              {importing ? "Uploading…" : "Upload lists"}
            </button>
          </form>
          {importNote ? <p>{importNote}</p> : null}
        </section>
      ) : null}

      {isAdmin ? (
        <section className="panel control-start">
          <h2>Start a shortlist</h2>
          <p className="hint">
            Same fields HandyHouseHelp sends: a 4-digit postcode or a gemeente, a
            trade, and the job in plain words. No street address. Status and the
            companies open on the request below.
          </p>
          <form className="form-stack" onSubmit={(e) => void onStart(e)}>
            <label>
              Postcode (4 digits)
              <input
                value={postcode4}
                onChange={(e) => setPostcode4(e.target.value)}
                inputMode="numeric"
                maxLength={4}
                placeholder="2161"
              />
            </label>
            <label>
              Gemeente
              <input
                value={gemeente}
                onChange={(e) => setGemeente(e.target.value)}
                placeholder="Lisse"
              />
            </label>
            <label>
              Trade
              <select value={tradeId} onChange={(e) => setTradeId(e.target.value)}>
                {TRADE_IDS.map((id) => (
                  <option key={id} value={id}>
                    {tradeLabel(id)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              What the resident needs
              <textarea
                value={jobText}
                onChange={(e) => setJobText(e.target.value)}
                maxLength={400}
                rows={3}
                placeholder="Schilderen kozijnen voor en achter, begane grond en 1e verdieping"
              />
            </label>
            <label>
              Request id (optional)
              <input
                value={requestId}
                onChange={(e) => setRequestId(e.target.value)}
                maxLength={120}
                placeholder="Left blank, a desk id is created"
              />
            </label>
            <button className="btn" type="submit" disabled={saving}>
              {saving ? "Starting…" : "Start shortlist"}
            </button>
          </form>
        </section>
      ) : null}

      {isAdmin ? (
        <section className="panel" style={{ marginTop: "1.25rem" }}>
          <h2>Requests</h2>
          {loading ? <p className="muted">Loading requests…</p> : null}
          {!loading && jobs.length === 0 ? (
            <div className="empty">No shortlist requests yet.</div>
          ) : null}
          {jobs.map((job) => {
            const open = openId === job.id;
            const at = railIndex(job);
            const latest = job.progress[job.progress.length - 1];
            return (
              <article key={job.id} className="mission-card">
                <div className="row" style={{ gap: "0.4rem", flexWrap: "wrap" }}>
                  <StatusChip label={job.status} tone={tone(job.status)} />
                  {job.stage ? <StatusChip label={job.stage} /> : null}
                  {job.fromCache ? <StatusChip label="from cache" tone="done" /> : null}
                  {job.visitCount > 0 && job.stage === "assess" ? (
                    <StatusChip label={`${job.checked}/${job.visitCount} websites`} tone="active" />
                  ) : null}
                </div>
                <h3 style={{ margin: "0.6rem 0 0.2rem" }}>
                  {tradeLabel(job.tradeId)} · {placeOf(job)}
                </h3>
                <p className="muted" style={{ margin: 0 }}>
                  {job.requestId}
                  {job.updatedAt ? ` · ${new Date(job.updatedAt).toLocaleString()}` : ""}
                </p>
                {job.jobText ? <p style={{ margin: "0.45rem 0 0" }}>{job.jobText}</p> : null}
                <p style={{ margin: "0.45rem 0 0" }}>
                  {drivingId === job.id
                    ? "Updating…"
                    : latest || (liveJob(job) ? "Waiting to start." : "No status notes yet.")}
                </p>
                <div className="place-stage-row" aria-label="Shortlist progress">
                  {STAGE_RAIL.map((stage, index) => (
                    <span
                      key={stage.id}
                      className={
                        job.status === "ready" || index < at ? "place-stage done" : "place-stage"
                      }
                    >
                      {stage.label}
                    </span>
                  ))}
                </div>
                <button
                  className="btn secondary"
                  type="button"
                  style={{ marginTop: "0.75rem" }}
                  onClick={() => {
                    setOpenId(open ? null : job.id);
                    if (!open && liveJob(job)) void drive(job.id);
                  }}
                >
                  {open ? "Hide status and result" : "Status and result"}
                </button>
                {open ? (
                  <div style={{ marginTop: "0.8rem" }}>
                    {job.lastError ? <div className="error">{job.lastError}</div> : null}
                    {job.progress.length > 0 ? (
                      <ol style={{ margin: "0.4rem 0 0", paddingLeft: "1.2rem" }}>
                        {job.progress.map((line, index) => (
                          <li key={`${job.id}-${index}`}>{line}</li>
                        ))}
                      </ol>
                    ) : (
                      <p className="muted">No updates yet. The first step looks up companies already on file.</p>
                    )}
                    {job.companies.length > 0 ? (
                      <>
                        <h3 style={{ margin: "0.9rem 0 0.3rem" }}>Result</h3>
                        <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                          {job.companies.map((company) => (
                            <li key={company.website}>
                              <a href={company.website} target="_blank" rel="noreferrer">
                                {company.name}
                              </a>{" "}
                              <span className="muted">
                                {company.status === "gevonden"
                                  ? `${company.status} · ${company.score} bronnen`
                                  : `${company.status} · ${company.score}`}
                              </span>
                              <div className="muted">{company.matchNote}</div>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : job.status === "ready" ? (
                      <p>No company was returned.</p>
                    ) : null}
                    {job.withheld.length > 0 ? (
                      <p className="muted" style={{ margin: "0.5rem 0 0" }}>
                        Not returned: {job.withheld.join("; ")}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}
