import { HandyHouseHelpBridge } from "../components/HandyHouseHelpBridge";
import { Hero } from "../components/Hero";
import { HowItWorks } from "../components/HowItWorks";
import { LiftSectorsSection } from "../components/LiftSectorsSection";
import { LocalTrustSection } from "../components/LocalTrustSection";
import { ProblemSection } from "../components/ProblemSection";
import { TrustCardPreview } from "../components/TrustCardPreview";
import { TrustLadder } from "../components/TrustLadder";
import { TwoPathsSection } from "../components/TwoPathsSection";
import { usePublic } from "../PublicContext";

export function PublicHomePage() {
  const { lang, navigateView, openRegister, openPartner } = usePublic();

  const scrollToWidget = () => {
    document
      .getElementById("trust-preview-widget")
      ?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      <Hero
        lang={lang}
        onExploreClick={() => navigateView("zoeken")}
        onScrollToWidget={scrollToWidget}
      />
      <TrustCardPreview lang={lang} />
      <ProblemSection lang={lang} />
      <HowItWorks lang={lang} />
      <TrustLadder lang={lang} />
      <LocalTrustSection lang={lang} />
      <TwoPathsSection lang={lang} onOpenRegisterModal={openRegister} />
      <LiftSectorsSection lang={lang} onOpenPartnerModal={openPartner} />
      <HandyHouseHelpBridge
        lang={lang}
        onExploreMatching={() => navigateView("zoeken")}
      />
    </>
  );
}
