import { Link } from "react-router-dom";

const PARTNER_MAIL =
  "mailto:partners@h3trust.org?subject=H3%20Trust%20partnership";
const VOLUNTEER_MAIL =
  "mailto:cara@h3trust.org?subject=I%20want%20to%20be%20a%20CARA%20volunteer";

/**
 * Public welcome — mission, local trust, CARA volunteers, partnership.
 * Ops desk lives at /control.
 */
export function HomePage() {
  return (
    <div className="home">
      <section className="home-hero" aria-labelledby="home-brand">
        <div className="home-hero-plane" aria-hidden="true" />
        <div className="home-hero-inner">
          <p className="home-brand" id="home-brand">
            H3 Trust
          </p>
          <h1 className="home-headline">
            Connect people with local companies they can trust.
          </h1>
          <p className="home-lede">
            We investigate which lists and signals actually mean something —
            then humans (CARA) decide what counts. No black-box scores.
          </p>
          <div className="home-cta">
            <Link className="btn" to="/search">
              Search trusted companies
            </Link>
            <a className="btn secondary" href="#cara">
              Become a CARA volunteer
            </a>
          </div>
        </div>
      </section>

      <section className="home-section" aria-labelledby="home-why">
        <h2 id="home-why">Why this exists</h2>
        <p>
          Finding a painter, plumber, or local specialist should not mean
          gambling on ads and star ratings. H3 Trust maps{" "}
          <strong>real-world sources</strong> — chambers of commerce, local
          associations, quality marks — and shows{" "}
          <strong>why</strong> a company surfaces. Evidence first. Judgement
          stays human.
        </p>
      </section>

      <section className="home-section" aria-labelledby="home-how">
        <h2 id="home-how">How a mission works</h2>
        <ol className="home-steps">
          <li>
            <strong>Investigate sources</strong> — which lists cover this place
            and trade, and how rich are they?
          </li>
          <li>
            <strong>Align with CARA</strong> — volunteers agree, adjust, or
            dissent with a reason. Dissent is preserved, not erased.
          </li>
          <li>
            <strong>Search with confidence</strong> — answers come with coverage
            and a clear “why,” not a mysterious score.
          </li>
        </ol>
        <p className="home-section-action">
          <Link className="btn secondary" to="/control">
            Open the demo harness
          </Link>
        </p>
      </section>

      <section
        className="home-section home-section--cara"
        id="cara"
        aria-labelledby="home-cara"
      >
        <h2 id="home-cara">Become a CARA volunteer</h2>
        <p>
          CARA is human alignment — the moment someone looks at an Ω proposal or
          a trust signal and says <em>agree</em>, <em>adjust</em>, or{" "}
          <em>dissent</em>. Volunteers keep the harness honest. You do not need
          to code; you need care for your region and a willingness to leave a
          reason when you disagree.
        </p>
        <p className="home-section-action">
          <a className="btn" href={VOLUNTEER_MAIL}>
            Volunteer for CARA
          </a>
        </p>
      </section>

      <section
        className="home-section home-section--partner"
        id="partnership"
        aria-labelledby="home-partner"
      >
        <h2 id="home-partner">Partnership</h2>
        <p>
          Municipalities, associations, and platforms who want{" "}
          <strong>local trust infrastructure</strong> — not another review farm —
          are welcome. Tell us about your region, sector, or data you already
          hold. We will reply with how a mission could start.
        </p>
        <p className="home-section-action">
          <a className="btn secondary" href={PARTNER_MAIL}>
            Contact us for partnership
          </a>
        </p>
      </section>

      <footer className="home-footer">
        <p>
          Part of the H3 Trust / BGI Nexus vision. The Harness never decides —
          people do.
        </p>
        <p>
          <Link to="/control">Mission Control</Link>
          {" · "}
          <Link to="/search">Search</Link>
        </p>
      </footer>
    </div>
  );
}
