import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { v4 as uuid } from "uuid";
import {
  computeListCoverage,
  DEFAULT_SEARCH_PLAN_VERSION,
  type Company,
  type Mission,
  type Review,
  type ServiceContext,
  type Source,
} from "@h3-trust/schema";
import { api } from "../api";
import { listReviews } from "../api-extra";
import { countTrustedLists } from "../lib/worker";
import { CompanyProfileTags } from "../components/CompanyProfileTags";
import { StatusChip } from "../components/Badges";
import "./Search.css";

/* ── Query parser — keyword match against real missions + aliases ── */

interface ParsedQuery {
  sector?: string;
  location?: string;
  context?: string;
}

const SECTOR_ALIASES: Record<string, string[]> = {
  painter: ["schilder", "painter", "painters", "schilderwerk", "schilders"],
  plumber: ["loodgieter", "plumber", "plumbers", "loodgieters"],
  electrician: ["elektricien", "electrician", "elektriciens", "elektra"],
  roofing: ["dakdekker", "roofer", "roofing", "dakdekkers"],
  carpentry: ["timmerman", "carpenter", "timmerwerk"],
  drainage: ["riool", "drainage", "riolering", "ontstopping"],
};

const CONTEXT_ALIASES: Record<string, string> = {
  particulier: "private",
  private: "private",
  vve: "hoa",
  hoa: "hoa",
  gemeente: "municipal",
  municipal: "municipal",
  commercieel: "commercial",
  commercial: "commercial",
  industrieel: "industrial",
  industrial: "industrial",
};

/** Strip labels like "(DEMO)" so "Painters (DEMO)" matches "painters". */
function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function missionSectorText(m: Mission): string {
  return normalizeLabel(`${m.subsector} ${m.sector}`);
}

function aliasHit(hay: string, needle: string): boolean {
  const n = normalizeLabel(needle);
  if (!n) return false;
  if (hay.includes(n) || n.includes(hay)) return true;
  const fromKey = SECTOR_ALIASES[n];
  if (fromKey?.some((a) => hay.includes(a))) return true;
  for (const [key, list] of Object.entries(SECTOR_ALIASES)) {
    const inFamily =
      key === n ||
      list.some((a) => a === n || n.includes(a) || a.includes(n));
    if (!inFamily) continue;
    if (hay.includes(key) || list.some((a) => hay.includes(a))) return true;
  }
  return false;
}

function parseQuery(raw: string, missions: Mission[]): ParsedQuery {
  const lower = normalizeLabel(raw);

  // Longest location first so "Nieuw-Vennep" wins over shorter overlaps.
  let location: string | undefined;
  const locations = [...new Set(missions.map((m) => m.location))].sort(
    (a, b) => b.length - a.length,
  );
  for (const loc of locations) {
    if (lower.includes(normalizeLabel(loc))) {
      location = loc;
      break;
    }
  }

  let sector: string | undefined;
  for (const [key, aliases] of Object.entries(SECTOR_ALIASES)) {
    if (aliases.some((a) => lower.includes(a)) || lower.includes(key)) {
      sector = key;
      break;
    }
  }
  if (!sector) {
    // Match against actual mission sector / subsector labels (any language).
    const labels = [
      ...new Set(
        missions.flatMap((m) => [m.subsector, m.sector].filter(Boolean)),
      ),
    ].sort((a, b) => b.length - a.length);
    for (const label of labels) {
      const norm = normalizeLabel(label);
      if (norm.length >= 3 && lower.includes(norm)) {
        sector = label;
        break;
      }
    }
  }

  let context: string | undefined;
  for (const [alias, value] of Object.entries(CONTEXT_ALIASES)) {
    if (lower.includes(alias)) {
      context = value;
      break;
    }
  }

  return { sector, location, context };
}

function missionMatchesSector(m: Mission, sector: string): boolean {
  return aliasHit(missionSectorText(m), sector);
}

function missionMatchesQuery(m: Mission, parsed: ParsedQuery): boolean {
  const locOk = parsed.location
    ? normalizeLabel(m.location) === normalizeLabel(parsed.location)
    : true;
  const secOk = parsed.sector
    ? missionMatchesSector(m, parsed.sector)
    : true;
  return locOk && secOk;
}

