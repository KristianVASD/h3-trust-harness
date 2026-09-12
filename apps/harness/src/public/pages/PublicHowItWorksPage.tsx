import { HowItWorks } from "../components/HowItWorks";
import { TrustCardPreview } from "../components/TrustCardPreview";
import { TrustLadder } from "../components/TrustLadder";
import { usePublic } from "../PublicContext";

export function PublicHowItWorksPage() {
  const { lang } = usePublic();
  return (
    <div>
      <HowItWorks lang={lang} />
      <TrustLadder lang={lang} />
      <TrustCardPreview lang={lang} />
    </div>
  );
}
