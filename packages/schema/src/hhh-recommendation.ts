import { z } from "zod";
import { nationalDirectoryHost } from "./hhh-gemini-found";
import {
  HhhShortlistCompanySchema,
  PARTNER_FACT_TTL_MS,
  canonicalWebsite,
  websiteHost,
  type HhhShortlistCompany,
} from "./hhh-shortlist";
import { emailOnOwnHost } from "./site-email";
import { foldTradeLabel, tradeById, tradeLabel, TradeIdSchema, type TradeId } from "./trades";

/** A company domain must be at least this old before a recommendation is published. */
export const RECOMMENDATION_MIN_DOMAIN_YEARS = 5;

const FREE_MAIL = [
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "hotmail.nl",
  "outlook.com",
  "outlook.nl",
  "live.com",
  "live.nl",
  "ziggo.nl",
  "ziggo.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "yahoo.com",
  "yahoo.nl",
  "msn.com",
  "kpnmail.nl",
  "planet.nl",
  "hetnet.nl",
  "quicknet.nl",
  "tele2.nl",
  "online.nl",
  "casema.nl",
  "upcmail.nl",
  "chello.nl",
  "xs4all.nl",
  "solcon.nl",
  "zeelandnet.nl",
  "telfort.nl",
];

const PLATFORM_HOSTS = [
  "wix.com",
  "wixsite.com",
  "webador.com",
  "webador.nl",
  "jimdo.com",
  "jimdofree.com",
  "wordpress.com",
  "weebly.com",
  "webs.com",
  "square.site",
  "squarespace.com",
  "webnode.com",
  "webnode.nl",
  "jouwweb.nl",
  "carrd.co",
  "godaddysites.com",
  "myshopify.com",
];

const LEAD_HOSTS = ["werkspot.nl", "trustoo.nl", "zoofy.nl"];

/**
 * Area codes we match strictly. A place that is absent here still passes
 * when the site shows some geographic number; the job records area_unmapped.
 */
const AREA_CODES: Record<string, readonly string[]> = {
  lisse: ["0252"],
  hillegom: ["0252"],
  sassenheim: ["0252"],
  noordwijkerhout: ["0252"],
  voorhout: ["0252"],
  alkmaar: ["072"],
  haarlem: ["023"],
  leiden: ["071"],
  amsterdam: ["020"],
};

const TITLE_FILLER = new Set([
  "de",
  "het",
  "een",
  "van",
  "voor",
  "en",
  "uw",
  "ons",
  "home",
  "welkom",
  "contact",
  "bij",
  "met",
  "naar",
  "the",
  "and",
  "bv",
  "vof",
  "bedrijf",
  "officieel",
]);

const SERVICE_PHONE = /^(?:06|08[04578]|090|097)/;

export const HhhRecommendationRequestSchema = z
  .object({
    requestId: z.string().trim().min(1).max(120),
    postcode4: z
      .string()
      .trim()
      .regex(/^\d{4}$/)
      .optional(),
    gemeente: z.string().trim().min(2).max(80).optional(),
    tradeId: TradeIdSchema,
    name: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(8).max(24),
    email: z.string().trim().email().max(120),
  })
  .refine((value) => Boolean(value.postcode4 || value.gemeente), {
    message: "postcode4 or gemeente is required",
  });
export type HhhRecommendationRequest = z.infer<typeof HhhRecommendationRequestSchema>;

export const HhhRecommendationResultSchema = z
  .object({
    outcome: z.enum(["published", "withheld"]),
    company: HhhShortlistCompanySchema.nullable(),
    invite: z.enum(["queued", "skipped"]),
  })
  .refine((value) => value.outcome === "withheld" || value.company !== null, {
    message: "A published recommendation includes the company card",
  });
export type HhhRecommendationResult = z.infer<typeof HhhRecommendationResultSchema>;

function hostListed(host: string, list: readonly string[]): boolean {
  const name = host.replace(/^www\./i, "").toLowerCase();
  return list.some((item) => name === item || name.endsWith(`.${item}`));
}

