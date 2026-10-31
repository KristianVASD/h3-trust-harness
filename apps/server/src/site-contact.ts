import {
  chooseSiteEmail,
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
