import { fetchPage } from "../fetch-page.js";

export type ScrapedCompany = {
  name: string;
  phone?: string;
  email?: string;
  website_url?: string;
  address?: string;
  region?: string;
  specialism?: string;
};

const PLATFORM_EMAIL = "info@platformplaagdierbeheersing.nl";

export function isPlaagdierList(html: string, url: string): boolean {
  if (/platformplaagdierbeheersing\.nl/i.test(url)) return true;
  return /do_\w+\(/.test(html) && /go=mem/.test(html) && /mcclick/.test(html);
}

export async function extractPlaagdierMapJs(listHtml: string): Promise<ScrapedCompany[]> {
  const doMatches = [
    ...listHtml.matchAll(/do_\w+\([^,]+,[^,]+,"([^"]+)"/g),
  ].map((m) => m[1] ?? "");
  const urls = [
    ...listHtml.matchAll(
      /mcclick\(&quot;(https:\/\/platformplaagdierbeheersing\.nl\/index\.mchil\?go=mem[^&]*&amp;mem=[^&]*&amp;k9=[^&]*&amp;title=[^"]+)&quot;\)/g,
    ),
  ].map((m) => unescapeHtml(m[1] ?? ""));

  const pairs: Array<{ name: string; url: string }> = [];
  const n = Math.min(doMatches.length, urls.length);
  for (let i = 0; i < n; i++) {
    const raw = (doMatches[i] ?? "").split("\\n")[0] ?? "";
    const name = unescapeHtml(raw).replace("\\'", "'").replace('\\"', '"').trim();
    const url = urls[i] ?? "";
    if (name && url) pairs.push({ name, url });
  }

  const out: ScrapedCompany[] = [];
  for (const pair of pairs) {
    const page = await fetchPage(pair.url, 15000);
    const contact = extractContactBlock(page.html);
    out.push({
      name: pair.name,
      phone: contact.phone,
      email: contact.email,
      website_url: contact.website,
    });
    await sleep(250);
  }
  return out;
}

function extractContactBlock(html: string): {
  phone?: string;
  email?: string;
  website?: string;
} {
  const idx = html.indexOf("Contactgegevens:");
  const section = idx >= 0 ? html.slice(idx, idx + 8000) : html;
  const phones = [...section.matchAll(/mcclick\('tel:([^']+)'/g)].map((m) =>
    unescapeHtml(m[1] ?? "").trim(),
  );
  const emails = [...section.matchAll(/mcclick\('mailto:([^']+)'/g)]
    .map((m) => unescapeHtml(m[1] ?? "").trim().toLowerCase())
    .filter((e) => e.includes("@") && !e.startsWith("?") && e !== PLATFORM_EMAIL);
  const sites = [...section.matchAll(/mcclick\('(https?:\/\/[^']+)'/g)]
    .map((m) => m[1] ?? "")
    .filter((u) => !/google\.com|facebook\.com|linkedin\.com|platformplaagdier/i.test(u));
  return {
    phone: phones[0] || undefined,
    email: emails[0] || undefined,
    website: sites[0] || undefined,
  };
}

function unescapeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
