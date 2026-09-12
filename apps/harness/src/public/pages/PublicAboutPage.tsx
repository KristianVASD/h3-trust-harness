import { AboutH3Page } from "../components/AboutH3Page";
import { usePublic } from "../PublicContext";

export function PublicAboutPage() {
  const { lang, navigateView, openHarness } = usePublic();
  return (
    <AboutH3Page
      lang={lang}
      onBackToHome={() => navigateView("home")}
      onOpenHarnessModal={openHarness}
    />
  );
}
