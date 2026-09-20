import { LocalNetworksPage } from "../components/LocalNetworksPage";
import { usePublic } from "../PublicContext";

export function PublicLocalNetworksPage() {
  const { lang, navigateView, openRegister, openPartner } = usePublic();
  return (
    <LocalNetworksPage
      lang={lang}
      onBackToHome={() => navigateView("home")}
      onOpenCommunityModal={() => openRegister()}
      onOpenPartnerModal={() => openPartner("local_association")}
      onNavigate={navigateView}
    />
  );
}
