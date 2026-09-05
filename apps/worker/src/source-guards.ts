import { isJunkCompanyName, isRegistryListUrl, type Source } from "@h3-trust/schema";

export { isJunkCompanyName, isRegistryListUrl };

export function isRegistryOrSearchWall(source: Source, url = ""): boolean {
  const href = (url || source.listUrl || source.url || "").toLowerCase();
  if (source.category === "registry") return true;
  if (source.extractionGuide?.listPattern === "search-form") return true;
  return isRegistryListUrl(href);
}
