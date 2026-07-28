import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { v4 as uuid } from "uuid";
import {
  computeListCoverage,
  computeMissionCoverage,
  computeResultCoverage,
  explainResultCoverage,
  DEFAULT_SEARCH_PLAN_VERSION,
  type Company,
  type Mission,
  type Review,
  type ServiceContext,
  type Source,
} from "@h3-trust/schema";
import { api } from "../api";
import { listReviews } from "../api-extra";
import { useAuth } from "../auth/AuthContext";
import { useCanInteract } from "../hooks/useCanInteract";
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
  /** Phase 8 — mission × list × kvk confidence (0..100). */
  coverageConfidence: number;
  coverageWhy: string;
}

/* ── Page ── */

export function SingleSearchPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { canInteract, needsLogin, isPending } = useCanInteract();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [location, setLocation] = useState("");
  const [locationReady, setLocationReady] = useState(false);
  const [geoHint, setGeoHint] = useState<string | null>(null);
  const [what, setWhat] = useState("");
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedHint, setParsedHint] = useState<ParsedQuery | null>(null);
  const [noMatchReason, setNoMatchReason] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [searchUnlimited, setSearchUnlimited] = useState(false);

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
    void api
      .searchSession()
      .then((s) => {
        setRemaining(s.remaining);
        setSearchUnlimited(Boolean(s.unlimited));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (profile?.preferred_location) {
      setLocation(profile.preferred_location);
      setLocationReady(true);
      return;
    }
    if (!navigator.geolocation) {
      setGeoHint("Share your municipality below (geolocation unavailable).");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => {
        setGeoHint(
          "We detected a device location — confirm or edit your municipality below (we store a place name, not GPS).",
        );
      },
      () => {
        setGeoHint("Location access denied — type your municipality.");
      },
      { timeout: 8000 },
    );
  }, [profile?.preferred_location]);

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
    const loc = location.trim();
    const sectorPart = what.trim() || query.trim();
    if (!loc) {
      setError("Confirm where you are searching first (municipality / place).");
      return;
    }
    if (!sectorPart) {
      setError("Say what you need (e.g. painters, plumbers).");
      return;
    }
    if (!locationReady) {
      setError("Confirm your location before searching.");
      return;
    }

    const composed = sectorPart.toLowerCase().includes(loc.toLowerCase())
      ? sectorPart
      : `${sectorPart} in ${loc}`;
    setQuery(composed);

    setLoading(true);
    setError(null);
    setSearched(true);
    setMatchedMission(null);
    setRanked([]);
    setTrustedCount(0);
    setParsedHint(null);
    setNoMatchReason(null);

    try {
      const quota = await api.consumeSearch();
      setRemaining(quota.remaining);
      setSearchUnlimited(Boolean(quota.unlimited));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Search limit reached";
      setError(msg);
      setLoading(false);
      return;
    }

    try {
      const parsed = parseQuery(composed, missions);
      if (!parsed.location) parsed.location = loc;
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

      let planEntries: { layer: "national" | "regional" | "local"; category: string }[] =
        [];
      try {
        const plan = await api.getSearchPlan(
          best.mission.search_plan_version || DEFAULT_SEARCH_PLAN_VERSION,
        );
        planEntries = plan.entries;
      } catch {
        /* coverage still works with empty plan */
      }
      const missionCov = computeMissionCoverage({
        sources: best.sources,
        companies: best.companies,
        planEntries,
      });

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
          const coverageConfidence = computeResultCoverage(c, missionCov);
          return {
            company: c,
            score: cov.score,
            onCount: cov.onCount,
            totalCount: cov.totalCount,
            lists: cov.lists.map((s) => ({ id: s.id, name: s.name })),
            humanReview: human,
            displayScore,
            coverageConfidence,
            coverageWhy: explainResultCoverage(c, missionCov),
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
    if (!canInteract) {
      setError(
        needsLogin
          ? "Sign in as an approved CURAD volunteer to start an investigation."
          : isPending
            ? "Awaiting admin approval — you cannot start investigations yet."
            : "You cannot start investigations with this account.",
      );
      return;
    }
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
    if (!canInteract) {
      setError(
        isPending
          ? "Awaiting admin approval — CARA writes stay locked."
          : "Sign in as an approved CURAD volunteer to record a CARA review.",
      );
      return;
    }
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
        <h1>Single Search</h1>
        <p className="thesis">
          Confirm where you are, say what you need. Evidence-based, not
          popularity-based. Every score has a reason.
        </p>
        {!searchUnlimited && remaining != null ? (
          <p className="muted">
            Test phase: {remaining} search{remaining === 1 ? "" : "es"} left this
            session.
          </p>
        ) : null}
      </div>

      <div className="search-where stack">
        <label>
          Where are you searching?
          <input
            type="text"
            value={location}
            onChange={(e) => {
              setLocation(e.target.value);
              setLocationReady(false);
            }}
            placeholder="Municipality / place (e.g. Haarlemmermeer)"
          />
        </label>
        {geoHint ? <p className="muted">{geoHint}</p> : null}
        <button
          type="button"
          className="btn secondary small"
          disabled={!location.trim()}
          onClick={() => setLocationReady(true)}
        >
          {locationReady ? "Location confirmed" : "Confirm location"}
        </button>
      </div>

      {/* Search bar */}
      <form className="search-bar" onSubmit={onSearch}>
        <input
          type="text"
          value={what}
          onChange={(e) => setWhat(e.target.value)}
          placeholder='What do you need? e.g. "painters" or "loodgieters"'
          disabled={!locationReady}
          autoFocus
        />
        <button
          type="submit"
          className="btn"
          disabled={loading || !locationReady}
        >
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
              onClick={() => {
                const m = missions.find((x) =>
                  q.toLowerCase().includes(x.location.toLowerCase()),
                );
                if (m) {
                  setLocation(m.location);
                  setLocationReady(true);
                }
                setWhat(
                  q
                    .replace(/\s+in\s+.+$/i, "")
                    .trim(),
                );
              }}
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
                disabled={creating || !canInteract}
                onClick={() => void startInvestigationFromQuery()}
                title={
                  !canInteract
                    ? "Approved CURAD volunteers only"
                    : undefined
                }
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

                  <div
                    className="worker-result-confidence"
                    title={r.coverageWhy}
                    style={{ margin: "0.4rem 0" }}
                  >
                    <span className="muted" style={{ fontSize: "0.78rem" }}>
                      coverageConfidence {r.coverageConfidence}
                    </span>
                    <div
                      className="worker-result-confidence-bar"
                      role="meter"
                      aria-valuenow={r.coverageConfidence}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={r.coverageWhy}
                    >
                      <div
                        className="worker-result-confidence-fill"
                        style={{ width: `${r.coverageConfidence}%` }}
                      />
                    </div>
                  </div>

                  {/* Can / For / Notable + profile snippet */}
                  <CompanyProfileTags company={r.company} />

                  {/* Why */}
                  <details className="search-why">
                    <summary>
                      Why {r.displayScore}/100? · {r.onCount}/
                      {r.totalCount} trusted lists · conf{" "}
                      {r.coverageConfidence}
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
                          disabled={busy || !canInteract}
                          onClick={() =>
                            void submitReview(r.company, r.score, "agree")
                          }
                        >
                          ✓ Correct
                        </button>
                        <button
                          type="button"
                          className="btn secondary small"
                          disabled={busy || !canInteract}
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
                          disabled={busy || !canInteract}
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