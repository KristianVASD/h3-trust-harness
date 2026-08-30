import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { NationChannel, NationLandscape } from "@h3-trust/schema";
import { StatusChip } from "../Badges";

const LAYERS = ["national", "regional", "local"] as const;

function channelFilled(ch: NationChannel): boolean {
  return Boolean(
    ch.howToFind.trim() || ch.platforms.length || ch.proposedSources.length,
  );
}

function coverageTone(
  coverage: NationChannel["coverage"],
): "waiting" | "active" | "done" {
  if (coverage === "accepted") return "done";
  if (coverage === "proposed") return "active";
  return "waiting";
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
}

function splitHowToFind(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a className="plan-ext" href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

export function PlanReader({ landscape }: { landscape: NationLandscape }) {
  const channels = landscape.channels;
  const filledCount = useMemo(
    () => channels.filter(channelFilled).length,
    [channels],
  );
  const firstOpen = useMemo(() => {
    const idx = channels.findIndex(channelFilled);
    return idx >= 0 ? idx : 0;
  }, [channels]);
  const [open, setOpen] = useState(firstOpen);

  useEffect(() => {
    const current = document.querySelector(
      '.plan-toc button[aria-current="true"]',
    );
    current?.scrollIntoView({ block: "nearest" });
  }, [open]);

  const grouped = useMemo(
    () =>
      LAYERS.map((layer) => ({
        layer,
        items: channels
          .map((ch, i) => ({ ch, i }))
          .filter(({ ch }) => ch.layer === layer),
      })).filter((g) => g.items.length > 0),
    [channels],
  );

  const chapter = channels[open] ?? channels[0];
  if (!chapter) {
    return <p className="empty">No discovery channels yet.</p>;
  }

  const howToFind = splitHowToFind(chapter.howToFind);
  const filled = channelFilled(chapter);

  return (
    <div className="plan-wrap">
      {landscape.overview.trim() ? (
        landscape.overview.length > 420 ? (
          <details className="plan-overview-box">
            <summary>Nation overview</summary>
            <p className="plan-overview">{landscape.overview}</p>
          </details>
        ) : (
          <p className="plan-overview">{landscape.overview}</p>
        )
      ) : filledCount === 0 ? (
        <p className="hint">
          Nation mapping is empty until you run Map trust landscape or paste a
          playbook. The 12 channels below are the discovery phase — how local
          proof is found, not the 12 trade doors.
        </p>
      ) : null}
      <p className="plan-progress">
        <span>
          {filledCount} of {channels.length} channels have a method
        </span>
        <span
          className="plan-progress-bar"
          aria-hidden="true"
        >
          <span
            style={{
              width: `${Math.round((filledCount / Math.max(channels.length, 1)) * 100)}%`,
            }}
          />
        </span>
      </p>
      <div className="plan-reader">
        <nav className="plan-toc" aria-label="Discovery channels">
          {grouped.map((group) => (
            <div key={group.layer} className="plan-toc-group">
              <p className="plan-toc-layer">{group.layer}</p>
              {group.items.map(({ ch, i }) => {
                const ready = channelFilled(ch);
                return (
                  <button
                    key={`${ch.layer}|${ch.category}`}
                    type="button"
                    className={ready ? undefined : "plan-toc-empty"}
                    aria-current={i === open ? true : undefined}
                    onClick={() => setOpen(i)}
                  >
                    <span className="plan-toc-title">
                      {i + 1}. {ch.title}
                    </span>
                    <span className="plan-toc-meta">
                      {ready
                        ? `${ch.platforms.length} platforms`
                        : "empty"}
                      {ready ? ` · ${ch.coverage}` : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <article className="plan-chapter" aria-live="polite">
          <header className="plan-chapter-head">
            <h3>
              {open + 1}. {chapter.title}
            </h3>
            <div className="plan-chapter-tags">
              <StatusChip label={chapter.layer} tone="active" />
              <StatusChip label={chapter.category.replaceAll("_", " ")} />
              <StatusChip
                label={chapter.coverage}
                tone={coverageTone(chapter.coverage)}
              />
            </div>
          </header>

          {filled ? (
            <>
              <section className="plan-section">
                <h4>How to find</h4>
                {howToFind.length ? (
                  howToFind.map((para) => <p key={para.slice(0, 48)}>{para}</p>)
                ) : (
                  <p className="muted">
                    No method text yet — platforms and lists are below.
                  </p>
                )}
              </section>

              {chapter.platforms.length ? (
                <section className="plan-section">
                  <h4>Platforms</h4>
                  <div className="plan-platform-grid">
                    {chapter.platforms.map((p) => (
                      <article key={p.name} className="plan-platform">
                        <strong>{p.name}</strong>
                        {p.unlockNote ? (
                          <p className="muted">{p.unlockNote}</p>
                        ) : null}
                        {p.url ? (
                          <ExternalLink href={p.url}>
                            {hostLabel(p.url)}
                          </ExternalLink>
                        ) : (
                          <p className="muted">No URL yet</p>
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}

              {chapter.proposedSources.length ? (
                <section className="plan-section">
                  <h4>Proposed lists</h4>
                  <ul className="plan-source-list">
                    {chapter.proposedSources.map((s) => (
                      <li key={s.name}>
                        <span className="plan-source-name">{s.name}</span>
                        <span className="plan-source-links">
                          {s.url ? (
                            <ExternalLink href={s.url}>
                              {hostLabel(s.url)}
                            </ExternalLink>
                          ) : null}
                          {s.listUrl ? (
                            <ExternalLink href={s.listUrl}>list</ExternalLink>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          ) : (
            <div className="plan-chapter-empty">
              <p>
                No playbook text yet. Map the landscape or paste a chapter.
              </p>
              {filledCount > 0 ? (
                <p className="muted">
                  {filledCount === 1
                    ? "1 other channel already has a method — pick it in the list."
                    : `${filledCount} other channels already have a method — pick one in the list.`}
                </p>
              ) : null}
            </div>
          )}
        </article>
      </div>
    </div>
  );
}
