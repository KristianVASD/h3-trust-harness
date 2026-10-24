import { useNavigate } from "react-router-dom";
import { LocalNetworksPage } from "../components/LocalNetworksPage";
import { usePublic } from "../PublicContext";

export function PublicLocalNetworksPage() {
  const { lang, navigateView, openPartner } = usePublic();
  const navigate = useNavigate();
  return (
    <LocalNetworksPage
      lang={lang}
      onBackToHome={() => navigateView("home")}
      onOpenPartnerModal={() => openPartner("local_association")}
      onJoin={() => navigate({ pathname: "/", hash: "#aanmelden" })}
    />
  );
}
