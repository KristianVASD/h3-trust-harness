import { LocalNetworksPage } from "../components/LocalNetworksPage";
import { usePublic } from "../PublicContext";

export function PublicLocalNetworksPage() {
  const { lang, navigateView, openPartner } = usePublic();
  return (
    <LocalNetworksPage
      lang={lang}
      onBackToHome={() => navigateView("home")}
      onOpenPartnerModal={() => openPartner("local_association")}
      onJoin={() => navigateView("vakman-worden")}
    />
  );
}
