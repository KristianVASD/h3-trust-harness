import { LocalNetworksPage } from "../components/LocalNetworksPage";
import { usePublic } from "../PublicContext";

export function PublicLocalNetworksPage() {
  const { lang, navigateView, openRegister } = usePublic();
  return (
    <LocalNetworksPage
      lang={lang}
      onBackToHome={() => navigateView("home")}
      onOpenCommunityModal={() => openRegister(true)}
      onNavigate={navigateView}
    />
  );
}