function emailDomain(email: string): string | null {
  const at = email.trim().toLowerCase().lastIndexOf("@");
  if (at < 1) return null;
  const host = email.slice(at + 1).trim().replace(/^www\./, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return null;
  if (host.includes("..")) return null;
  return host;
}

/** The company site is the domain of the submitted address. A free mailbox has none. */
export function companySiteFromEmail(email: string):
  | { ok: true; host: string; website: string }
  | { ok: false; reason: "invalid_email" | "free_mail" | "platform_host" | "lead_host" } {
  const host = emailDomain(email);
  if (!host) return { ok: false, reason: "invalid_email" };
  if (hostListed(host, FREE_MAIL)) return { ok: false, reason: "free_mail" };
  if (hostListed(host, PLATFORM_HOSTS)) return { ok: false, reason: "platform_host" };
  if (hostListed(host, LEAD_HOSTS)) return { ok: false, reason: "lead_host" };
  const website = canonicalWebsite(host);
  if (!website) return { ok: false, reason: "invalid_email" };
  return { ok: true, host: websiteHost(website) ?? host, website };
}

export function tradeIdentityNames(tradeId: string): string[] {
  const trade = tradeById(tradeId);
  if (!trade) return [];
  return [trade.label, trade.label_en, ...trade.aliases];
}

/** Distinctive tokens of the submitted name appear on the page. */
export function companyNameOnPage(name: string, text: string): boolean {
  const foldedName = foldTradeLabel(name);
  const foldedText = foldTradeLabel(text);
  if (!foldedName || !foldedText) return false;
  if (foldedText.includes(foldedName)) return true;
  const tokens = foldedName.split(" ").filter((word) => word.length >= 4);
  if (tokens.length === 0) return false;
  const hits = tokens.filter((token) => foldedText.includes(token));
  return hits.length >= 1 && hits.length >= Math.ceil(tokens.length / 2);
}

/**
 * Place stuffed into the domain, or a title that is only the trade plus the place.
 * An address line that mentions the town is not this check.
 */
export function placeInSiteIdentity(args: {
  host: string;
  title: string;
  place: string;
  tradeNames: readonly string[];
}): boolean {
  const place = foldTradeLabel(args.place);
  if (place.length < 4) return false;
  const labels = args.host.split(".").slice(0, -1);
  const hostFold = foldTradeLabel(labels.join(" "));
  if (hostFold.includes(place)) return true;
  const title = foldTradeLabel(args.title);
  if (!title.includes(place)) return false;
  let rest = title.split(place).join(" ");
  const names = args.tradeNames
    .map((name) => foldTradeLabel(name))
    .filter((name) => name.length >= 4)
    .sort((left, right) => right.length - left.length);
  for (const folded of names) rest = rest.split(folded).join(" ");
  const words = rest.split(" ").filter((word) => word.length >= 3 && !TITLE_FILLER.has(word));
  return words.length === 0;
}

function normalizeNlPhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0031")) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith("31") && digits.length >= 11) digits = `0${digits.slice(2)}`;
  if (!digits.startsWith("0") || digits.length < 10) return null;
  return digits;
}

/** Geographic numbers on a page. Mobile and national switchboards are left out. */
export function geographicPhones(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/(?:\+31|0031|0)(?:[\s()./-]*\d){8,12}/g)) {
    const phone = normalizeNlPhone(match[0] ?? "");
    if (!phone || phone.length !== 10 || SERVICE_PHONE.test(phone)) continue;
    found.add(phone);
  }
  return [...found];
}

export function knownAreaCodes(place: string): readonly string[] | null {
  const key = foldTradeLabel(place);
  return AREA_CODES[key] ?? null;
}

export function phoneMatchesArea(phones: readonly string[], codes: readonly string[]): boolean {
  return phones.some((phone) => codes.some((code) => phone.startsWith(code)));
}

export function matchingGeographicPhone(
  phones: readonly string[],
  codes: readonly string[] | null,
): string | undefined {
  if (codes && codes.length > 0) {
    return phones.find((phone) => codes.some((code) => phone.startsWith(code)));
  }
  return phones[0];
}

export function registrationMillis(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const events = (payload as { events?: unknown }).events;
  if (!Array.isArray(events)) return null;
  for (const event of events) {
    if (!event || typeof event !== "object") continue;
    const row = event as { eventAction?: unknown; eventDate?: unknown };
    if (row.eventAction !== "registration" || typeof row.eventDate !== "string") continue;
    const at = Date.parse(row.eventDate);
    if (Number.isFinite(at)) return at;
  }
  return null;
}

export function domainAgeYears(registeredAtMs: number, now = Date.now()): number {
  return (now - registeredAtMs) / (365.25 * 24 * 60 * 60 * 1000);
}

export type RecommendationSignals = {
  siteLoaded: boolean;
  nameOnPage: boolean;
  tradeMatch: boolean;
  fakeLocal: boolean;
  leadHost: boolean;
  platformHost: boolean;
  geographicPhone: boolean;
  areaKnown: boolean;
  areaMatched: boolean;
  domainAgeYears: number | null;
  placeInIdentity: boolean;
  localMention: boolean;
};

