import { websiteHost } from "./hhh-shortlist";

const PREFERRED_LOCAL = new Set([
  "info",
  "contact",
  "mail",
  "offerte",
  "service",
  "kantoor",
  "administratie",
  "hello",
  "hallo",
  "sales",
  "verkoop",
  "planning",
  "support",
  "klantenservice",
]);

const JUNK_HOST =
  /^(?:example\.(?:com|nl|org)|sentry\.io|wixpress\.com|wordpress\.(?:com|org)|schema\.org|cloudflare\.com|google\.com|gstatic\.com|facebook\.com|instagram\.com|gravatar\.com|w3\.org|domain\.com|email\.com|mysite\.com)$/i;

const JUNK_LOCAL =
  /^(?:noreply|no-reply|donotreply|privacy|abuse|webmaster|postmaster|wordpress|wix|example|test|null|undefined)$/i;

const FILE_TLD = /^(?:png|jpe?g|gif|svg|webp|css|js|woff2?)$/i;

const CONTACT_HREF = /contact|neem-contact|contacteer|mail-ons|schrijf/i;

/** Keep a browser URL. Drop anything that is not http(s). */
export function publicHttpUrl(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function cleanEmail(raw: string): string | null {
  let value = raw.trim().replace(/^mailto:/i, "");
  const query = value.indexOf("?");
  if (query >= 0) value = value.slice(0, query);
  try {
    value = decodeURIComponent(value);
  } catch {
    /* keep the raw value */
  }
  value = value.replace(/&#64;|&#064;|&commat;/gi, "@").trim().toLowerCase();
  value = value.replace(/[>,);.\s]+$/g, "");
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(value)) return null;
  const [local, host] = value.split("@");
  if (!local || !host || local.length > 64 || host.length > 80) return null;
  if (JUNK_LOCAL.test(local) || JUNK_HOST.test(host)) return null;
  const tld = host.split(".").pop() ?? "";
  if (FILE_TLD.test(tld)) return null;
  if (local.includes("..") || host.includes("..")) return null;
  return value;
}

function emailHost(email: string): string | null {
  const host = email.split("@")[1]?.toLowerCase();
  return host || null;
}

/** True when the address sits on the company site, including a mail subdomain. */
export function emailOnOwnHost(email: string, ownHost: string): boolean {
  const host = emailHost(email);
  if (!host || !ownHost) return false;
  return host === ownHost || host.endsWith(`.${ownHost}`);
}

function rankEmails(emails: readonly string[]): string[] {
  return [...emails].sort((left, right) => {
    const leftLocal = left.split("@")[0] ?? "";
    const rightLocal = right.split("@")[0] ?? "";
    const leftRank = PREFERRED_LOCAL.has(leftLocal) ? 0 : 1;
    const rightRank = PREFERRED_LOCAL.has(rightLocal) ? 0 : 1;
    return leftRank - rightRank || left.length - right.length || left.localeCompare(right);
  });
}

/** Mailtos and visible addresses on one HTML page. Tracking and placeholder addresses are left out. */
export function emailsInPage(html: string): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(/mailto:([^"'>\s]+)/gi)) {
    const email = cleanEmail(match[1] ?? "");
    if (email) found.add(email);
  }
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#64;|&#064;|&commat;/gi, "@")
    .replace(/\s*[\[(]\s*at\s*[\])]\s*/gi, "@");
  for (const match of text.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)) {
    const email = cleanEmail(match[0] ?? "");
    if (email) found.add(email);
  }
  return [...found];
}

export function looksLikeContactUrl(raw: string): boolean {
  try {
    return CONTACT_HREF.test(new URL(raw).pathname);
  } catch {
    return false;
  }
}

/** A contact link on the same site, when the page offers one. */
export function sameHostContactUrl(html: string, pageUrl: string): string | undefined {
  const host = websiteHost(pageUrl);
  if (!host) return undefined;
  let best: { url: string; score: number } | undefined;
  for (const match of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    const href = match[1] ?? "";
    if (!CONTACT_HREF.test(href)) continue;
    if (/^(?:mailto:|tel:|javascript:)/i.test(href)) continue;
    let abs: URL;
    try {
      abs = new URL(href, pageUrl);
    } catch {
      continue;
    }
    if (abs.protocol !== "http:" && abs.protocol !== "https:") continue;
    if (websiteHost(abs.toString()) !== host) continue;
    const score = /contact/i.test(abs.pathname) ? 2 : 1;
    if (!best || score > best.score) best = { url: abs.toString(), score };
  }
  return best?.url;
}

/**
 * An address on the company domain replaces an empty or different one.
 * A model address stays when the page does not show another address on that domain.
 */
export function chooseSiteEmail(args: {
  found: readonly string[];
  ownHost: string;
  current: string;
}): string {
  const current = args.current.trim().toLowerCase();
  const unique = [
    ...new Set(args.found.map((email) => email.trim().toLowerCase()).filter(Boolean)),
  ];
  const own = unique.filter((email) => emailOnOwnHost(email, args.ownHost));
  if (own.length > 0) {
    if (current && own.includes(current)) return current;
    return rankEmails(own)[0] ?? current;
  }
  if (current) return current;
  return rankEmails(unique)[0] ?? "";
}
