import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { v4 as uuid } from "uuid";
import {
  DEFAULT_SEARCH_PLAN_VERSION,
  HOME_MAINTENANCE_SECTOR,
  SOURCE_CATEGORIES,
  TRADE_IDS,
  countriesEquivalent,
  countClusterHits,
  defaultAudienceForCategory,
  defaultWeightForList,
  isLocalDirectoryMission,
  isMixedSourceCategory,
  packMatchesTrade,
  primaryTradeId,
  resolveSearchQuery,
  tradeLabel,
  type Mission,
  type SourceCategory,
  type SourceScope,
  type TradeId,
} from "@h3-trust/schema";
import {
  api,
  type CoveragePackRow,
  type SearchDemandAggregate,
} from "../api";
import { StatusChip } from "../components/Badges";
import { useAuth } from "../auth/AuthContext";
import { useCanInteract } from "../hooks/useCanInteract";
import { importCompanyRowsInChunks } from "../lib/importCompanyRows";
import { isNationalPack } from "../lib/packMatch";
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
  if (status === "needs_overlay") return "needs local list";
  return "empty";
}

function workerPath(id: string): string {
  return `/work/${id}/brief`;
}

function doorIdFromInput(raw: string): TradeId {
  const trimmed = raw.trim();
  if (!trimmed) return "paint";
  const resolved = resolveSearchQuery(trimmed);
  if (resolved.tradeId) return resolved.tradeId;
  return primaryTradeId(trimmed) ?? "paint";
}

function SourceWeighPrompt({ csv }: { csv: string }) {
  const sample = csv
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .slice(0, 6)
    .join("\n");
  const text = `I am importing this list into H3 Trust Harness. Here are sample CSV rows:

${sample || "(paste CSV first)"}

1. Sector purity: niche (100% one trade) or mixed (KvK / ondernemersvereniging / sportclub)?
2. Service context default: B2C/private, B2B/commercial, VvE/hoa, or unknown?
3. Trust weight (0–100): how exclusive? (Vakwerk+ ≈ 90, football-club sponsor ≈ 40)
4. Match keys: which columns for dedup? (KvK, email domain, website, name+postcode)`;

  return (
    <details className="worker-advanced">
      <summary>Source classification prompt (copy before import)</summary>
      <p className="hint">
        Paste into Qwen / Cursor. Then set mixed, weight, and audience above.
        CARA still reviews the source after import.
      </p>
      <textarea readOnly value={text} style={{ minHeight: "8rem" }} />
      <button
        type="button"
        className="btn secondary small"
        onClick={() => void navigator.clipboard.writeText(text)}
      >
        Copy prompt
      </button>
    </details>
  );
}

