import {
  chooseSiteEmail,
  companyNameOnPage,
  emailOnOwnHost,
  emailsInPage,
  foldTradeLabel,
  looksLikeContactUrl,
  publicHttpUrl,
  sameHostContactUrl,
  websiteHost,
  type GeminiCandidate,
  type GeminiEvidenceResult,
} from "@h3-trust/schema";
import { fetchPage, pageBlocked, type FetchedPage } from "./address-search-fetch.js";

type PageFetch = (url: string, timeoutMs?: number) => Promise<FetchedPage>;

const PAGE_TIMEOUT_MS = 5000;
const MAX_PAGES = 3;
const CONCURRENCY = 4;
const LEAD_HOST = /(?:^|\.)(?:werkspot|trustoo|zoofy|vergelijk)\.nl$/i;

function namesMatch(left: string, right: string): boolean {
  const a = foldTradeLabel(left);
  const b = foldTradeLabel(right);
  if (!a || !b) return false;
  if (a === b) return true;
  return a.length >= 8 && b.length >= 8 && (a.includes(b) || b.includes(a));
}

function citedOwnPages(candidate: GeminiCandidate, evidence: GeminiEvidenceResult): string[] {
  const host = websiteHost(candidate.website);
  if (!host) return [];
  const urls = evidence.companies
    .filter((company) => namesMatch(company.name, candidate.name))
    .flatMap((company) => company.claims.map((claim) => claim.source_url));
  const own = [...new Set(urls.filter((url) => websiteHost(url) === host))];
  own.sort((left, right) => Number(looksLikeContactUrl(right)) - Number(looksLikeContactUrl(left)));
  return own;
}

async function readCandidate(
  candidate: GeminiCandidate,
  evidence: GeminiEvidenceResult,
  fetchImpl: PageFetch,
): Promise<GeminiCandidate> {
  const ownHost = websiteHost(candidate.website);
  const home = publicHttpUrl(candidate.website);
  if (!ownHost || !home) return candidate;
  if (candidate.email.trim() && emailOnOwnHost(candidate.email, ownHost)) return candidate;

  const planned: string[] = [];
  const push = (url: string | undefined) => {
    const absolute = publicHttpUrl(url);
    if (!absolute || websiteHost(absolute) !== ownHost || planned.includes(absolute)) return;
    planned.push(absolute);
  };
  for (const url of citedOwnPages(candidate, evidence)) push(url);
  push(home);

  const found: string[] = [];
  let contactUrl: string | undefined;
  let attempts = 0;
  for (let index = 0; index < planned.length && attempts < MAX_PAGES; index += 1) {
    const url = planned[index]!;
    attempts += 1;
    const page = await fetchImpl(url, PAGE_TIMEOUT_MS).catch(() => null);
    if (!page || !page.ok || pageBlocked(url, page.status, page.html, page.text)) continue;
    const opened = publicHttpUrl(page.url) ?? url;
    if (looksLikeContactUrl(opened)) contactUrl = opened;
    found.push(...emailsInPage(page.html));
    const link = sameHostContactUrl(page.html, opened);
    if (link) {
      contactUrl ??= link;
      push(link);
    }
    const own = found.some((email) => emailOnOwnHost(email, ownHost));
    if (own) break;
  }

  const email = chooseSiteEmail({ found, ownHost, current: candidate.email });
  if (email) return { ...candidate, email, contactUrl: undefined };
  return {
    ...candidate,
    email: "",
    contactUrl: contactUrl ?? home,
  };
}

async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await run(items[index]!);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Read each company site and copy a public email, or the contact page when the site shows none. */
export async function fillCandidateContacts(
  candidates: readonly GeminiCandidate[],
  evidence: GeminiEvidenceResult,
  fetchImpl: PageFetch = fetchPage,
): Promise<{ candidates: GeminiCandidate[]; filled: number; contactOnly: number }> {
  if (candidates.length === 0) return { candidates: [], filled: 0, contactOnly: 0 };
  const next = await mapPool(candidates, CONCURRENCY, (candidate) =>
    readCandidate(candidate, evidence, fetchImpl),
  );
  let filled = 0;
  let contactOnly = 0;
  for (let index = 0; index < candidates.length; index += 1) {
    const before = candidates[index]!.email.trim().toLowerCase();
    const after = next[index]!.email.trim().toLowerCase();
    if (after && after !== before) filled += 1;
    else if (!after && next[index]!.contactUrl) contactOnly += 1;
  }
  return { candidates: next, filled, contactOnly };
}

/** One homepage read per firm. A lead site, a closed site, or a page without the company name stays out. */
export async function screenCandidateSites(
  candidates: readonly GeminiCandidate[],
  evidence: GeminiEvidenceResult,
  fetchImpl: PageFetch = fetchPage,
): Promise<{
  candidates: GeminiCandidate[];
  drops: string[];
  filled: number;
  contactOnly: number;
}> {
  const judged = await mapPool(candidates, CONCURRENCY, async (candidate) => {
    const host = websiteHost(candidate.website);
    const home = publicHttpUrl(candidate.website);
    if (host && LEAD_HOST.test(host)) {
      return { drop: `${candidate.name}: lead site` as string | undefined, home, page: null as FetchedPage | null, candidate };
    }
    if (!host || !home) {
      return { drop: `${candidate.name}: site did not load`, home, page: null, candidate };
    }
    const page = await fetchImpl(home, PAGE_TIMEOUT_MS).catch(() => null);
    if (!page || !page.ok || pageBlocked(home, page.status, page.html, page.text)) {
      return { drop: `${candidate.name}: site did not load`, home, page: null, candidate };
    }
    if (!companyNameOnPage(candidate.name, page.text)) {
      return { drop: `${candidate.name}: name not on the company site`, home, page: null, candidate };
    }
    return { drop: undefined, home, page, candidate };
  });
  const kept: GeminiCandidate[] = [];
  const drops: string[] = [];
  const cache = new Map<string, FetchedPage>();
  for (const row of judged) {
    if (row.drop) {
      drops.push(row.drop);
      continue;
    }
    kept.push(row.candidate);
    if (row.home && row.page) cache.set(row.home, row.page);
  }
  const contact = await fillCandidateContacts(kept, evidence, async (url, timeoutMs) => {
    const key = publicHttpUrl(url);
    const cached = key ? cache.get(key) : undefined;
    if (cached) return cached;
    return fetchImpl(url, timeoutMs);
  });
  return {
    candidates: contact.candidates,
    drops,
    filled: contact.filled,
    contactOnly: contact.contactOnly,
  };
}
