import { SectorsPage } from "../components/SectorsPage";
import { usePublic } from "../PublicContext";

export function PublicSectorsPage() {
  const { lang } = usePublic();
  return <SectorsPage lang={lang} />;
}
