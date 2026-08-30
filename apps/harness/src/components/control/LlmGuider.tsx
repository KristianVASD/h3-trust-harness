type LlmGuiderProps = {
  csv: string;
};

export function LlmGuider({ csv }: LlmGuiderProps) {
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
    <section className="llm-guider" aria-label="List classification guide">
      <p className="control-eyebrow">Operator guide</p>
      <h3 style={{ margin: "0 0 0.35rem", fontFamily: "var(--font-display)" }}>
        Weigh this list before import
      </h3>
      <p className="hint">
        Four questions for Qwen / Cursor. Set mixed, weight, and audience from
        the answers. CARA still reviews the source after import.
      </p>
      <div className="llm-guider-steps">
        <div className="llm-guider-step">
          <span className="llm-guider-num">1</span>
          <div>
            <strong>Purity</strong>
            <p className="muted">Niche one trade, or mixed OV / sportclub / KvK?</p>
          </div>
        </div>
        <div className="llm-guider-step">
          <span className="llm-guider-num">2</span>
          <div>
            <strong>Audience</strong>
            <p className="muted">B2C / private, B2B, VvE / hoa, or unknown.</p>
          </div>
        </div>
        <div className="llm-guider-step">
          <span className="llm-guider-num">3</span>
          <div>
            <strong>Weight</strong>
            <p className="muted">How exclusive? Vakwerk+ ≈ 90, club sponsor ≈ 40.</p>
          </div>
        </div>
        <div className="llm-guider-step">
          <span className="llm-guider-num">4</span>
          <div>
            <strong>Match keys</strong>
            <p className="muted">KvK, email domain, website, or name + postcode.</p>
          </div>
        </div>
      </div>
      <textarea readOnly value={text} />
      <button
        type="button"
        className="btn secondary small"
        onClick={() => void navigator.clipboard.writeText(text)}
      >
        Copy prompt
      </button>
    </section>
  );
}
