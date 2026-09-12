import { Link } from "react-router-dom";
import { TwoPathsSection } from "../components/TwoPathsSection";
import { usePublic } from "../PublicContext";

export function PublicJoinPage() {
  const { lang, openRegister } = usePublic();

  return (
    <div>
      <div className="public-section">
        <div className="public-page-card px-5 sm:px-8 lg:px-12 py-8 sm:py-10">
          <p className="text-xs font-mono uppercase tracking-widest text-[#1E3A2F] font-semibold">
            {lang === "nl" ? "Bedrijven" : "Companies"}
          </p>
          <h1 className="font-serif text-3xl sm:text-5xl text-zinc-900 font-normal mt-2">
            {lang === "nl"
              ? "Schrijf je bedrijf in, of draag er een aan"
              : "Register your company, or nominate one"}
          </h1>
          <p className="text-sm text-zinc-600 mt-3 max-w-2xl">
            {lang === "nl"
              ? "Het trust-netwerk is voor bedrijven. Geen extra rollen, geen wijktaal — alleen inschrijven of aandragen."
              : "The trust network is for companies. No extra roles — register yourself or nominate a company."}
          </p>
          <p className="text-sm text-zinc-600 mt-4">
            {lang === "nl" ? "Al een account?" : "Already have an account?"}{" "}
            <Link className="text-[#1E3A2F] underline underline-offset-2" to="/login">
              {lang === "nl" ? "Inloggen" : "Sign in"}
            </Link>
          </p>
        </div>
      </div>

      <TwoPathsSection
        lang={lang}
        onOpenCommunityModal={() => openRegister(true)}
        onOpenRegisterModal={() => openRegister(false)}
      />
    </div>
  );
}
