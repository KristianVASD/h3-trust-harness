import { fetchPage, pageBlocked, sameHostServicesUrl } from "./address-search-fetch.js";
import { askAddressJson } from "./address-search-llm.js";
import {
  classifyLocalAuthenticity,
  decideAssessment,
  elementOverlap,
  jobFitScore,
  jobTermHits,
  matchNote,
  matchPageToTrades,
  passerStatus,
  tradeLabel,
  type ServiceContext,
  type TradeId,
} from "@h3-trust/schema";

export type CompanyAssessment = {
  pass: boolean;
  withholdReason?: string;
  status: "geverifieerd" | "lokaal_verbonden" | "gevonden";
  score: number;
  elementCodes: string[];
  elementOverlap: number;
  jobTermHits: number;
  capabilities: string[];
  serviceContexts: ServiceContext[];
  audienceMode?: "b2c" | "b2b" | "both";
  specialism?: string;
  profileSnippet: string;
  verdict: "real_local" | "thin_local" | "fake_local" | "unknown";
  reasons: string[];
  matchNote: string;
};

const CONTEXTS = new Set<ServiceContext>([
  "private",
  "hoa",
  "municipal",
  "commercial",
  "industrial",
]);

/**
 * Read one company website. Fake-local and a trade miss withhold the firm.
 * The same function is what a later neighbour recommendation will call.
 */
export async function assessCompany(args: {
  name: string;
  website: string;
  tradeId: TradeId;
  elementCodes: string[];
  jobText: string;
  woonplaats?: string;
  postcode4?: string;
  signal: "in_category" | "not_listed";
  model: string;
}): Promise<CompanyAssessment> {
  const page = await fetchPage(args.website);
  let text = page.ok && !pageBlocked(args.website, page.status, page.html, page.text) ? page.text : "";
  if (text) {
    const services = sameHostServicesUrl(page.html, page.url || args.website);
    if (services) {
      const extra = await fetchPage(services);
      if (extra.ok && !pageBlocked(services, extra.status, extra.html, extra.text)) {
        text = `${text}\n${extra.text}`.slice(0, 24000);
      }
    }
  }
  const siteLoaded = text.trim().length >= 40;
  const matched = siteLoaded ? matchPageToTrades(text) : matchPageToTrades("");
  let pageMatchesTrade = matched.tradeIds.includes(args.tradeId);
  let modelFocus = "";
  if (siteLoaded && !pageMatchesTrade && matched.tradeIds.length === 0) {
    const overlay = await askAddressJson(
      args.model,
      'JSON only: {"matchesTrade":true|false,"focus":"their specialty for this job, or empty"}',
      `Trade: ${args.tradeId}\nJob: ${args.jobText}\n\n${text.slice(0, 4000)}`,
    ).catch(() => null);
    pageMatchesTrade = overlay?.matchesTrade === true;
    if (typeof overlay?.focus === "string") modelFocus = overlay.focus.trim().slice(0, 120);
  }
  const verdict = classifyLocalAuthenticity({
    text,
    woonplaats: args.woonplaats,
    postcode4: args.postcode4,
    mentionedInEcology: args.signal === "in_category",
    hasCraft: pageMatchesTrade || matched.capabilities.length > 0,
  });
  const decision = decideAssessment({
    siteLoaded,
    pageMatchesTrade,
    verdict: verdict.verdict,
  });
  const foundCodes = matched.servicedElementCodes.filter((code) =>
    args.elementCodes.some((wanted) => wanted.toUpperCase() === code.toUpperCase()),
  );
  const overlap = elementOverlap(args.elementCodes, foundCodes);
  const focusText = [matched.specialism, modelFocus, ...matched.capabilities, text.slice(0, 1200)]
    .filter(Boolean)
    .join(" ");
  const terms = jobTermHits(args.jobText, focusText);
  const contexts = matched.serviceContexts.filter((id): id is ServiceContext => CONTEXTS.has(id));
  const status = decision.pass ? passerStatus(args.signal) : "gevonden";
  const focus = [matched.specialism, modelFocus, ...matched.capabilities].filter(
    (item): item is string => Boolean(item),
  );
  return {
    pass: decision.pass,
    withholdReason: decision.withholdReason,
    status,
    score: decision.pass ? jobFitScore({ signal: args.signal, elementOverlap: overlap, jobTermHits: terms }) : 0,
    elementCodes: foundCodes,
    elementOverlap: overlap,
    jobTermHits: terms,
    capabilities: matched.capabilities,
    serviceContexts: contexts,
    audienceMode: matched.audienceMode,
    specialism: matched.specialism,
    profileSnippet: text.replace(/\s+/g, " ").trim().slice(0, 240),
    verdict: verdict.verdict,
    reasons: verdict.reasons,
    matchNote: matchNote(args.name, tradeLabel(args.tradeId), focus.length > 0 ? focus : foundCodes),
  };
}