export function MissionControl() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { canInteract, isPending, needsLogin } = useCanInteract();
  const { isAdmin } = useAuth();
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
  const [peelingId, setPeelingId] = useState<string | null>(null);
  const [startingEngineId, setStartingEngineId] = useState<string | null>(null);

  const [form, setForm] = useState({
    location: "",
    country: "Netherlands",
    sector: HOME_MAINTENANCE_SECTOR,
    subsector: "paint",
    sourceName: "Vakwerk+ Garantie",
    sourceUrl: "https://www.vakwerkplusgarantie.nl",
    sourceLayer: "national" as SourceScope,
    sourceCategory: "quality_mark" as SourceCategory,
    listLabel: "Vakwerk+",
    csv: "",
    mixed: false,
    suggestedWeight: "75",
    defaultAudience: "private",
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
      subsector: subsector ? doorIdFromInput(subsector) : f.subsector,
      sourceLayer: location?.trim() ? "local" : "national",
      sourceCategory: location?.trim()
        ? "local_business_association"
        : "quality_mark",
      mixed: Boolean(location?.trim()),
      suggestedWeight: location?.trim() ? "65" : f.suggestedWeight,
    }));
  }, [searchParams]);

  function applyDemand(d: SearchDemandAggregate) {
    setForm((f) => ({
      ...f,
      location: d.location,
      country: d.country || f.country,
      subsector: doorIdFromInput(d.what),
      sourceLayer: "local",
      sourceCategory: "local_business_association",
      sourceName: `${d.location} local list`,
      listLabel: `${d.location} overlay`,
      mixed: true,
      suggestedWeight: "65",
      defaultAudience: "",
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
      const mixed = form.mixed || isMixedSourceCategory(form.sourceCategory);
      const setup = await api.onboardPack({
        country: form.country,
        sector: HOME_MAINTENANCE_SECTOR,
        subsector: doorIdFromInput(form.subsector),
        location: form.location.trim(),
        source: {
          name: form.sourceName,
          url: form.sourceUrl || undefined,
          layer: form.sourceLayer,
          category: form.sourceCategory,
        },
        listLabel: form.listLabel,
        rows: [],
        mixed,
        suggestedWeight: Number(form.suggestedWeight) || undefined,
        defaultAudience: form.defaultAudience || undefined,
      });
      const imported = rows.length
        ? await importCompanyRowsInChunks({
            missionId: setup.mission.id,
            sourceId: setup.source.id,
            listLabel: form.listLabel,
            rows,
            producer: "ImportedDataset",
            mixed,
            place: form.location.trim() || undefined,
            defaultAudience: form.defaultAudience || undefined,
            onProgress: (next, total) => {
              completed = next;
              setImportProgress({ completed: next, total });
            },
          })
        : { created: 0, updated: 0, skipped: 0 };
      const localHits = form.location.trim()
        ? countClusterHits(rows, form.location.trim())
        : 0;
      setDoneMsg(
        `${setup.createdMission ? "Created" : "Updated"} national pack · ${setup.source.name}` +
          (mixed
            ? ` · mixed: ${imported.updated} matched, ${imported.created} unknown in local directory`
            : ` · +${imported.created} companies (${imported.updated} merged)`) +
          (localHits ? ` · ${localHits} rows in ${form.location} cluster` : "") +
          `. Re-run is safe.`,
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
      const tradeId = doorIdFromInput(form.subsector);
      const existing = missions.filter(
        (m) =>
          isNationalPack(m) &&
          !isLocalDirectoryMission(m) &&
          countriesEquivalent(m.country, form.country) &&
          packMatchesTrade(m.subsector, tradeId),
      );
      const exact = existing.find(
        (m) =>
          m.subsector.trim().toLowerCase() === tradeId ||
          primaryTradeId(m.subsector) === tradeId,
      );
      const reuse = exact ?? existing[0];
      if (reuse) {
        await load();
        navigate(workerPath(reuse.id));
        return;
      }
      const now = new Date().toISOString();
      const location = form.country;
      const mission: Mission = {
        id: uuid(),
        location,
        country: form.country,
        sector: HOME_MAINTENANCE_SECTOR,
        subsector: tradeId,
        goal: `Find trustworthy ${tradeLabel(tradeId).toLowerCase()} in ${location} (${form.country}).`,
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

  async function onExportHhh() {
    try {
      setError(null);
      const result = await api.exportHhhLeads(form.country, form.subsector);
      setDoneMsg(
        `HHH high-trust export: ${result.count} unclaimed leads (≥2 lists, sector-confirmed) for ${form.country} · ${form.subsector}.`,
      );
      const blob = new Blob([JSON.stringify(result, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hhh-leads-${form.country}-${form.subsector}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    }
  }

  async function onPeelMixed(missionId: string, label: string) {
    if (
      !window.confirm(
        `Peel mixed-list-only members off “${label}”?\n\nOV / sportclub firms with no sector list (florist, baker) move to Local Directory as unknown.\nCompanies that also sit on Vakwerk+ / Echte Installateur stay (double listing).\nOVZH itself is not deleted.`,
      )
    ) {
      return;
    }
    setPeelingId(missionId);
    setError(null);
    setDoneMsg(null);
    try {
      const result = await api.peelMixedOnly(missionId);
      setDoneMsg(
        `Peeled ${result.peeled} mixed-only members off ${label} → Local Directory (${result.mixedSourceNames.join(", ") || "mixed lists"}). Kept ${result.keptDoubles} doubles. Then re-attach OVZH as Mixed from the form above so installers get the second badge.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Peel failed");
    } finally {
      setPeelingId(null);
    }
  }

  async function onStartEngine(missionId: string) {
    if (!isAdmin) return;
    setStartingEngineId(missionId);
    setError(null);
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
        <strong>Coverage desk.</strong> Always the 12 HHH trade doors for the
        selected country. Empty doors stay empty until you attach a list. Mixed
        OV/sportclub rows stack as unknown bijvangst. CARA reviews Human and
        OmegaClaw steps.
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
          Country × 12 HHH trade doors. Searchable means companies are already in
          the catalogue. Empty doors are real — attach a list instead of opening a
          town mission. Gevel is Can, not a door. VvE is a For tag.
        </p>
        <button
          type="button"
          className="btn secondary small"
          onClick={() => void onExportHhh()}
        >
          Download HHH high-trust leads (≥2 lists)
        </button>
        {packs.length === 0 ? (
          <div className="empty">
            No packs yet. Onboard a national list below (e.g. NL paint +
            Vakwerk+ CSV).
          </div>
        ) : (
          <div className="coverage-pack-list">
            {packs.map((pack) => (
              <article key={pack.key} className="coverage-pack-card">
                <div className="demand-card-main">
                  <h3>
                    {pack.country} · {pack.tradeId ?? pack.subsector}
                  </h3>
                  <p className="muted">
                    {pack.tradeLabel ? `${pack.tradeLabel} · ` : null}
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
        <h2>Attach local list to national pack</h2>
        <p className="hint">
          Country + sector is one national pack. Location is the source region
          (Hoofddorp), not a new town mission. Mixed lists (OV, sportclub) match
          existing trades and keep the rest as unknown bijvangst. CARA reviews
          the list weight.
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
              Location (source region, optional)
              <input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="Hoofddorp — attaches to national pack"
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
              Trade
              <select
                value={form.subsector}
                onChange={(e) =>
                  setForm({ ...form, subsector: e.target.value })
                }
                required
              >
                {TRADE_IDS.map((id) => (
                  <option key={id} value={id}>
                    {id} — {tradeLabel(id)}
                  </option>
                ))}
              </select>
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
                onChange={(e) => {
                  const sourceCategory = e.target.value as SourceCategory;
                  const mixed = isMixedSourceCategory(sourceCategory);
                  setForm({
                    ...form,
                    sourceCategory,
                    mixed,
                    suggestedWeight: String(
                      defaultWeightForList(sourceCategory, form.sourceLayer),
                    ),
                    defaultAudience:
                      defaultAudienceForCategory(sourceCategory) ?? "",
                  });
                }}
              >
                {SOURCE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="split-2">
            <label>
              Trust weight (0–100)
              <input
                type="number"
                min={0}
                max={100}
                value={form.suggestedWeight}
                onChange={(e) =>
                  setForm({ ...form, suggestedWeight: e.target.value })
                }
              />
            </label>
            <label>
              Default audience
              <select
                value={form.defaultAudience}
                onChange={(e) =>
                  setForm({ ...form, defaultAudience: e.target.value })
                }
              >
                <option value="">unknown (leave empty)</option>
                <option value="private">B2C / private</option>
                <option value="hoa">VvE / hoa</option>
                <option value="commercial">B2B / commercial</option>
                <option value="municipal">municipal</option>
              </select>
            </label>
          </div>
          <label className="row" style={{ gap: "0.5rem", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={form.mixed}
              onChange={(e) => setForm({ ...form, mixed: e.target.checked })}
            />
            Mixed list (OV / sportclub) — match all sector packs, keep unmatched as unknown
          </label>
          <SourceWeighPrompt csv={form.csv} />
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
                    ? `Attach list · ${previewCount} companies`
                    : "Attach source (no CSV yet)"}
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
                        label={`${stats?.trustedCount ?? 0} list${
                          (stats?.trustedCount ?? 0) === 1 ? "" : "s"
                        }`}
                      />
                      {stats?.nationalPack ? (
                        <StatusChip label="national pack" tone="active" />
                      ) : (
                        <StatusChip label="town job" tone="waiting" />
                      )}
                    </div>
                    {stats?.listNames && stats.listNames.length > 0 ? (
                      <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.85rem" }}>
                        Linked: {stats.listNames.join(" · ")}
                      </p>
                    ) : (
                      <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.85rem" }}>
                        No accepted lists linked to this job yet.
                      </p>
                    )}
                  </Link>
                  <div className="row" style={{ marginTop: "0.75rem" }}>
                    <Link className="btn small" to={workerPath(m.id)}>
                      Open job
                    </Link>
                    {isAdmin ? (
                      <>
                        <button
                          type="button"
                          className="btn small"
                          disabled={startingEngineId === m.id}
                          onClick={() => void onStartEngine(m.id)}
                        >
                          {startingEngineId === m.id
                            ? "Queuing…"
                            : "Start engine run"}
                        </button>
                        <Link
                          className="btn secondary small"
                          to={`/admin/engine?missionId=${m.id}`}
                        >
                          Engine
                        </Link>
                      </>
                    ) : null}
                    <Link
                      className="btn secondary small"
                      to={`/missions/${m.id}`}
                    >
                      Investigation
                    </Link>
                    {isLocalDirectoryMission(m) ? null : (
                      <button
                        type="button"
                        className="btn secondary small"
                        disabled={!canInteract || peelingId === m.id}
                        onClick={() =>
                          void onPeelMixed(m.id, `${m.location} · ${m.subsector}`)
                        }
                      >
                        {peelingId === m.id ? "Peeling…" : "Peel mixed-only"}
                      </button>
                    )}
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
                        Prefill attach list
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
