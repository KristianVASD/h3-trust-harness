import { useMemo, useState } from "react";
import type { NationChannel, NationLandscape } from "@h3-trust/schema";

function coverageLabel(coverage: NationChannel["coverage"]): string {
  if (coverage === "accepted") return "accepted";
  if (coverage === "proposed") return "proposed";
  return "empty";
}

export function PlanReader({ landscape }: { landscape: NationLandscape }) {
  const channels = landscape.channels;
  const firstOpen = useMemo(() => {
    const idx = channels.findIndex((c) => c.howToFind.trim() || c.platforms.length);
    return idx >= 0 ? idx : 0;
  }, [channels]);
  const [open, setOpen] = useState(firstOpen);
  const chapter = channels[open] ?? channels[0];

  if (!chapter) {
    return <p className="empty">No discovery channels yet.</p>;
  }

  return (
    <div>
      {landscape.overview.trim() ? (
        <p className="plan-overview">{landscape.overview}</p>
      ) : (
        <p className="hint">
          Nation mapping is empty until you run Map trust landscape or paste a
          playbook. The 12 channels below are the discovery phase — how local
          proof is found, not the 12 trade doors.
        </p>
      )}
      <div className="plan-reader">
        <nav className="plan-toc" aria-label="Discovery channels">
          {channels.map((ch, i) => (
            <button
              key={`${ch.layer}|${ch.category}`}
              type="button"
              aria-current={i === open ? true : undefined}
              onClick={() => setOpen(i)}
            >
              {i + 1}. {ch.title}
              <span className="muted"> · {coverageLabel(ch.coverage)}</span>
            </button>
          ))}
        </nav>
        <article className="plan-chapter" aria-live="polite">
          <h3>
            {open + 1}. {chapter.title}
          </h3>
          <p className="muted">
            {chapter.layer} · {chapter.category}
          </p>
          <p>
            {chapter.howToFind.trim() ||
              "No playbook text yet. Map the landscape or paste a chapter."}
          </p>
          {chapter.platforms.length ? (
            <div className="plan-platform-grid">
              {chapter.platforms.map((p) => (
                <div key={p.name} className="plan-platform">
                  <strong>{p.name}</strong>
                  {p.url ? (
                    <div>
                      <a href={p.url} target="_blank" rel="noreferrer">
                        {p.url}
                      </a>
                    </div>
                  ) : null}
                  {p.unlockNote ? <p className="muted">{p.unlockNote}</p> : null}
                </div>
              ))}
            </div>
          ) : null}
          {chapter.proposedSources.length ? (
            <ul>
              {chapter.proposedSources.map((s) => (
                <li key={s.name}>
                  {s.name}
                  {s.listUrl ? ` · ${s.listUrl}` : s.url ? ` · ${s.url}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </article>
      </div>
    </div>
  );
}