function companyMatchesSector(company: Company, sector: string): boolean {
  const hay = normalizeLabel(
    `${company.sector} ${company.category} ${company.name}`,
  );
  // Name-only match is weak; require sector or category signal when present.
  const sectorHay = normalizeLabel(`${company.sector} ${company.category}`);
  if (sectorHay.trim()) return aliasHit(sectorHay, sector);
  return aliasHit(hay, sector);
}

type MissionBundle = {
  mission: Mission;
  sources: Source[];
  companies: Company[];
  reviews: Review[];
};

function rankMissionsForQuery(
  bundles: MissionBundle[],
  parsed: ParsedQuery,
): MissionBundle[] {
  return [...bundles].sort((a, b) => {
    const aComps = a.companies.filter((c) => c.kvk_gate !== "fail").length;
    const bComps = b.companies.filter((c) => c.kvk_gate !== "fail").length;
    if (bComps !== aComps) return bComps - aComps;

    const aTrusted = countTrustedLists(a.sources);
    const bTrusted = countTrustedLists(b.sources);
    if (bTrusted !== aTrusted) return bTrusted - aTrusted;

    if (parsed.sector) {
      const aExact = normalizeLabel(a.mission.subsector).includes(
        normalizeLabel(parsed.sector),
      )
        ? 1
        : 0;
      const bExact = normalizeLabel(b.mission.subsector).includes(
        normalizeLabel(parsed.sector),
      )
        ? 1
        : 0;
      if (bExact !== aExact) return bExact - aExact;
    }

    return b.mission.updatedAt.localeCompare(a.mission.updatedAt);
  });
}

const SECTOR_DISPLAY: Record<string, string> = {
  painter: "Painters",
  plumber: "Plumbers",
  electrician: "Electricians",
  roofing: "Roofing",
  carpentry: "Carpentry",
  drainage: "Drainage",
};

function displaySubsector(sector: string): string {
  const key = normalizeLabel(sector);
  if (SECTOR_DISPLAY[key]) return SECTOR_DISPLAY[key];
  // Title-case free-form labels from missions
  return sector
    .replace(/\([^)]*\)/g, "")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const defaultPhases: Mission["phases"] = [
  { key: "observation", status: "active" },
  { key: "hypothesis", status: "waiting" },
  { key: "evidence", status: "waiting" },
  { key: "cara", status: "waiting" },
  { key: "patterns", status: "waiting" },
  { key: "companies", status: "waiting" },
  { key: "deep_check", status: "waiting" },
];

/* ── Ranked result ── */

interface RankedCompany {
  company: Company;
  score: number;
  onCount: number;
  totalCount: number;
  lists: { id: string; name: string }[];
  humanReview?: Review;
  displayScore: number;
}

/* ── Page ── */

