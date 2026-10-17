import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { TRADE_IDS, tradeLabel } from "@h3-trust/schema";
import { api, type HhhDeskJob } from "../../api";
import { StatusChip } from "../../components/Badges";
import { useAuth } from "../../auth/AuthContext";
import { useCanInteract } from "../../hooks/useCanInteract";

function tone(status: HhhDeskJob["status"]): "done" | "active" | "waiting" {
  if (status === "ready") return "done";
  if (status === "failed") return "waiting";
  return "active";
}

function placeOf(job: HhhDeskJob): string {
  const bits = [job.place, job.postcode4, job.gemeente].filter(Boolean);
  return bits.length > 0 ? bits.join(" · ") : "Place not stored yet";
}

export function ControlHhhPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const { needsLogin } = useCanInteract();
  const [jobs, setJobs] = useState<HhhDeskJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [postcode4, setPostcode4] = useState("");
  const [gemeente, setGemeente] = useState("");
  const [tradeId, setTradeId] = useState<string>(TRADE_IDS[0] ?? "handyman");
  const [jobText, setJobText] = useState("");
  const [requestId, setRequestId] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const res = await api.listHhhShortlistJobs();
      setJobs(res.jobs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load shortlist jobs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authLoading || needsLogin || !isAdmin) {
      setLoading(false);
      return;
    }
    void load();
  }, [authLoading, needsLogin, isAdmin]);

  const live = jobs.some((job) => job.status === "queued" || job.status === "running");
  useEffect(() => {
    if (!live || !isAdmin) return;
    const timer = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(timer);
  }, [live, isAdmin]);

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
      await api.startHhhShortlist({
        requestId: requestId.trim() || `desk-${crypto.randomUUID()}`,
        ...(code ? { postcode4: code } : {}),
        ...(town ? { gemeente: town } : {}),
        tradeId,
        ...(jobText.trim() ? { jobText: jobText.trim() } : {}),
      });
      setRequestId("");
      setJobText("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the shortlist");
    } finally {
      setSaving(false);
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
      </header>

      {needsLogin ? <div className="error">Sign in to open Mission Control.</div> : null}
      {!needsLogin && !authLoading && !isAdmin ? (
        <div className="error">Admin access is required to see partner shortlists.</div>
      ) : null}
      {error ? <div className="error">{error}</div> : null}

      {isAdmin ? (
        <section className="panel control-start">
          <h2>Start a shortlist</h2>
          <p className="hint">
            Same fields HandyHouseHelp sends: a 4-digit postcode or a gemeente, a
            trade, and the job in plain words. No street address.
          </p>
          <form className="form-stack" onSubmit={(e) => void onStart(e)}>
            <label>
              Postcode (4 digits)
              <input
                value={postcode4}
                onChange={(e) => setPostcode4(e.target.value)}
                inputMode="numeric"
                maxLength={4}
                placeholder="1012"
              />
            </label>
            <label>
              Gemeente
              <input
                value={gemeente}
                onChange={(e) => setGemeente(e.target.value)}
                placeholder="Amsterdam"
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
                placeholder="Lekkage onder de dakgoot, bitumen plat dak"
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
          {jobs.map((job) => (
            <article key={job.id} className="mission-card">
              <div className="row" style={{ gap: "0.4rem", flexWrap: "wrap" }}>
                <StatusChip label={job.status} tone={tone(job.status)} />
                {job.stage ? <StatusChip label={job.stage} /> : null}
                {job.fromCache ? <StatusChip label="from cache" tone="done" /> : null}
              </div>
              <h3 style={{ margin: "0.6rem 0 0.2rem" }}>
                {tradeLabel(job.tradeId)} · {placeOf(job)}
              </h3>
              <p className="muted" style={{ margin: 0 }}>
                {job.requestId}
                {job.updatedAt ? ` · ${new Date(job.updatedAt).toLocaleString()}` : ""}
              </p>
              {job.jobText ? <p style={{ margin: "0.45rem 0 0" }}>{job.jobText}</p> : null}
              {job.companies.length > 0 ? (
                <ul style={{ margin: "0.6rem 0 0", paddingLeft: "1.1rem" }}>
                  {job.companies.map((company) => (
                    <li key={company.website}>
                      <a href={company.website} target="_blank" rel="noreferrer">
                        {company.name}
                      </a>{" "}
                      <span className="muted">
                        {company.status} · {company.score}
                      </span>
                      <div className="muted">{company.matchNote}</div>
                    </li>
                  ))}
                </ul>
              ) : null}
              {job.withheld.length > 0 ? (
                <p className="muted" style={{ margin: "0.5rem 0 0" }}>
                  Not returned: {job.withheld.join("; ")}
                </p>
              ) : null}
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}
