import type { Company } from "@h3-trust/schema";
import "./tags.css";

export function TagChip({
  label,
  tone = "cap",
}: {
  label: string;
  tone?: "cap" | "ctx" | "diff" | "el";
}) {
  const cls =
    tone === "ctx"
      ? "tag-chip tag-ctx"
      : tone === "diff"
        ? "tag-chip tag-diff"
        : tone === "el"
          ? "tag-chip tag-el"
          : "tag-chip tag-cap";
  return <span className={cls}>{label}</span>;
}

/** Descriptive Can / For / Notable + profile — never mixed into trust chips. */
export function CompanyProfileTags({ company }: { company: Company }) {
  const caps = company.capabilities ?? [];
  const ctxs = company.serviceContexts ?? [];
  const diffs = company.differentiators ?? [];
  const els = company.servicedElementCodes ?? [];
  const hasTags =
    caps.length > 0 || ctxs.length > 0 || diffs.length > 0 || els.length > 0;

  if (!hasTags && !company.profileSnippet) return null;

  return (
    <div className="company-profile-block">
      {hasTags ? (
        <div className="company-tags" aria-label="Company profile dimensions">
          {caps.length > 0 ? (
            <div className="tag-row">
              <span className="tag-label">Can:</span>
              {caps.map((c) => (
                <TagChip key={c} label={c} tone="cap" />
              ))}
            </div>
          ) : null}
          {ctxs.length > 0 ? (
            <div className="tag-row">
              <span className="tag-label">For:</span>
              {ctxs.map((c) => (
                <TagChip key={c} label={c} tone="ctx" />
              ))}
            </div>
          ) : null}
          {diffs.length > 0 ? (
            <div className="tag-row">
              <span className="tag-label">Notable:</span>
              {diffs.map((c) => (
                <TagChip key={c} label={c} tone="diff" />
              ))}
            </div>
          ) : null}
          {els.length > 0 ? (
            <div className="tag-row">
              <span className="tag-label">Elements:</span>
              {els.map((c) => (
                <TagChip key={c} label={c} tone="el" />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {company.profileSnippet ? (
        <div className="profile-snippet">
          <p className="snippet-text">{company.profileSnippet}</p>
          <p className="snippet-meta">
            {company.profileSourceUrl ? (
              <a
                href={company.profileSourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                {company.profileSourceUrl}
              </a>
            ) : null}
            {company.profileHarvestedAt
              ? ` · harvested ${new Date(company.profileHarvestedAt).toLocaleDateString("en-GB")}`
              : ""}
            {company.profileProducer ? ` · ${company.profileProducer}` : ""}
          </p>
        </div>
      ) : null}
    </div>
  );
}
