import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { v4 as uuid } from "uuid";
import {
  DEFAULT_SEARCH_PLAN_VERSION,
  SOURCE_CATEGORIES,
  type Mission,
  type SourceCategory,
  type SourceScope,
} from "@h3-trust/schema";
import {
  api,
  type CoveragePackRow,
  type SearchDemandAggregate,
} from "../api";
import { StatusChip } from "../components/Badges";
import { useCanInteract } from "../hooks/useCanInteract";
import { importCompanyRowsInChunks } from "../lib/importCompanyRows";
import { parseCompanyImport } from "../lib/parseCompanyImport";

const defaultPhases: Mission["phases"] = [
  { key: "observation", status: "active" },
  { key: "hypothesis", status: "waiting" },
  { key: "evidence", status: "waiting" },
  { key: "cara", status: "waiting" },
  { key: "patterns", status: "waiting" },
  { key: "companies", status: "waiting" },
  { key: "deep_check", status: "waiting" },
];

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

function packStatusLabel(status: CoveragePackRow["status"]): string {
  if (status === "searchable") return "searchable";
  if (status === "needs_overlay") return "needs overlay";
  return "empty";
}

function workerPath(id: string): string {
  return `/work/${id}/brief`;
}

export function MissionControl() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { canInteract, isPending, needsLogin } = useCanInteract();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [packs, setPacks] = useState<CoveragePackRow[]>([]);
  const [demands, setDemands] = useState<SearchDemandAggregate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  const [form, setForm] = useState({
    location: "",
    country: "Netherlands",
    sector: "Home Maintenance",
    subsector: "Painters",
    sourceName: "Vakwerk+ Garantie",
    sourceUrl: "https://www.vakwerkplusgarantie.nl",
    sourceLayer: "national" as SourceScope,
    sourceCategory: "quality_mark" as SourceCategory,
    listLabel: "Vakwerk+",
    csv: "",
  });
  const previewCount = useMemo(
    () => parseCompanyImport(form.csv).length,
    [form.csv],
  );

  async function load() {
    try {
      setError(null);
      const [missionList, demandFeed, desk] = await Promise.all([
        api.listMissions(),
        api.listSearchDemands(300),
        api.getCoverageDesk(),
      ]);
      setMissions(missionList);
      setDemands(demandFeed.aggregates);
      setPacks(desk.packs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load coverage");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const location = searchParams.get("location");
    const country = searchParams.get("country");
    const subsector = searchParams.get("subsector") || searchParams.get("what");
    if (!location && !subsector && !country) return;
    setForm((f) => ({
      ...f,
      location: location?.trim() || f.location,
      country: country?.trim() || f.country,
      subsector: subsector?.trim() || f.subsector,
      sourceLayer: location?.trim() ? "local" : "national",
      sourceCategory: location?.trim()
        ? "local_business_association"
        : "quality_mark",
    }));
  }, [searchParams]);

  function applyDemand(d: SearchDemandAggregate) {
    setForm((f) => ({
      ...f,
      location: d.location,
      country: d.country || f.country,
      subsector: d.what,
      sourceLayer: "local",
      sourceCategory: "local_business_association",
      sourceName: `${d.location} local list`,
      listLabel: `${d.location} overlay`,
    }));
    document.getElementById("onboard-pack-form")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  async function onFile(file: File | null) {
    if (!file) return;
    const text = await file.text();
    setForm((f) => ({ ...f, csv: text }));
  }

  async function onOnboard(e: FormEvent) {
    e.preventDefault();
    if (!canInteract) {
      setError(
        needsLogin
          ? "Sign in as an approved CURAD volunteer to onboard packs."
          : isPending
            ? "Awaiting admin approval — you cannot onboard yet."
            : "You cannot onboard packs with this account.",
      );
      return;
    }
    setOnboarding(true);
    setError(null);
    setDoneMsg(null);
    const rows = parseCompanyImport(form.csv);
    setImportProgress(
      rows.length ? { completed: 0, total: rows.length } : null,
    );
    let completed = 0;
    try {
      const setup = await api.onboardPack({
        country: form.country,
        sector: form.sector,
        subsector: form.subsector,
        location: form.location.trim() || form.country,
        source: {
          name: form.sourceName,
          url: form.sourceUrl || undefined,
          layer: form.sourceLayer,
          category: form.sourceCategory,
        },
        listLabel: form.listLabel,
        rows: [],
      });
      const imported = rows.length
        ? await importCompanyRowsInChunks({
            missionId: setup.mission.id,
            sourceId: setup.source.id,
            listLabel: form.listLabel,
            rows,
            producer: "ImportedDataset",
            onProgress: (next, total) => {
              completed = next;
              setImportProgress({ completed: next, total });
            },
          })
        : { created: 0, updated: 0, skipped: 0 };
      setDoneMsg(
        `${setup.createdMission ? "Created" : "Updated"} ${setup.nationalPack ? "national pack" : "overlay"} · ${setup.source.name} · +${imported.created} companies (${imported.updated} merged). Re-running the same file is safe.`,
      );
      setForm((f) => ({ ...f, csv: "" }));
      setImportProgress(null);
      await load();
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Onboard failed";
      setError(
        rows.length
          ? `Import stopped after ${completed}/${rows.length} rows. Keep this tab and click Resume — names already in merge, they are not duplicated. ${detail}`
          : detail,
      );
    } finally {
      setOnboarding(false);
    }
  }

  async function onCreateEmptyJob() {
    if (!canInteract) return;
    setSaving(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const location = form.location.trim() || form.country;
      const mission: Mission = {
        id: uuid(),
        location,
        country: form.country,
        sector: form.sector,
        subsector: form.subsector,
        goal: `Find trustworthy ${form.subsector.toLowerCase()} in ${location} (${form.country}).`,
        search_plan_version: DEFAULT_SEARCH_PLAN_VERSION,
        discoveryBrief: {
          approach: "Base layer first, then overlay, then CARA.",
          candidateListTypes: [form.sourceCategory],
          successCriteria: "Companies searchable; Align optional.",
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
      await load();
      navigate(workerPath(mission.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create job");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(missionId: string, label: string) {
    if (
      !window.confirm(
        `Delete mission “${label}” and all its journal, observations, sources, companies, reviews?\nThis cannot be undone.`,
      )
    ) {
      return;
    }
    try {
      setError(null);
      await api.deleteMission(missionId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete mission");
    }
  }

  const demandList = [...demands].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return b.lastAt.localeCompare(a.lastAt);
  });

  const coverageById = useMemo(() => {
    const map = new Map<
      string,
      CoveragePackRow["missions"][number]
    >();
    for (const pack of packs) {
      for (const m of pack.missions) map.set(m.id, m);
    }
    return map;
  }, [packs]);

  const sortedMissions = [...missions].sort((a, b) => {
    const ac = coverageById.get(a.id)?.companyCount ?? 0;
    const bc = coverageById.get(b.id)?.companyCount ?? 0;
    if (bc !== ac) return bc - ac;
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  return (
    <div>
      <p className="thesis">
        <strong>Coverage desk.</strong> National sector packs feed Single
        Search. Local lists are overlays. CARA locks weights later — it is not
        the onboarding brake.
      </p>

      {error ? <div className="error">{error}</div> : null}
      {doneMsg ? (
        <div className="thesis" style={{ borderColor: "var(--teal)" }}>
          {doneMsg}
        </div>
      ) : null}

      <section className="panel" aria-labelledby="coverage-heading">
        <h2 id="coverage-heading">Coverage</h2>
        <p className="hint">
          Country × sector packs. Searchable means companies are already in the
          catalogue — overlay is optional local evidence.
        </p>
        {packs.length === 0 ? (
          <div className="empty">
            No packs yet. Onboard a national list below (e.g. NL Painters +
            Vakwerk+ CSV).
          </div>
        ) : (
          <div className="coverage-pack-list">
            {packs.map((pack) => (
              <article key={pack.key} className="coverage-pack-card">
                <div className="demand-card-main">
                  <h3>
                    {pack.country} · {pack.subsector}
                  </h3>
                  <p className="muted">
                    {pack.companyCount} companies · {pack.missionCount} job
                    {pack.missionCount === 1 ? "" : "s"} ·{" "}
                    {pack.nationalSourceCount} national / {pack.localSourceCount}{" "}
                    local lists
                  </p>
                </div>
                <StatusChip
                  label={packStatusLabel(pack.status)}
                  tone={
                    pack.status === "searchable"
                      ? "done"
                      : pack.status === "needs_overlay"
                        ? "active"
                        : "waiting"
                  }
                />
                <div className="row" style={{ marginTop: "0.65rem", flexWrap: "wrap" }}>
                  {pack.missions.map((m) => (
                    <Link
                      key={m.id}
                      className="btn secondary small"
                      to={workerPath(m.id)}
                    >
                      {m.nationalPack ? "National" : m.location} · {m.companyCount}
                    </Link>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section
        className="panel"
        id="onboard-pack-form"
        style={{ marginTop: "1.25rem" }}
      >
        <h2>Onboard pack</h2>
        <p className="hint">
          Add a country + sector list in one sitting. Leave location empty (or
          equal to country) for the national base layer. Fill location for a
          local overlay. The source is accepted as an imported dataset — Align
          later.
        </p>
        <form className="form-stack" onSubmit={(e) => void onOnboard(e)}>
          <div className="split-2">
            <label>
              Country
              <input
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                required
              />
            </label>
            <label>
              Location (optional overlay)
              <input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="Empty = national pack"
              />
            </label>
          </div>
          <div className="split-2">
            <label>
              Sector
              <input
                value={form.sector}
                onChange={(e) => setForm({ ...form, sector: e.target.value })}
                required
              />
            </label>
            <label>
              Subsector
              <input
                value={form.subsector}
                onChange={(e) => setForm({ ...form, subsector: e.target.value })}
                required
              />
            </label>
          </div>
          <div className="split-2">
            <label>
              Source name
              <input
                value={form.sourceName}
                onChange={(e) =>
                  setForm({ ...form, sourceName: e.target.value })
                }
                required
              />
            </label>
            <label>
              Source URL
              <input
                value={form.sourceUrl}
                onChange={(e) =>
                  setForm({ ...form, sourceUrl: e.target.value })
                }
                placeholder="https://…"
              />
            </label>
          </div>
          <div className="split-2">
            <label>
              Layer
              <select
                value={form.sourceLayer}
                onChange={(e) =>
                  setForm({
                    ...form,
                    sourceLayer: e.target.value as SourceScope,
                  })
                }
              >
                <option value="national">national</option>
                <option value="regional">regional</option>
                <option value="local">local</option>
              </select>
            </label>
            <label>
              Category
              <select
                value={form.sourceCategory}
                onChange={(e) =>
                  setForm({
                    ...form,
                    sourceCategory: e.target.value as SourceCategory,
                  })
                }
              >
                {SOURCE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            List membership label
            <input
              value={form.listLabel}
              onChange={(e) => setForm({ ...form, listLabel: e.target.value })}
              required
            />
          </label>
          <label>
            Paste list / CSV
            <textarea
              value={form.csv}
              onChange={(e) => setForm({ ...form, csv: e.target.value })}
              placeholder='title,address,postal_code,city,website,services,tel,mailto'
              style={{ minHeight: "7rem" }}
            />
          </label>
          <label>
            Or upload .csv / .txt
            <input
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
            />
          </label>
            <p className="muted">
              Preview: {previewCount} companies
              {previewCount > 40
                ? " · large lists import in batches of 20. Keep this tab open. Re-run is safe."
                : ""}
            </p>
            {importProgress ? (
              <div className="worker-result-confidence" style={{ margin: "0.35rem 0 0.75rem" }}>
                <span className="muted" style={{ fontSize: "0.78rem" }}>
                  Importing {importProgress.completed}/{importProgress.total}
                </span>
                <div
                  className="worker-result-confidence-bar"
                  role="progressbar"
                  aria-valuenow={importProgress.completed}
                  aria-valuemin={0}
                  aria-valuemax={importProgress.total}
                  aria-label={`Importing ${importProgress.completed} of ${importProgress.total}`}
                >
                  <div
                    className="worker-result-confidence-fill"
                    style={{
                      width: `${
                        importProgress.total
                          ? Math.round(
                              (importProgress.completed / importProgress.total) *
                                100,
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            ) : null}
          <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              className="btn"
              type="submit"
              disabled={onboarding || !canInteract}
            >
              {onboarding
                ? importProgress
                  ? `Importing ${importProgress.completed}/${importProgress.total}…`
                  : "Starting pack…"
                : !canInteract
                  ? "Approved CURAD only"
                  : importProgress && importProgress.completed < importProgress.total
                    ? `Resume · ${importProgress.completed}/${importProgress.total} already in`
                  : previewCount
                    ? `Onboard pack · ${previewCount} companies`
                    : "Onboard source (no CSV yet)"}
            </button>
            <button
              className="btn secondary"
              type="button"
              disabled={saving || onboarding || !canInteract}
              onClick={() => void onCreateEmptyJob()}
            >
              {saving ? "Creating…" : "Empty job only"}
            </button>
          </div>
        </form>
      </section>

      <div className="grid-missions" style={{ marginTop: "1.25rem" }}>
        <section className="panel">
          <h2>Jobs</h2>
          <p className="hint">
            Production state — companies and trusted lists — not investigation
            phases. Opens Data Worker.
          </p>
          {sortedMissions.length === 0 ? (
            <div className="empty">No jobs yet. Onboard a pack above.</div>
          ) : (
            sortedMissions.map((m) => {
              const stats = coverageById.get(m.id);
              return (
                <div
                  key={m.id}
                  className="mission-card"
                  style={{ position: "relative" }}
                >
                  <Link to={workerPath(m.id)} style={{ display: "block" }}>
                    <h3>
                      {m.location} · {m.subsector}
                    </h3>
                    <p className="muted">{m.goal}</p>
                    <div className="mission-meta">
                      <StatusChip label={m.country} />
                      <StatusChip
                        label={`${stats?.companyCount ?? 0} companies`}
                        tone={
                          (stats?.companyCount ?? 0) > 0 ? "done" : "waiting"
                        }
                      />
                      <StatusChip
                        label={`${stats?.trustedCount ?? 0} lists`}
                      />
                      {stats?.nationalPack ? (
                        <StatusChip label="national pack" tone="active" />
                      ) : null}
                    </div>
                  </Link>
                  <div className="row" style={{ marginTop: "0.75rem" }}>
                    <Link className="btn small" to={workerPath(m.id)}>
                      Open job
                    </Link>
                    <Link
                      className="btn secondary small"
                      to={`/missions/${m.id}`}
                    >
                      Investigation
                    </Link>
                    <button
                      type="button"
                      className="btn danger small"
                      onClick={() =>
                        void onDelete(m.id, `${m.location} · ${m.subsector}`)
                      }
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </section>

        <section className="panel demand-panel" aria-labelledby="demand-heading">
          <h2 id="demand-heading">Unmet search demand</h2>
          <p className="hint">
            Priority queue for local overlay — searches no longer spawn a
            mission per town.
          </p>
          {demandList.length === 0 ? (
            <div className="empty">
              No search demand yet. Worldwide searches appear here when a place
              still needs a local list.
            </div>
          ) : (
            <div className="demand-list">
              {demandList.slice(0, 40).map((d) => {
                const misses =
                  (d.outcomes.no_match ?? 0) +
                  (d.outcomes.empty_companies ?? 0) +
                  (d.outcomes.quota_blocked ?? 0);
                const hits = d.outcomes.hit ?? 0;
                return (
                  <article key={d.key} className="demand-card">
                    <div className="demand-card-main">
                      <h3>
                        {d.location}
                        {d.country ? `, ${d.country}` : ""} · {d.what}
                      </h3>
                      <p className="muted">
                        {d.count}× asked · last {formatWhen(d.lastAt)}
                        {misses ? ` · ${misses} unmet/blocked` : ""}
                        {hits ? ` · ${hits} catalogue hits` : ""}
                      </p>
                    </div>
                    <div className="row demand-card-actions">
                      {d.matchedMissionId ? (
                        <Link
                          className="btn secondary small"
                          to={workerPath(d.matchedMissionId)}
                        >
                          Open job
                        </Link>
                      ) : null}
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => applyDemand(d)}
                      >
                        Prefill overlay
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
