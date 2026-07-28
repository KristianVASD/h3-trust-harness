import type { ExtractionGuide, Richness, Source, SourceFieldKey } from "@h3-trust/schema";

/** Score bar + field chips for a probed source's richness. */
export function RichnessBar({
  richness,
  sourceFields,
}: {
  richness?: Richness;
  sourceFields?: SourceFieldKey[];
}) {
  const score = richness?.score ?? 0;
  const present = richness?.present?.length
    ? richness.present
    : (sourceFields ?? []);

  return (
    <div className="worker-richness-detail">
      <div className="worker-richness-bar-row">
        <span className="worker-richness-chip">{score}</span>
        <div
          className="worker-richness-bar"
          role="meter"
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Richness ${score}`}
        >
          <div
            className="worker-richness-bar-fill"
            style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
          />
        </div>
      </div>
      {present.length > 0 ? (
        <div className="worker-field-chips">
          {present.map((f) => (
            <span key={f} className="worker-field-chip">
              {f}
            </span>
          ))}
        </div>
      ) : (
        <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.8rem" }}>
          No fields yet
        </p>
      )}
    </div>
  );
}

/** Extraction guide written by probe — consumed later by extract. */
export function ExtractionGuidePanel({ guide }: { guide: ExtractionGuide }) {
  const selectorKeys = guide.selectors ? Object.keys(guide.selectors) : [];

  return (
    <div className="worker-guide-panel">
      <div className="worker-guide-meta">
        <span>
          Pattern: <strong>{guide.listPattern}</strong>
        </span>
        <span>
          Pagination: <strong>{guide.pagination ? "yes" : "no"}</strong>
        </span>
        {guide.regionFilter ? (
          <span>
            Region filter: <strong>{guide.regionFilter}</strong>
          </span>
        ) : null}
      </div>
      {guide.fields.length > 0 ? (
        <div className="worker-field-chips">
          {guide.fields.map((f) => (
            <span key={f} className="worker-field-chip guide">
              {f}
            </span>
          ))}
        </div>
      ) : null}
      {selectorKeys.length > 0 ? (
        <p className="muted" style={{ margin: "0.4rem 0 0", fontSize: "0.78rem" }}>
          Selectors: {selectorKeys.join(", ")}
        </p>
      ) : null}
      {guide.notes ? (
        <p className="hint" style={{ margin: "0.4rem 0 0" }}>
          {guide.notes}
        </p>
      ) : null}
    </div>
  );
}

/** Expanded probe detail: richness + guide + evidence reasons. */
export function SourceProbeDetail({ source }: { source: Source }) {
  const reasons = source.evidence?.summary_reasons ?? [];

  return (
    <div className="worker-probe-detail">
      <section>
        <h4 className="worker-probe-detail-title">Richness</h4>
        <RichnessBar
          richness={source.richness}
          sourceFields={source.sourceFields}
        />
      </section>
      {source.extractionGuide ? (
        <section>
          <h4 className="worker-probe-detail-title">Extraction guide</h4>
          <ExtractionGuidePanel guide={source.extractionGuide} />
        </section>
      ) : (
        <p className="muted">No extraction guide yet — run Probe.</p>
      )}
      {reasons.length > 0 ? (
        <section>
          <h4 className="worker-probe-detail-title">Probe evidence</h4>
          <ul className="worker-probe-evidence">
            {reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
