import { HandyHouseHelpBridge } from "../components/HandyHouseHelpBridge";
import { usePublic } from "../PublicContext";

export function PublicHhhPage() {
  const { lang, navigateView } = usePublic();
  return (
    <HandyHouseHelpBridge
      lang={lang}
      onExploreMatching={() => navigateView("zoeken")}
      showLayerGuide
      onNavigate={navigateView}
    />
  );
}
