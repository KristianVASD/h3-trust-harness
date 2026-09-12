import { SectorsPage } from "../components/SectorsPage";
import { usePublic } from "../PublicContext";

export function PublicSectorsPage() {
  const { lang, navigateView, openPartner } = usePublic();
  return (
    <SectorsPage
      lang={lang}
      onBackToHome={() => navigateView("home")}
      onOpenPartnerModal={openPartner}
    />
  );
}
