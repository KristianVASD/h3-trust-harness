import { useMemo, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { v4 as uuid } from "uuid";
import { computeListCoverage, type Company, type Review } from "@h3-trust/schema";
import type { MissionData } from "../../hooks/useMissionData";
import { StatusChip } from "../../components/Badges";
import { CompanyProfileTags } from "../../components/CompanyProfileTags";
import { api } from "../../api";
import { countTrustedLists } from "../../lib/worker";

export function WorkerResultsPage() {
  const { missionId = "" } = useParams();
  const { companies, sources, reviews, reload } = useOutletContext<MissionData>();
  const trustedCount = countTrustedLists(sources);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [adjustScore, setAdjustScore] = useState("70");
  const [reason, setReason] = useState("");

  const companyReviews = useMemo(() => {
    const map = new Map<string, Review>();
    for (const r of reviews) {
      if (r.targetType !== "company") continue;
      const prev = map.get(r.targetId);
      if (!prev || r.createdAt > prev.createdAt) map.set(r.targetId, r);
    }
    return map;
  }, [reviews]);

  const ranked = useMemo(() => {
    return [...companies]
      .map((c) => {
        const cov = computeListCoverage(c, sources);
        const human = companyReviews.get(c.id);
        const displayScore =
          human?.humanScore != null ? human.humanScore : cov.score;
        return { company: c, cov, human, displayScore };
      })
      .sort(
        (a, b) =>
          b.displayScore - a.displayScore ||
          a.company.name.localeCompare(b.company.name),
      );
  }, [companies, sources, companyReviews]);

  function downloadCsv() {
    const header = [
      "name",
      "category",
      "trust_score",
      "list_coverage",
      "human_action",
      "lists_on",
      "lists_total",
      "mentions",
      "kvk_gate",
      "kvk_number",
      "region",
      "address",
      "phone",
      "email",
      "website_url",
      "status",
      "capabilities",
      "serviceContexts",
      "differentiators",
      "profileSnippet",
    ];
    const lines = ranked.map(({ company: c, cov, human, displayScore }) => {
      const mentions = cov.lists.map((s) => s.name).join("; ");
      return [
        csvEscape(c.name),
        csvEscape(c.category ?? ""),
        String(displayScore),
        String(cov.score),
        human?.action ?? "",
        String(cov.onCount),
        String(cov.totalCount),
        csvEscape(mentions),
        c.kvk_gate,
        c.kvk_number ?? "",
        csvEscape(c.region ?? ""),
        csvEscape(c.address ?? ""),
        csvEscape(c.phone ?? ""),
        csvEscape(c.email ?? ""),
        csvEscape(c.website_url ?? ""),
        c.status,
        csvEscape((c.capabilities ?? []).join("; ")),
        csvEscape((c.serviceContexts ?? []).join("; ")),
        csvEscape((c.differentiators ?? []).join("; ")),
        csvEscape(c.profileSnippet ?? ""),
      ].join(",");
    });
    const blob = new Blob([[header.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `h3-trust-results-${missionId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportBundle() {
    setBusy(true);
    setError(null);
    try {
      const bundle = await api.exportMission(missionId);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `h3-trust-${missionId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitCompanyReview(
    company: Company,
    listScore: number,
    action: "agree" | "adjust" | "disagree",
  ) {
    if (
      (action === "adjust" || action === "disagree") &&
      reason.trim().length < 8
    ) {
      setError("Adjust / Disagree requires a reason (min 8 characters).");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const humanScore =
        action === "agree"
          ? listScore
          : action === "disagree"
            ? 0
            : Number(adjustScore);

      const review: Review = {
        id: uuid(),
        missionId,
        producer: "Human",
        targetType: "company",
        targetId: company.id,
        action,
        originalScore: listScore,
        humanScore,
        reason: reason.trim() || undefined,
        valueTags: [],
        observationIds: [],
        hypothesisIds: [],
        evidenceIds: [],
        version: 1,
        fedBackToOmega: false,
        createdAt: now,
        updatedAt: now,
        v: 1,
      };

      await api.createInMission(missionId, "reviews", review);
      setAdjustingId(null);
      setReason("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="worker-step-page">
      <div className="worker-step-intro">
        <h2>Trust results</h2>
        <p className="hint">
          Companies ranked by weighted trusted-list coverage. Human check is the
          second CARA layer — agree, adjust, or disagree with a reason.
        </p>
        <div className="row" style={{ marginTop: "0.5rem", flexWrap: "wrap" }}>
          <StatusChip
            label={`${ranked.length} companies`}
            tone={ranked.length ? "active" : "waiting"}
          />
          <StatusChip
            label={`${trustedCount} trusted lists`}
            tone={trustedCount ? "done" : "waiting"}
          />
          {ranked.length > 0 ? (
            <>
              <button
                type="button"
                className="btn secondary small"
                onClick={downloadCsv}
              >
                Download CSV
              </button>
              <button
                type="button"
                className="btn secondary small"
                disabled={busy}
                onClick={() => void exportBundle()}
              >
                Export investigation
              </button>
            </>
          ) : null}
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}

      {!ranked.length ? (
        <div className="empty worker-empty-hero">
          <p>No companies yet.</p>
          <p className="muted">
            Import a CSV against a trusted list to build the trust ranking.
          </p>
          <div className="row" style={{ justifyContent: "center", marginTop: "1rem" }}>
            <Link className="btn" to={`/work/${missionId}/extract`}>
              ← Extract data
            </Link>
          </div>
        </div>
      ) : (
        <>
          {trustedCount < 2 ? (
            <p className="hint worker-thin-warning">
              Only {trustedCount} trusted list{trustedCount === 1 ? "" : "s"} —
              scores are thin. Approve more lists in CARA for a wider portfolio.
            </p>
          ) : null}

          <div className="worker-results-table-wrap">
            <table className="worker-results-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Company</th>
                  <th>Trust</th>
                  <th>Mentions</th>
                  <th>KvK</th>
                  <th>Human check</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map(({ company: c, cov, human, displayScore }, idx) => (
                  <tr key={c.id} className="worker-results-row">
                    <td className="mono muted">{idx + 1}</td>
                    <td>
                      <strong>{c.name}</strong>
                      {c.category ? (
                        <div className="company-category-label">{c.category}</div>
                      ) : null}
                      {c.region ? (
                        <div className="muted" style={{ fontSize: "0.85rem" }}>
                          {c.region}
                        </div>
                      ) : null}
                      <CompanyProfileTags company={c} />
                      <div style={{ marginTop: "0.25rem" }}>
                        <Link
                          className="muted"
                          style={{ fontSize: "0.8rem" }}
                          to={`/missions/${missionId}`}
                        >
                          Open in investigation →
                        </Link>
                      </div>
                    </td>
                    <td>
                      <span className="worker-trust-score">{displayScore}</span>
                      <div className="muted" style={{ fontSize: "0.8rem" }}>
                        lists {cov.score} · {cov.onCount}/{cov.totalCount}
                      </div>
                      {human ? (
                        <StatusChip
                          label={`human ${human.action}`}
                          tone={
                            human.action === "disagree" ? "waiting" : "done"
                          }
                        />
                      ) : null}
                    </td>
                    <td>
                      {cov.lists.length ? (
                        <ul className="worker-mention-list">
                          {cov.lists.map((s) => (
                            <li key={s.id}>{s.name}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <StatusChip label={c.kvk_gate} />
                    </td>
                    <td>
                      {human ? (
                        <p className="hint" style={{ margin: 0, maxWidth: 220 }}>
                          {human.reason || `Recorded: ${human.action}`}
                        </p>
                      ) : cov.score > 0 || c.status === "target" ? (
                        adjustingId === c.id ? (
                          <div className="worker-human-check">
                            <label>
                              Score
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={adjustScore}
                                onChange={(e) => setAdjustScore(e.target.value)}
                              />
                            </label>
                            <label>
                              Reason
                              <textarea
                                rows={2}
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder="Why adjust / disagree?"
                              />
                            </label>
                            <div className="row" style={{ gap: "0.25rem", flexWrap: "wrap" }}>
                              <button
                                type="button"
                                className="btn small"
                                disabled={busy}
                                onClick={() =>
                                  void submitCompanyReview(c, cov.score, "adjust")
                                }
                              >
                                Save adjust
                              </button>
                              <button
                                type="button"
                                className="btn danger small"
                                disabled={busy}
                                onClick={() =>
                                  void submitCompanyReview(
                                    c,
                                    cov.score,
                                    "disagree",
                                  )
                                }
                              >
                                Disagree
                              </button>
                              <button
                                type="button"
                                className="btn secondary small"
                                onClick={() => {
                                  setAdjustingId(null);
                                  setReason("");
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="row" style={{ gap: "0.25rem", flexWrap: "wrap" }}>
                            <button
                              type="button"
                              className="btn small"
                              disabled={busy}
                              onClick={() =>
                                void submitCompanyReview(c, cov.score, "agree")
                              }
                            >
                              Agree
                            </button>
                            <button
                              type="button"
                              className="btn secondary small"
                              disabled={busy}
                              onClick={() => {
                                setAdjustingId(c.id);
                                setAdjustScore(String(cov.score));
                                setReason("");
                              }}
                            >
                              Adjust
                            </button>
                            <button
                              type="button"
                              className="btn danger small"
                              disabled={busy}
                              onClick={() => {
                                setAdjustingId(c.id);
                                setAdjustScore("0");
                                setReason("");
                              }}
                            >
                              Disagree
                            </button>
                          </div>
                        )
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <footer className="worker-step-footer">
        <Link className="btn secondary" to={`/work/${missionId}/extract`}>
          ← Extract
        </Link>
        <Link className="btn secondary" to={`/work/${missionId}/coverage`}>
          Coverage
        </Link>
        <Link className="btn secondary" to={`/work/${missionId}/gaps`}>
          Back to Gaps
        </Link>
        <Link className="btn secondary" to={`/missions/${missionId}`}>
          ← Investigation
        </Link>
      </footer>
    </div>
  );
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
