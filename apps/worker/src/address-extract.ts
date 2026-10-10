import { isJunkCompanyName } from "@h3-trust/schema";

export type ExtractedBusiness = {
  name: string;
  website?: string;
};

function absUrl(href: string, base: string): string | undefined {
  try {
    const url = new URL(href, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function looksLikePerson(name: string): boolean {
  return /^[A-Z][a-z]+(?:\s+(?:van|de|der|den))?(?:\s+[A-Z][a-z]+){1,2}$/.test(name.trim());
}

function looksLikeBusiness(name: string, website?: string): boolean {
  if (website) return true;
  return /bv|b\.v|vof|n\.v|installatie|schilder|service|techniek|bouw|dak|loodgieter|elektro|hovenier|beveilig|glas|riool|klus|bedrijf|holding|groep|&/i.test(
    name,
  );
}

/** Public business names from a member page, or from a sponsor/standholder slice. */
export function extractBusinesses(
  html: string,
  pageUrl: string,
  mode: "members" | "sponsor",
): ExtractedBusiness[] {
  const sponsor = /sponsor|standhouder|braderie|kermis|jaarmarkt|partner/i;
  if (mode === "sponsor" && !sponsor.test(html)) return [];
  const scope = mode === "sponsor" ? html.slice(Math.max(0, html.search(sponsor) - 500), html.search(sponsor) + 8000) : html;
  const found = new Map<string, ExtractedBusiness>();

  const headings = scope.matchAll(/<(?:h2|h3|strong|a)[^>]*>([^<]{3,80})<\/(?:h2|h3|strong|a)>/gi);
  for (const match of headings) {
    const name = (match[1] ?? "").replace(/\s+/g, " ").trim();
    if (!name || isJunkCompanyName(name)) continue;
    if (/leden|contact|zoek|menu|sponsor|home|privacy|cookie/i.test(name)) continue;
    if (looksLikePerson(name) && !looksLikeBusiness(name)) continue;
    const key = name.toLowerCase();
    if (!found.has(key)) found.set(key, { name });
  }

  const links = scope.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([^<]{3,80})<\/a>/gi);
  for (const match of links) {
    const name = (match[2] ?? "").replace(/\s+/g, " ").trim();
    const website = absUrl(match[1] ?? "", pageUrl);
    if (!name || isJunkCompanyName(name)) continue;
    if (looksLikePerson(name) && !looksLikeBusiness(name, website)) continue;
    let host = "";
    try {
      host = new URL(pageUrl).host;
    } catch {
      host = "";
    }
    const external = website ? !website.includes(host) : false;
    if (!external && !looksLikeBusiness(name)) continue;
    const key = name.toLowerCase();
    const prev = found.get(key);
    found.set(key, { name, website: external ? website : prev?.website });
  }

  return [...found.values()].slice(0, 80);
}

export function sameHostServicesUrl(html: string, pageUrl: string): string | undefined {
  let host = "";
  try {
    host = new URL(pageUrl).host;
  } catch {
    return undefined;
  }
  for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const href = match[1] ?? "";
    if (!/diensten|services|over-ons|about/i.test(href)) continue;
    const abs = absUrl(href, pageUrl);
    if (!abs) continue;
    try {
      if (new URL(abs).host !== host) continue;
    } catch {
      continue;
    }
    return abs;
  }
  return undefined;
}
