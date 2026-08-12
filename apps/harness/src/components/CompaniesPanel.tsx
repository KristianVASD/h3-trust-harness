import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { v4 as uuid } from "uuid";
import {
  SOURCE_CATEGORIES,
  computeListCoverage,
  type Company,
  type CompanyStatus,
  type KvkGate,
  type Signal,
  type Source,
  type SourceCategory,
} from "@h3-trust/schema";
import { api } from "../api";
import { listSignals } from "../api-extra";
import { parseCompanyImport } from "../lib/parseCompanyImport";
import { ProducerBadge, StatusChip } from "./Badges";
import { CompanyProfileTags } from "./CompanyProfileTags";

type StatusFilter = "all" | CompanyStatus;

export function CompaniesPanel({
  missionId,
  companies,
  sources,
  signals,
  onChanged,
}: {
  missionId: string;
  companies: Company[];
  sources: Source[];
  signals: Signal[];
  onChanged: () => Promise<void>;
}) {
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(
    companies[0]?.id ?? null,
  );
  const [blacklistDraft, setBlacklistDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const base =
      filter === "all"
        ? companies
        : companies.filter((c) => c.status === filter);
    return [...base].sort((a, b) => {
      const ca = computeListCoverage(a, sources).score;
      const cb = computeListCoverage(b, sources).score;
      return cb - ca;
    });
  }, [companies, filter, sources]);

  const selected =
    companies.find((c) => c.id === selectedId) ?? filtered[0] ?? null;

  const coverage = useMemo(
    () => (selected ? computeListCoverage(selected, sources) : null),
    [selected, sources],
  );

  const linkedSources = useMemo(() => {
    if (!selected) return [];
    return sources.filter((s) => selected.source_ids.includes(s.id));
  }, [selected, sources]);

  const linkedSignals = useMemo(() => {
    if (!selected) return [];
    const ids = new Set(selected.source_ids);
    return signals.filter((s) => s.sourceId && ids.has(s.sourceId));
  }, [selected, signals]);

  async function setStatus(company: Company, status: CompanyStatus) {
    await api.updateEntity("companies", {
      ...company,
      status,
      updatedAt: new Date().toISOString(),
    });
    await onChanged();
  }

  async function setKvkGate(company: Company, kvk_gate: KvkGate) {
    await api.updateEntity("companies", {
      ...company,
      kvk_gate,
      updatedAt: new Date().toISOString(),
    });
    await onChanged();
  }

  async function saveBlacklist(company: Company) {
    const flags = blacklistDraft
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean);
    await api.updateEntity("companies", {
      ...company,
      blacklist_flags: flags,
      updatedAt: new Date().toISOString(),
    });
    await onChanged();
  }

  return (
    <div className="workspace-layout">
      <section>
        <div className="row" style={{ marginBottom: "0.75rem" }}>
          {(["all", "candidate", "target", "staged"] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`btn secondary small${filter === f ? " active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="list">
          {filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              className="item"
              style={{
                width: "100%",
                textAlign: "left",
                cursor: "pointer",
                borderColor: selected?.id === c.id ? "var(--teal)" : undefined,
              }}
              onClick={() => {
                setSelectedId(c.id);
                setBlacklistDraft(c.blacklist_flags.join(", "));
              }}
            >
              <header>
                <h4>{c.name}</h4>
                <StatusChip label={c.status} tone="active" />
              </header>
              <p className="muted">
                coverage{" "}
                {(() => {
                  const cov = computeListCoverage(c, sources);
                  return `${cov.onCount}/${cov.totalCount} · ${cov.score}%`;
                })()}
                {" · "}
                kvk_gate · {c.kvk_gate}
                {c.kvk_number ? ` · ${c.kvk_number}` : ""}
              </p>
            </button>
          ))}
          {!filtered.length ? (
            <div className="empty">No companies for this filter.</div>
          ) : null}
        </div>
      </section>

      <section>
        {!selected ? (
          <div className="empty">Select a company.</div>
        ) : (
          <div className="item">
            <header>
              <h4>{selected.name}</h4>
              <ProducerBadge producer={selected.producer} />
            </header>
            <p className="muted">
              {[selected.address, selected.region, selected.sector]
                .filter(Boolean)
                .join(" · ") || "No address / region / sector"}
            </p>
            {selected.category ? (
              <p className="company-category-label" style={{ marginTop: 0 }}>
                category · {selected.category}
              </p>
            ) : null}
            <div className="mission-meta" style={{ margin: "0.5rem 0" }}>
              <StatusChip label={`status ${selected.status}`} />
              <StatusChip label={`kvk_gate ${selected.kvk_gate}`} />
              {selected.kvk_number ? (
                <StatusChip label={`KvK ${selected.kvk_number}`} />
              ) : null}
            </div>

            <CompanyProfileTags company={selected} />

            <h4 style={{ marginBottom: "0.35rem" }}>Weighted list coverage</h4>
            {coverage ? (
              <>
                <p style={{ marginTop: 0 }}>
                  <strong>
                    {coverage.onCount} of {coverage.totalCount}
                  </strong>{" "}
                  trusted lists · weight{" "}
                  <strong>
                    {coverage.coveredWeight}/{coverage.totalWeight}
                  </strong>{" "}
                  ({coverage.score}%)
                </p>
                <p className="hint">{coverage.explanation}</p>
                <p className="muted">
                  Same list-count can rank differently when list weights differ.
                </p>
              </>
            ) : null}

            <h4 style={{ marginBottom: "0.35rem" }}>List membership labels</h4>
            <p>
              {selected.list_membership.length
                ? selected.list_membership.join(", ")
                : "—"}
            </p>

            <h4 style={{ marginBottom: "0.35rem" }}>Blacklist flags</h4>
            <p>
              {selected.blacklist_flags.length
                ? selected.blacklist_flags.join(", ")
                : "None"}
            </p>
            <div className="form-stack" style={{ marginTop: "0.5rem" }}>
              <label>
                Edit flags (comma-separated)
                <input
                  value={blacklistDraft}
                  onChange={(e) => setBlacklistDraft(e.target.value)}
                  onFocus={() =>
                    setBlacklistDraft(selected.blacklist_flags.join(", "))
                  }
                />
              </label>
              <button
                className="btn secondary small"
                type="button"
                onClick={() => void saveBlacklist(selected)}
              >
                Save blacklist
              </button>
            </div>

            <h4 style={{ margin: "1rem 0 0.35rem" }}>KvK gate (hard)</h4>
            <div className="item-actions">
              {(["unchecked", "pass", "fail"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  className="btn secondary small"
                  disabled={selected.kvk_gate === g}
                  onClick={() => void setKvkGate(selected, g)}
                >
                  {g}
                </button>
              ))}
            </div>

            <h4 style={{ margin: "1rem 0 0.35rem" }}>Mission status</h4>
            <div className="item-actions">
              {(["candidate", "target", "staged"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className="btn secondary small"
                  disabled={selected.status === s}
                  onClick={() => void setStatus(selected, s)}
                >
                  {s}
                </button>
              ))}
            </div>

            <h4 style={{ margin: "1rem 0 0.35rem" }}>Linked sources</h4>
            <div className="list">
              {linkedSources.map((s) => (
                <article key={s.id} className="item">
                  <header>
                    <h4>
                      {s.name}{" "}
                      <span className="muted">({s.category})</span>
                    </h4>
                    <StatusChip
                      label={`suggested ${s.suggestedConfidence ?? "—"}`}
                    />
                  </header>
                </article>
              ))}
              {!linkedSources.length ? (
                <div className="empty">No linked sources.</div>
              ) : null}
            </div>

            <h4 style={{ margin: "1rem 0 0.35rem" }}>Derived signals</h4>
            <div className="list">
              {linkedSignals.map((s) => (
                <article key={s.id} className="item">
                  <header>
                    <h4>
                      {s.key}{" "}
                      <StatusChip
                        label={`${s.delta >= 0 ? "+" : ""}${s.delta}`}
                        tone="active"
                      />
                    </h4>
                  </header>
                  {s.note ? <p>{s.note}</p> : null}
                </article>
              ))}
              {!linkedSignals.length ? (
                <div className="empty">No signals on linked sources.</div>
              ) : null}
            </div>

            <div className="row" style={{ marginTop: "1rem" }}>
              <Link
                className="btn small"
                to={`/missions/${missionId}/cara?target=company&id=${selected.id}`}
              >
                CARA review this company
              </Link>
            </div>
          </div>
        )}
        {error ? <div className="error">{error}</div> : null}
      </section>

      <CompanyBulkImport
        missionId={missionId}
        sources={sources}
        onChanged={onChanged}
        onError={setError}
      />
    </div>
  );
}

function CompanyBulkImport({
  missionId,
  sources,
  onChanged,
  onError,
}: {
  missionId: string;
  sources: Source[];
  onChanged: () => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const [raw, setRaw] = useState("");
  const [listLabel, setListLabel] = useState("Imported member list");
  const [sourceMode, setSourceMode] = useState<"existing" | "new">("existing");
  const [existingSourceId, setExistingSourceId] = useState(
    sources[0]?.id ?? "",
  );
  const [newSourceName, setNewSourceName] = useState("");
  const [newCategory, setNewCategory] =
    useState<SourceCategory>("local_business_association");
  const [busy, setBusy] = useState(false);
  const [previewCount, setPreviewCount] = useState(0);

  function onPasteChange(value: string) {
    setRaw(value);
    setPreviewCount(parseCompanyImport(value).length);
  }

  async function onFile(file: File | null) {
    if (!file) return;
    const text = await file.text();
    onPasteChange(text);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    onError(null);
    const rows = parseCompanyImport(raw);
    if (!rows.length) {
      onError("Nothing to import — paste names or CSV first.");
      return;
    }

    setBusy(true);
    try {
      let sourceId = existingSourceId;
      const now = new Date().toISOString();

      if (sourceMode === "new") {
        if (!newSourceName.trim()) {
          onError("New source needs a name.");
          setBusy(false);
          return;
        }
        const created = await api.createInMission(missionId, "sources", {
          id: uuid(),
          producer: "Human" as const,
          first_seen_mission: missionId,
          reused_in_missions: [],
          name: newSourceName.trim(),
          type: "association" as const,
          category: newCategory,
          scope: "regional" as const,
          region: "",
          reason: `Bulk import source: ${listLabel}`,
          signalIds: [],
          evidenceIds: [],
          status: "accepted" as const,
          createdAt: now,
          updatedAt: now,
          v: 1,
        });
        sourceId = created.id;
      }

      if (!sourceId) {
        onError("Select or create a source for this import.");
        setBusy(false);
        return;
      }

      const result = await api.importCompanies(missionId, {
        sourceId,
        listLabel,
        rows,
      });

      setRaw("");
      setPreviewCount(0);
      await onChanged();
      if (result.created || result.updated) {
        onError(null);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" style={{ gridColumn: "1 / -1" }}>
      <h2>Bulk import</h2>
      <p className="hint">
        Paste one name per line, or CSV (name/title, address, region/city,
        website, services/specialism, tel/phone, mailto/email, kvk_number,
        sector). Batch import merges duplicates by name and unions list
        membership.
      </p>
      <form className="form-stack" onSubmit={submit}>
        <label>
          Paste list / CSV
          <textarea
            value={raw}
            onChange={(e) => onPasteChange(e.target.value)}
            placeholder={"Painter Co A\nPainter Co B"}
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
        <p className="muted">Preview: {previewCount} companies</p>
        <label>
          List membership label
          <input
            value={listLabel}
            onChange={(e) => setListLabel(e.target.value)}
            required
          />
        </label>
        <label>
          Link to source
          <select
            value={sourceMode}
            onChange={(e) =>
              setSourceMode(e.target.value as "existing" | "new")
            }
          >
            <option value="existing">Existing source</option>
            <option value="new">Create new source</option>
          </select>
        </label>
        {sourceMode === "existing" ? (
          <label>
            Source
            <select
              value={existingSourceId}
              onChange={(e) => setExistingSourceId(e.target.value)}
            >
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.category})
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label>
              New source name
              <input
                value={newSourceName}
                onChange={(e) => setNewSourceName(e.target.value)}
              />
            </label>
            <label>
              Category
              <select
                value={newCategory}
                onChange={(e) =>
                  setNewCategory(e.target.value as SourceCategory)
                }
              >
                {SOURCE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Importing…" : `Import ${previewCount || ""} candidates`}
        </button>
      </form>
    </section>
  );
}

/** Prefetch helper for mission signal lists. */
export async function loadSignalsForMission(missionId: string) {
  return listSignals(missionId);
}