export function decideRecommendation(signals: RecommendationSignals): {
  publish: boolean;
  status: "geverifieerd" | "lokaal_verbonden" | null;
  reasons: string[];
  notes: string[];
} {
  const reasons: string[] = [];
  const notes: string[] = [];
  if (signals.leadHost) reasons.push("lead_host");
  if (signals.platformHost) reasons.push("platform_host");
  if (!signals.siteLoaded) reasons.push("site_unreachable");
  else {
    if (!signals.nameOnPage) reasons.push("name_missing");
    if (!signals.tradeMatch) reasons.push("trade_mismatch");
    if (signals.fakeLocal) reasons.push("fake_local");
    if (signals.placeInIdentity) reasons.push("place_in_identity");
    if (!signals.geographicPhone) reasons.push("no_local_phone");
    else if (signals.areaKnown && !signals.areaMatched) reasons.push("area_mismatch");
    else if (!signals.areaKnown) notes.push("area_unmapped");
    if (signals.domainAgeYears == null) reasons.push("domain_age_unknown");
    else if (signals.domainAgeYears < RECOMMENDATION_MIN_DOMAIN_YEARS) {
      reasons.push("domain_too_young");
    }
  }
  const publish = reasons.length === 0;
  return {
    publish,
    status: publish ? (signals.localMention ? "lokaal_verbonden" : "geverifieerd") : null,
    reasons,
    notes,
  };
}

/** A club, association, or festivity page that names this company, not its own site or a directory. */
export function acceptLocalPage(args: {
  companyName: string;
  ownHost: string;
  url: string;
  text: string;
}): boolean {
  const host = websiteHost(args.url);
  const own = args.ownHost.replace(/^www\./i, "").toLowerCase();
  if (!host || !own) return false;
  if (host === own || host.endsWith(`.${own}`)) return false;
  if (nationalDirectoryHost(host)) return false;
  if (!args.text.trim()) return false;
  return companyNameOnPage(args.companyName, args.text);
}

export function inviteAddress(args: {
  submitted: string;
  ownHost: string;
  found: readonly string[];
}): string | null {
  const submitted = args.submitted.trim().toLowerCase();
  if (submitted && emailOnOwnHost(submitted, args.ownHost)) return submitted;
  return (
    args.found
      .map((email) => email.trim().toLowerCase())
      .find((email) => emailOnOwnHost(email, args.ownHost)) ?? null
  );
}

export function recommendationLetter(args: {
  to: string;
  place: string;
  company: string;
  tradeLabel: string;
}): { to: string; subject: string; text: string } {
  return {
    to: args.to,
    subject: `Een klant uit ${args.place} heeft ${args.company} aanbevolen`,
    text: [
      `Een klant uit ${args.place} heeft u aanbevolen voor ${args.tradeLabel}.`,
      "Wij nodigen u graag uit op HandyHouseHelp, zodat lokale klanten u vaker vinden en wij de klus beter bij u kunnen laten passen. Aanmelden is gratis.",
      "Onze missie is betrouwbare lokale servicespecialisten zoals u zichtbaar maken.",
      "Ga naar handyhousehelp.ai/bedrijven om u aan te melden.",
    ].join("\n\n"),
  };
}

export function inviteStillFresh(invitedAt: string | undefined, now = Date.now()): boolean {
  if (!invitedAt) return false;
  const at = Date.parse(invitedAt);
  return Number.isFinite(at) && now - at < PARTNER_FACT_TTL_MS;
}

export function recommendationKeepsSearchStatus(status: string | undefined): boolean {
  return status === "gevonden" || status === "geverifieerd" || status === "lokaal_verbonden";
}

export function recommendationCard(args: {
  id: string;
  name: string;
  place: string;
  website: string;
  phone?: string;
  email?: string;
  tradeId: TradeId;
  status: "geverifieerd" | "lokaal_verbonden";
  matchNote: string;
  evidence: HhhShortlistCompany["evidence"];
}): HhhShortlistCompany {
  const badges: HhhShortlistCompany["badges"] = ["aanbevolen"];
  if (args.status === "lokaal_verbonden") badges.push("lokaal_verbonden");
  return HhhShortlistCompanySchema.parse({
    id: args.id,
    name: args.name,
    place: args.place,
    website: args.website,
    phone: args.phone,
    email: args.email,
    tradeId: args.tradeId,
    tradeLabel: tradeLabel(args.tradeId),
    status: args.status,
    badges,
    score: args.status === "lokaal_verbonden" ? 2 : 1,
    matchNote: args.matchNote,
    evidence: args.evidence,
  });
}
