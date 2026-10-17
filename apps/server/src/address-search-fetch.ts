import { isJunkCompanyName, isRegistryListUrl } from "@h3-trust/schema";

export type FetchedPage = {
  url: string;
  ok: boolean;
  status: number;
  html: string;
  text: string;
};

const UA =
  "Mozilla/5.0 (compatible; H3-OmegaWorker/1.0; +https://h3-trust-harness.vercel.app)";

export async function fetchPage(url: string, timeoutMs = 8000): Promise<FetchedPage> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const html = decodeBody(buf, res.headers.get("content-type"));
    return {
      url: res.url || url,
      ok: res.ok,
      status: res.status,
      html,
      text: stripTags(html).slice(0, 20000),
    };
  } catch (err) {
    return {
      url,
      ok: false,
      status: 0,
      html: "",
      text: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

function decodeBody(buf: Buffer, contentType: string | null): string {
  const declared = /charset=([^;]+)/i.exec(contentType ?? "")?.[1]?.trim();
  const encodings = [declared, "utf-8", "windows-1252", "latin-1"].filter(Boolean) as string[];
  for (const enc of encodings) {
    try {
      return new TextDecoder(enc).decode(buf);
    } catch {
      /* try next */
    }
  }
  return buf.toString("utf8");
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function pageBlocked(url: string, status: number, html: string, text: string): boolean {
  if (isRegistryListUrl(url)) return true;
  if (status === 401 || status === 403) return true;
  return /captcha|g-recaptcha|inloggen om|log in to continue/i.test(html) && text.length < 900;
}

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

export function extractBusinesses(
  html: string,
  pageUrl: string,
  mode: "members" | "sponsor",
): ExtractedBusiness[] {
  const sponsor = /sponsor|standhouder|braderie|kermis|jaarmarkt|partner/i;
  if (mode === "sponsor" && !sponsor.test(html)) return [];
  const scope =
    mode === "sponsor"
      ? html.slice(Math.max(0, html.search(sponsor) - 500), html.search(sponsor) + 8000)
      : html;
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
