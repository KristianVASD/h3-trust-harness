import { SearchPreviewPage } from "../components/SearchPreviewPage";
import { usePublic } from "../PublicContext";

export function PublicSearchPage() {
  const { lang, navigateView } = usePublic();
  return (
    <SearchPreviewPage
      lang={lang}
      onBackToHome={() => navigateView("home")}
      onSelectCompany={() => {}}
    />
  );
}