export function SingleSearchPage() {
  const navigate = useNavigate();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedHint, setParsedHint] = useState<ParsedQuery | null>(null);
  const [noMatchReason, setNoMatchReason] = useState<string | null>(null);

  const [matchedMission, setMatchedMission] = useState<Mission | null>(null);
  const [ranked, setRanked] = useState<RankedCompany[]>([]);
  const [trustedCount, setTrustedCount] = useState(0);

  const [busy, setBusy] = useState(false);
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [adjustScore, setAdjustScore] = useState("70");
  const [reason, setReason] = useState("");

  useEffect(() => {
    void api
      .listMissions()
      .then(setMissions)
      .catch(() => {});
  }, []);

  const exampleQueries = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const m of missions) {
      const sub = normalizeLabel(m.subsector).replace(/\s+/g, " ");
      const loc = m.location;
      if (!sub || !loc) continue;
      const q = `${m.subsector.replace(/\s*\([^)]*\)\s*/g, "").trim()} in ${loc}`;
      const key = normalizeLabel(q);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(q);
      if (out.length >= 6) break;
    }
    return out;
  }, [missions]);

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setSearched(true);
    setMatchedMission(null);
    setRanked([]);
    setTrustedCount(0);
    setParsedHint(null);
    setNoMatchReason(null);

    try {
      const parsed = parseQuery(query, missions);
      setParsedHint(parsed);

      // Never silently fall through to the first mission (usually DEMO).
      if (!parsed.location && !parsed.sector) {
        setNoMatchReason(
          "Could not detect a location or sector in your query. Try e.g. “painters in Haarlemmermeer”, or pick an investigation below.",
        );
        return;
      }

      let candidates = missions.filter((m) => missionMatchesQuery(m, parsed));

      // Location-only query across different subsectors → ask for sector.
      if (parsed.location && !parsed.sector) {
        const subsectors = [
          ...new Set(candidates.map((m) => normalizeLabel(m.subsector))),
        ];
        if (subsectors.length > 1) {
          setNoMatchReason(
            `Several investigations exist in ${parsed.location}. Add a sector (e.g. painters, plumbers) so we pick the right one.`,
          );
          return;
        }
      }

      // Sector-only: keep candidates. Location+sector: already filtered.
      if (!candidates.length) {
        const available = missions
          .map(
            (m) =>
              `${m.location} · ${m.subsector.replace(/\s*\([^)]*\)\s*/g, "").trim()}`,
          )
          .filter((v, i, arr) => arr.indexOf(v) === i);
        setNoMatchReason(
          available.length
            ? `No investigation matches this query. Available: ${available.join("; ")}.`
            : "No investigations yet. Create one in Mission Control first.",
        );
        return;
      }

      const bundles: MissionBundle[] = await Promise.all(
        candidates.map(async (mission) => {
          const [sources, companies, reviews] = await Promise.all([
            api.listSources(mission.id),
            api.listCompanies(mission.id),
            listReviews(mission.id),
          ]);
          return { mission, sources, companies, reviews };
        }),
      );

      const rankedMissions = rankMissionsForQuery(bundles, parsed);
      const best = rankedMissions[0];
      if (!best) {
        setNoMatchReason("No investigation matched after loading data.");
        return;
      }

      // Prefer a mission that actually has seed/imported companies when twins exist.
      setMatchedMission(best.mission);
      setTrustedCount(countTrustedLists(best.sources));

      const reviewMap = new Map<string, Review>();
      for (const r of best.reviews) {
        if (r.targetType !== "company") continue;
        const prev = reviewMap.get(r.targetId);
        if (!prev || r.createdAt > prev.createdAt) reviewMap.set(r.targetId, r);
      }

      let results: RankedCompany[] = best.companies
        .filter((c) => c.kvk_gate !== "fail")
        .filter((c) =>
          parsed.sector ? companyMatchesSector(c, parsed.sector) : true,
        )
        .map((c) => {
          const cov = computeListCoverage(c, best.sources);
          const human = reviewMap.get(c.id);
          const displayScore =
            human?.humanScore != null ? human.humanScore : cov.score;
          return {
            company: c,
            score: cov.score,
            onCount: cov.onCount,
            totalCount: cov.totalCount,
            lists: cov.lists.map((s) => ({ id: s.id, name: s.name })),
            humanReview: human,
            displayScore,
          };
        })
        .sort((a, b) => b.displayScore - a.displayScore);

      if (parsed.context) {
        const ctx = parsed.context as ServiceContext;
        results = results.filter((r) =>
          (r.company.serviceContexts ?? []).includes(ctx),
        );
      }

      setRanked(results.slice(0, 5));

      if (!results.length) {
        setNoMatchReason(
          `Matched “${best.mission.location} · ${best.mission.subsector}” but it has no companies yet. Import or discover companies in the Data Worker for that mission — seed data only lives on investigations that were seeded or filled.`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  async function startInvestigationFromQuery() {
    if (!parsedHint?.location || !parsedHint?.sector) return;
    setCreating(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const subsector = displaySubsector(parsedHint.sector);
      const mission: Mission = {
        id: uuid(),
        location: parsedHint.location,
        country: "Netherlands",
        sector: "Home Maintenance",
        subsector,
        goal: `Find trustworthy ${subsector.toLowerCase()} in ${parsedHint.location} and validate source reliability.`,
        search_plan_version: DEFAULT_SEARCH_PLAN_VERSION,
        discoveryBrief: {
          approach: "Warm-start reusable lists from catalogue; fill sector-specific gaps.",
          candidateListTypes: ["registry", "local_business_association", "branch_association"],
          successCriteria:
            "≥5 CARA-accepted/adjusted lists before company deep-check",
          producer: "Human",
          updatedAt: now,
        },
        phases: defaultPhases,
        producer: "Human",
        createdAt: now,
        updatedAt: now,
        v: 1,
      };
      await api.createMission(mission);
      navigate(`/work/${mission.id}/brief`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to start investigation",
      );
    } finally {
      setCreating(false);
    }
  }

  async function submitReview(
    company: Company,
    listScore: number,
    action: "agree" | "adjust" | "disagree",
  ) {
    if (!matchedMission) return;
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
        missionId: matchedMission.id,
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

      await api.createInMission(matchedMission.id, "reviews", review);
      setAdjustingId(null);
      setReason("");

      setRanked((prev) =>
        prev
          .map((r) =>
            r.company.id === company.id
              ? { ...r, humanReview: review, displayScore: humanScore }
              : r,
          )
          .sort((a, b) => b.displayScore - a.displayScore),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="single-search">
      {/* Hero */}
      <div className="search-hero">
        <h1>🔍 Single Search</h1>
        <p className="thesis">
          One question. One answer. Evidence-based, not popularity-based.
          Every score has a reason. Every reason has a source.
        </p>
      </div>

      {/* Search bar */}
      <form className="search-bar" onSubmit={onSearch}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='e.g. "painters in Haarlemmermeer" or "loodgieters in Amstelveen"'
          autoFocus
        />
        <button type="submit" className="btn" disabled={loading}>
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {exampleQueries.length ? (
        <div className="search-examples">
          <span className="muted">Try:</span>
          {exampleQueries.map((q) => (
            <button
              key={q}
              type="button"
              className="search-example-chip"
              onClick={() => setQuery(q)}
            >
              {q}
            </button>
          ))}
        </div>
      ) : null}

      {error ? <div className="error">{error}</div> : null}

      {/* No match / empty investigation */}
      {searched && !loading && (!matchedMission || !ranked.length) ? (
        <div className="search-no-match">
          <p>
            <strong>
              {!matchedMission
                ? "No investigation found for this query."
                : "Investigation matched, but no companies to rank."}
            </strong>
          </p>
          {noMatchReason ? <p className="muted">{noMatchReason}</p> : null}
          {parsedHint && (parsedHint.location || parsedHint.sector) ? (
            <p className="muted mono" style={{ fontSize: "0.85rem" }}>
              Parsed:{" "}
              {[
                parsedHint.location && `location=${parsedHint.location}`,
                parsedHint.sector && `sector=${parsedHint.sector}`,
                parsedHint.context && `context=${parsedHint.context}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
          <div
            className="row"
            style={{ justifyContent: "center", marginTop: "0.75rem", gap: "0.5rem" }}
          >
            {!matchedMission &&
            parsedHint?.location &&
            parsedHint?.sector ? (
              <button
                type="button"
                className="btn"
                disabled={creating}
                onClick={() => void startInvestigationFromQuery()}
              >
                {creating
                  ? "Starting…"
                  : `Start ${displaySubsector(parsedHint.sector)} · ${parsedHint.location}`}
              </button>
            ) : null}
            {matchedMission ? (
              <Link
                className="btn"
                to={`/work/${matchedMission.id}/extract`}
              >
                Open Data Worker → Import
              </Link>
            ) : null}
            <Link className="btn secondary" to="/">
              ← Mission Control
            </Link>
          </div>
          {!matchedMission &&
          parsedHint?.location &&
          parsedHint?.sector ? (
            <p className="muted" style={{ marginTop: "0.85rem", fontSize: "0.85rem" }}>
              Starts a Data Worker mission and warm-starts reusable seed lists
              (e.g. KvK, local associations). Sector-specific lists stay as gaps
              to fill — companies are not copied from Painters.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Results */}
      {matchedMission && ranked.length ? (
        <div className="search-results">
          {/* Mission context bar */}
          <div className="search-mission-bar">
            <div>
              <h2>
                {matchedMission.location} · {matchedMission.subsector}
              </h2>
              <p className="muted">{matchedMission.goal}</p>
            </div>
            <div className="row" style={{ gap: "0.35rem", flexWrap: "wrap" }}>
              <StatusChip
                label={`${trustedCount} trusted lists`}
                tone={trustedCount >= 5 ? "done" : "active"}
              />
              <StatusChip
                label={`${ranked.length} results`}
                tone={ranked.length ? "active" : "waiting"}
              />
              <Link
                className="btn secondary small"
                to={`/missions/${matchedMission.id}`}
              >
                ← Investigation
              </Link>
              <Link
                className="btn secondary small"
                to={`/work/${matchedMission.id}/gaps`}
              >
                ⚡ Data Worker
              </Link>
            </div>
          </div>

          {/* Ranked cards */}
          <div className="search-result-list">
            {ranked.map((r, idx) => (
              <article key={r.company.id} className="search-result-card">
                <div className="search-result-rank">#{idx + 1}</div>

                <div className="search-result-body">
                  <header>
                    <div>
                      <strong>{r.company.name}</strong>
                      {r.company.category ? (
                        <span
                          className="muted mono"
                          style={{ marginLeft: "0.5rem" }}
                        >
                          {r.company.category}
                        </span>
                      ) : null}
                      {r.company.region ? (
                        <span
                          className="muted"
                          style={{ marginLeft: "0.5rem" }}
                        >
                          {r.company.region}
                        </span>
                      ) : null}
                    </div>
                    <div className="row" style={{ gap: "0.35rem" }}>
                      <span
                        className={`search-score ${
                          r.displayScore >= 70
                            ? "high"
                            : r.displayScore >= 40
                              ? "mid"
                              : "low"
                        }`}
                      >
                        {r.displayScore}
                      </span>
                      <StatusChip
                        label={`KvK: ${r.company.kvk_gate}`}
                        tone={
                          r.company.kvk_gate === "pass"
                            ? "done"
                            : r.company.kvk_gate === "fail"
                              ? "waiting"
                              : "active"
                        }
                      />
                    </div>
                  </header>

                  {/* Can / For / Notable + profile snippet */}
                  <CompanyProfileTags company={r.company} />

                  {/* Why */}
                  <details className="search-why">
                    <summary>
                      Why {r.displayScore}/100? · {r.onCount}/
                      {r.totalCount} trusted lists
                    </summary>
                    <div className="search-why-body">
                      {r.lists.length ? (
                        <ul>
                          {r.lists.map((s) => (
                            <li key={s.id}>{s.name}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="muted">No trusted list mentions yet.</p>
                      )}
                      {r.humanReview ? (
                        <p className="search-human-note">
                          Human: {r.humanReview.action}
                          {r.humanReview.humanScore != null
                            ? ` → ${r.humanReview.humanScore}`
                            : ""}
                          {r.humanReview.reason
                            ? ` · "${r.humanReview.reason}"`
                            : ""}
                        </p>
                      ) : null}
                    </div>
                  </details>

                  {/* Backwards CARA — one click */}
                  <div className="search-cara">
                    {r.humanReview ? (
                      <span className="search-cara-done">
                        ✓ {r.humanReview.action}
                        {r.humanReview.reason
                          ? ` · "${r.humanReview.reason}"`
                          : ""}
                      </span>
                    ) : adjustingId === r.company.id ? (
                      <div className="search-cara-form">
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
                            placeholder="Why adjust / disagree? (min 8 chars)"
                          />
                        </label>
                        <div className="row" style={{ gap: "0.25rem" }}>
                          <button
                            type="button"
                            className="btn small"
                            disabled={busy}
                            onClick={() =>
                              void submitReview(r.company, r.score, "adjust")
                            }
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="btn danger small"
                            disabled={busy}
                            onClick={() =>
                              void submitReview(
                                r.company,
                                r.score,
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
                      <div className="row" style={{ gap: "0.25rem" }}>
                        <button
                          type="button"
                          className="btn small"
                          disabled={busy}
                          onClick={() =>
                            void submitReview(r.company, r.score, "agree")
                          }
                        >
                          ✓ Correct
                        </button>
                        <button
                          type="button"
                          className="btn secondary small"
                          disabled={busy}
                          onClick={() => {
                            setAdjustingId(r.company.id);
                            setAdjustScore(String(r.score));
                            setReason("");
                          }}
                        >
                          ~ Adjust
                        </button>
                        <button
                          type="button"
                          className="btn danger small"
                          disabled={busy}
                          onClick={() => {
                            setAdjustingId(r.company.id);
                            setAdjustScore("0");
                            setReason("");
                          }}
                        >
                          ✗ Wrong
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {/* Footer */}
      <footer className="search-footer">
        <p className="muted">
          Single Search reads existing investigations (including seed). It does
          not invent a new sector — create or fill that mission first, then
          search it. Every result links back to the full investigation trail.
        </p>
      </footer>
    </div>
  );
}