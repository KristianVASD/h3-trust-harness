import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
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
import { api } from "../../api";
import { useCanInteract } from "../../hooks/useCanInteract";
import { importCompanyRowsInChunks } from "../../lib/importCompanyRows";
import { isNationalPack } from "../../lib/packMatch";
import { parseCompanyImport } from "../../lib/parseCompanyImport";
import { LlmGuider } from "./LlmGuider";

const defaultPhases: Mission["phases"] = [
  { key: "observation", status: "active" },
  { key: "hypothesis", status: "waiting" },
  { key: "evidence", status: "waiting" },
  { key: "cara", status: "waiting" },
  { key: "patterns", status: "waiting" },
  { key: "companies", status: "waiting" },
  { key: "deep_check", status: "waiting" },
];

function doorIdFromInput(raw: string): TradeId {
  const trimmed = raw.trim();
  if (!trimmed) return "paint";
  const resolved = resolveSearchQuery(trimmed);
  if (resolved.tradeId) return resolved.tradeId;
  return primaryTradeId(trimmed) ?? "paint";
}

function workerPath(id: string): string {
  return `/work/${id}/brief`;
}

export type AttachPrefill = {
  country?: string;
  location?: string;
  subsector?: string;
  sourceLayer?: SourceScope;
  sourceCategory?: SourceCategory;
  mixed?: boolean;
  suggestedWeight?: string;
  sourceName?: string;
  listLabel?: string;
};

export function AttachListForm({
  country,
  tradeId,
  prefill,
  onDone,
}: {
  country: string;
  tradeId: string;
  prefill?: AttachPrefill;
  onDone?: () => void;
}) {
  const navigate = useNavigate();
  const { canInteract, isPending, needsLogin } = useCanInteract();
  const [error, setError] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  const [form, setForm] = useState({
    location: prefill?.location ?? "",
    country,
    sector: HOME_MAINTENANCE_SECTOR,
    subsector: tradeId,
    sourceName: prefill?.sourceName ?? "Vakwerk+ Garantie",
    sourceUrl: "",
    sourceLayer: (prefill?.sourceLayer ?? "national") as SourceScope,
    sourceCategory: (prefill?.sourceCategory ?? "quality_mark") as SourceCategory,
    listLabel: prefill?.listLabel ?? "Vakwerk+",
    csv: "",
    mixed: prefill?.mixed ?? false,
    suggestedWeight: prefill?.suggestedWeight ?? "75",
    defaultAudience: "private",
  });

  useEffect(() => {
    setForm((f) => ({
      ...f,
      country,
      subsector: tradeId,
      ...(prefill?.location != null ? { location: prefill.location } : {}),
      ...(prefill?.sourceLayer ? { sourceLayer: prefill.sourceLayer } : {}),
      ...(prefill?.sourceCategory
        ? { sourceCategory: prefill.sourceCategory }
        : {}),
      ...(prefill?.mixed != null ? { mixed: prefill.mixed } : {}),
      ...(prefill?.suggestedWeight
        ? { suggestedWeight: prefill.suggestedWeight }
        : {}),
      ...(prefill?.sourceName ? { sourceName: prefill.sourceName } : {}),
      ...(prefill?.listLabel ? { listLabel: prefill.listLabel } : {}),
    }));
  }, [country, tradeId, prefill]);

  const previewCount = useMemo(
    () => parseCompanyImport(form.csv).length,
    [form.csv],
  );

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
    setImportProgress(rows.length ? { completed: 0, total: rows.length } : null);
    let completed = 0;
    try {
      const mixed = form.mixed || isMixedSourceCategory(form.sourceCategory);
      const place = (form.location ?? "").trim();
      const listLabel = (form.listLabel ?? "").trim() || form.sourceName;
      const setup = await api.onboardPack({
        country: form.country,
        sector: HOME_MAINTENANCE_SECTOR,
        subsector: doorIdFromInput(form.subsector),
        location: place,
        source: {
          name: form.sourceName,
          url: form.sourceUrl || undefined,
          layer: form.sourceLayer,
          category: form.sourceCategory,
        },
        listLabel,
        rows: [],
        mixed,
        suggestedWeight: Number(form.suggestedWeight) || undefined,
        defaultAudience: form.defaultAudience || undefined,
      });
      const imported = rows.length
        ? await importCompanyRowsInChunks({
            missionId: setup.mission.id,
            sourceId: setup.source.id,
            listLabel,
            rows,
            producer: "ImportedDataset",
            mixed,
            place: place || undefined,
            defaultAudience: form.defaultAudience || undefined,
            onProgress: (next, total) => {
              completed = next;
              setImportProgress({ completed: next, total });
            },
          })
        : { created: 0, updated: 0, skipped: 0 };
      const localHits = place ? countClusterHits(rows, place) : 0;
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
      onDone?.();
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
      const nextTrade = doorIdFromInput(form.subsector);
      const missions = await api.listMissions();
      const existing = missions.filter(
        (m) =>
          isNationalPack(m) &&
          !isLocalDirectoryMission(m) &&
          countriesEquivalent(m.country, form.country) &&
          packMatchesTrade(m.subsector, nextTrade),
      );
      const exact = existing.find(
        (m) =>
          m.subsector.trim().toLowerCase() === nextTrade ||
          primaryTradeId(m.subsector) === nextTrade,
      );
      const reuse = exact ?? existing[0];
      if (reuse) {
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
        subsector: nextTrade,
        goal: `Find trustworthy ${tradeLabel(nextTrade).toLowerCase()} in ${location} (${form.country}).`,
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
      navigate(workerPath(mission.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create job");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel" id="attach">
      <h2>Attach list to this pack</h2>
      <p className="hint">
        Country + sector is one national pack. Location is the source region,
        not a new town mission. Mixed lists match existing trades and keep the
        rest as unknown bijvangst.
      </p>
      {error ? <div className="error">{error}</div> : null}
      {doneMsg ? (
        <div className="thesis" style={{ borderColor: "var(--teal)" }}>
          {doneMsg}
        </div>
      ) : null}
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
        <label>
          Trade
          <select
            value={form.subsector}
            onChange={(e) => setForm({ ...form, subsector: e.target.value })}
            required
          >
            {TRADE_IDS.map((id) => (
              <option key={id} value={id}>
                {id} — {tradeLabel(id)}
              </option>
            ))}
          </select>
        </label>
        <div className="split-2">
          <label>
            Source name
            <input
              value={form.sourceName}
              onChange={(e) => setForm({ ...form, sourceName: e.target.value })}
              required
            />
          </label>
          <label>
            Source URL
            <input
              value={form.sourceUrl}
              onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })}
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
          Mixed list (OV / sportclub) — match all sector packs, keep unmatched as
          unknown
        </label>
        <LlmGuider csv={form.csv} />
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
            placeholder="title,address,postal_code,city,website,services,tel,mailto"
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
            >
              <div
                className="worker-result-confidence-fill"
                style={{
                  width: `${
                    importProgress.total
                      ? Math.round(
                          (importProgress.completed / importProgress.total) * 100,
                        )
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>
        ) : null}
        <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
          <button className="btn" type="submit" disabled={onboarding || !canInteract}>
            {onboarding
              ? importProgress
                ? `Importing ${importProgress.completed}/${importProgress.total}…`
                : "Starting pack…"
              : !canInteract
                ? "Approved CURAD only"
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
  );
}
