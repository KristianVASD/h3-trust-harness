import { Link } from "react-router-dom";

/**
 * Public welcome — mission, local trust, CURAD volunteers, partnership.
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
            then humans decide what counts. No black-box scores.
          </p>
          <div className="home-cta">
            <Link className="btn" to="/search">
              Search trusted companies
            </Link>
            <a className="btn secondary" href="#curad">
              Become a CURAD volunteer
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
            <strong>Align with CURAD</strong> — volunteers record a{" "}
            <em>CARA</em> act: agree, adjust, or dissent with a reason. Dissent
            is preserved, not erased.
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
        id="curad"
        aria-labelledby="home-curad"
      >
        <h2 id="home-curad">Become a CURAD volunteer</h2>
        <p>
          <strong>CURAD</strong> is the governance loop — align, feedback,
          preserve dissent. Each time you agree, adjust, or dissent on a
          proposal, that act is a <strong>CARA</strong>. You do not need to
          code; you need care for your region and a willingness to leave a
          reason when you disagree.
        </p>
        <p>
          After you sign up, an admin must approve you before you can interact.
          Until then you can look inside, but writes stay locked.
        </p>
        <p className="home-section-action">
          <Link className="btn" to="/signup">
            Apply as CURAD volunteer
          </Link>
        </p>
      </section>

      <section
        className="home-section home-section--partner"
        id="partnership"
        aria-labelledby="home-partner"
      >
        <h2 id="home-partner">Partnership</h2>
        <p>
          Municipalities, associations, and foundations that want a transparent
          trust layer for local services — talk to us.
        </p>
        <p className="home-section-action">
          <a
            className="btn secondary"
            href="mailto:partners@h3trust.org?subject=H3%20Trust%20partnership"
          >
            Contact partners@h3trust.org
          </a>
        </p>
      </section>
    </div>
  );
}
