import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  HhhRecommendationResultSchema,
  acceptLocalPage,
  companiesWithLocalMention,
  companyNameOnPage,
  companySiteFromEmail,
  decideRecommendation,
  domainAgeYears,
  emailsInPage,
  geographicPhones,
  inviteAddress,
  knownAreaCodes,
  matchingGeographicPhone,
  phoneMatchesArea,
  placeInSiteIdentity,
  recommendationCard,
  recommendationLetter,
  registrationMillis,
  tradeIdentityNames,
  tradeLabel,
  type HhhRecommendationResult,
  type RecommendationSignals,
  type TradeId,
} from "@h3-trust/schema";
import type { Store } from "@h3-trust/store";
import { fetchPage, pageBlocked } from "./address-search-fetch.js";
import { assessCompany } from "./company-assess.js";
import { checkLocalMentions } from "./hhh-gemini-search.js";
import { getPartnerJob, savePartnerJob } from "./hhh-shortlist-jobs.js";
import { storeRecommendation } from "./hhh-shortlist-persist.js";
import type { PlaceCellStore } from "./place-cell-store.js";

const STALE_MS = 90_000;

type RecommendStage = "resolve" | "site" | "gates" | "mention" | "store" | "done";

type LocalMention = {
  kind: "ov" | "sport" | "festivity";
  url: string;
  sourceName: string;
};

type RecommendPayload = {
  route: "recommend-check";
  requestId: string;
  postcode4?: string;
  gemeente?: string;
  woonplaats?: string;
  placeLabel: string;
  lat: number;
  lon: number;
  tradeId: TradeId;
  name: string;
  phone: string;
  email: string;
  stage: RecommendStage;
  lock?: string;
  lockAt?: string;
  website: string;
  host: string;
  pageTitle: string;
  foundEmails: string[];
  phones: string[];
  listedPhone: string;
  inviteTo: string;
  siteLoaded: boolean;
  nameOnPage: boolean;
  tradeMatch: boolean;
  fakeLocal: boolean;
  geographicPhone: boolean;
  areaKnown: boolean;
  areaMatched: boolean;
  domainAgeYears: number | null;
  placeInIdentity: boolean;
  earlyReason?: string;
  localMention: LocalMention | null;
  reasons: string[];
  notes: string[];
  letter?: { to: string; subject: string; text: string };
  result?: HhhRecommendationResult;
  progress: string[];
  lastError?: string;
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function pageTitle(html: string): string {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return (match?.[1] ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

export function readRecommendPayload(raw: Record<string, unknown>): RecommendPayload | null {
  if (raw.route !== "recommend-check") return null;
  const tradeId = asString(raw.tradeId);
  const name = asString(raw.name);
  const email = asString(raw.email);
  if (!tradeId || !name || !email) return null;
  const stages: RecommendStage[] = ["resolve", "site", "gates", "mention", "store", "done"];
  const stage = stages.includes(raw.stage as RecommendStage)
    ? (raw.stage as RecommendStage)
    : "resolve";
  const local = raw.localMention;
  let localMention: LocalMention | null = null;
  if (local && typeof local === "object") {
    const row = local as Record<string, unknown>;
    const kind = row.kind;
    const url = asString(row.url);
    const sourceName = asString(row.sourceName);
    if (
      url &&
      sourceName &&
      (kind === "ov" || kind === "sport" || kind === "festivity")
    ) {
      localMention = { kind, url, sourceName };
    }
  }
  const letter = raw.letter;
  let storedLetter: RecommendPayload["letter"];
  if (letter && typeof letter === "object") {
    const row = letter as Record<string, unknown>;
    const to = asString(row.to);
    const subject = asString(row.subject);
    const text = asString(row.text);
    if (to && subject && text) storedLetter = { to, subject, text };
  }
  const parsedResult = HhhRecommendationResultSchema.safeParse(raw.result);
  return {
    route: "recommend-check",
    requestId: asString(raw.requestId) ?? "",
    postcode4: asString(raw.postcode4),
    gemeente: asString(raw.gemeente),
    woonplaats: asString(raw.woonplaats),
    placeLabel: asString(raw.placeLabel) ?? "NL",
    lat: typeof raw.lat === "number" ? raw.lat : 0,
    lon: typeof raw.lon === "number" ? raw.lon : 0,
    tradeId: tradeId as TradeId,
    name,
    phone: asString(raw.phone) ?? "",
    email,
    stage,
    lock: asString(raw.lock),
    lockAt: asString(raw.lockAt),
    website: asString(raw.website) ?? "",
    host: asString(raw.host) ?? "",
    pageTitle: asString(raw.pageTitle) ?? "",
    foundEmails: asStringList(raw.foundEmails).slice(0, 12),
    phones: asStringList(raw.phones).slice(0, 8),
    listedPhone: asString(raw.listedPhone) ?? "",
    inviteTo: asString(raw.inviteTo) ?? "",
    siteLoaded: raw.siteLoaded === true,
    nameOnPage: raw.nameOnPage === true,
    tradeMatch: raw.tradeMatch === true,
    fakeLocal: raw.fakeLocal === true,
    geographicPhone: raw.geographicPhone === true,
    areaKnown: raw.areaKnown === true,
    areaMatched: raw.areaMatched === true,
    domainAgeYears: typeof raw.domainAgeYears === "number" ? raw.domainAgeYears : null,
    placeInIdentity: raw.placeInIdentity === true,
    earlyReason: asString(raw.earlyReason),
    localMention,
    reasons: asStringList(raw.reasons).slice(0, 12),
    notes: asStringList(raw.notes).slice(0, 8),
    letter: storedLetter,
    result: parsedResult.success ? parsedResult.data : undefined,
    progress: asStringList(raw.progress).slice(-30),
    lastError: asString(raw.lastError),
  };
}

function note(payload: RecommendPayload, message: string): void {
  payload.progress = [...payload.progress, message].slice(-30);
}

function canRun(payload: RecommendPayload, incoming?: string): boolean {
  const at = payload.lockAt ? Date.parse(payload.lockAt) : Number.NaN;
  const fresh = Boolean(payload.lock) && Number.isFinite(at) && Date.now() - at < STALE_MS;
  if (!fresh) return true;
  return Boolean(incoming) && incoming === payload.lock;
}

function modelName(): string {
  return process.env.OPENROUTER_MODEL?.trim() || "minimax/minimax-m3:free";
}

function placeName(payload: RecommendPayload): string {
  return payload.woonplaats || payload.placeLabel || payload.gemeente || "NL";
}

async function readDomainRegistration(host: string): Promise<number | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(host)}`, {
      signal: ctrl.signal,
      headers: { Accept: "application/rdap+json, application/json" },
    });
    if (!res.ok) return null;
    return registrationMillis(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function signalsOf(payload: RecommendPayload, localMention: boolean): RecommendationSignals {
  return {
    siteLoaded: payload.siteLoaded,
    nameOnPage: payload.nameOnPage,
    tradeMatch: payload.tradeMatch,
    fakeLocal: payload.fakeLocal,
    leadHost: false,
    platformHost: false,
    geographicPhone: payload.geographicPhone,
    areaKnown: payload.areaKnown,
    areaMatched: payload.areaMatched,
    domainAgeYears: payload.domainAgeYears,
    placeInIdentity: payload.placeInIdentity,
    localMention,
  };
}

async function resolveSite(payload: RecommendPayload): Promise<void> {
  const site = companySiteFromEmail(payload.email);
  if (!site.ok) {
    payload.earlyReason = site.reason;
    payload.reasons = [site.reason];
    payload.stage = "store";
    note(payload, `No company site: ${site.reason}.`);
    return;
  }
  payload.host = site.host;
  payload.website = site.website;
  payload.stage = "site";
  note(payload, `Checking ${site.host}.`);
}

async function readSite(payload: RecommendPayload): Promise<void> {
  const page = await fetchPage(payload.website);
  const usable =
    page.ok &&
    !pageBlocked(page.url || payload.website, page.status, page.html, page.text) &&
    page.text.trim().length >= 40;
  if (usable) {
    payload.pageTitle = pageTitle(page.html);
    payload.foundEmails = emailsInPage(page.html).slice(0, 12);
    payload.phones = geographicPhones(page.text);
    payload.nameOnPage = companyNameOnPage(payload.name, page.text);
  }
  const assessment = await assessCompany({
    name: payload.name,
    website: payload.website,
    tradeId: payload.tradeId,
    elementCodes: [],
    jobText: "",
    woonplaats: payload.woonplaats || payload.placeLabel,
    postcode4: payload.postcode4,
    signal: "not_listed",
    model: modelName(),
  });
  if (assessment.withholdReason === "site_unreachable") {
    payload.siteLoaded = false;
    payload.tradeMatch = false;
    payload.fakeLocal = false;
  } else {
    payload.siteLoaded = true;
    payload.fakeLocal = assessment.verdict === "fake_local";
    payload.tradeMatch = assessment.withholdReason !== "trade_mismatch";
    if (!payload.nameOnPage && usable) {
      payload.nameOnPage = companyNameOnPage(payload.name, assessment.profileSnippet);
    }
  }
  payload.stage = "gates";
  note(payload, payload.siteLoaded ? "Site read." : "Site could not be read.");
}

async function applyGates(payload: RecommendPayload): Promise<void> {
  const place = placeName(payload);
  payload.inviteTo =
    inviteAddress({
      submitted: payload.email,
      ownHost: payload.host,
      found: payload.foundEmails,
    }) ?? "";
  if (payload.siteLoaded) {
    const registered = await readDomainRegistration(payload.host);
    payload.domainAgeYears = registered == null ? null : domainAgeYears(registered);
    const codes = knownAreaCodes(place);
    payload.areaKnown = Boolean(codes);
    payload.areaMatched = codes ? phoneMatchesArea(payload.phones, codes) : false;
    payload.geographicPhone = payload.phones.length > 0;
    payload.listedPhone =
      matchingGeographicPhone(payload.phones, codes) ?? payload.phones[0] ?? "";
    payload.placeInIdentity = placeInSiteIdentity({
      host: payload.host,
      title: payload.pageTitle,
      place,
      tradeNames: tradeIdentityNames(payload.tradeId),
    });
  }
  const preview = decideRecommendation(signalsOf(payload, false));
  payload.reasons = preview.reasons;
  payload.notes = preview.notes;
  payload.stage = preview.publish ? "mention" : "store";
  note(
    payload,
    preview.publish ? "Fraud gate open." : `Fraud gate closed: ${preview.reasons.join(", ")}.`,
  );
}

async function readMention(payload: RecommendPayload): Promise<void> {
  try {
    const check = await checkLocalMentions({
      place: placeName(payload),
      tradeLabel: tradeLabel(payload.tradeId),
      companies: [
        {
          name: payload.name,
          website: payload.website,
          address: "",
          phone: payload.phone,
          email: payload.email,
        },
      ],
    });
    const found = companiesWithLocalMention(
      [
        {
          name: payload.name,
          website: payload.website,
          address: "",
          phone: payload.phone,
          email: payload.email,
        },
      ],
      check,
    );
    for (const hit of (found[0]?.hits ?? []).slice(0, 4)) {
      if (hit.kind !== "ov" && hit.kind !== "sport" && hit.kind !== "festivity") continue;
      const page = await fetchPage(hit.url);
      if (!page.ok || pageBlocked(page.url || hit.url, page.status, page.html, page.text)) {
        continue;
      }
      const landed = page.url || hit.url;
      if (
        acceptLocalPage({
          companyName: payload.name,
          ownHost: payload.host,
          url: hit.url,
          text: page.text,
        }) &&
        acceptLocalPage({
          companyName: payload.name,
          ownHost: payload.host,
          url: landed,
          text: page.text,
        })
      ) {
        payload.localMention = { kind: hit.kind, url: hit.url, sourceName: hit.sourceName };
        break;
      }
    }
  } catch (err) {
    note(
      payload,
      err instanceof Error ? err.message : "Local mention check did not return a page.",
    );
  }
  payload.stage = "store";
  note(
    payload,
    payload.localMention
      ? `Local page: ${payload.localMention.sourceName}.`
      : "No local page. Card stays geverifieerd if the gate is open.",
  );
}

async function publish(args: {
  store: Store;
  cells: PlaceCellStore;
  payload: RecommendPayload;
}): Promise<void> {
  const payload = args.payload;
  const observedAt = new Date().toISOString();
  if (!payload.website || payload.earlyReason) {
    payload.result = HhhRecommendationResultSchema.parse({
      outcome: "withheld",
      company: null,
      invite: "skipped",
    });
    payload.stage = "done";
    note(payload, "Withheld. No invitation.");
    return;
  }
  const decision = decideRecommendation(signalsOf(payload, Boolean(payload.localMention)));
  payload.reasons = decision.reasons;
  payload.notes = decision.notes;
  const place = placeName(payload);
  const matchNote = payload.localMention
    ? `Vermeld bij ${payload.localMention.sourceName}.`
    : `Aanbevolen door een klant uit ${place}.`;
  const stored = await storeRecommendation({
    store: args.store,
    cells: args.cells,
    place: {
      postcode4: payload.postcode4,
      gemeente: payload.gemeente,
      woonplaats: payload.woonplaats,
      placeLabel: payload.placeLabel,
      lat: payload.lat,
      lon: payload.lon,
      tradeId: payload.tradeId,
    },
    row: {
      name: payload.name,
      website: payload.website,
      phone: payload.listedPhone || payload.phone,
      email: payload.inviteTo || payload.email,
      publish: decision.publish,
      matchNote,
      local: payload.localMention,
      queueInvite: Boolean(payload.inviteTo),
    },
    observedAt,
  });
  if (stored.invite === "queued" && payload.inviteTo) {
    payload.letter = recommendationLetter({
      to: payload.inviteTo,
      place,
      company: payload.name,
      tradeLabel: tradeLabel(payload.tradeId),
    });
  }
  const company =
    decision.publish && decision.status && stored.id
      ? recommendationCard({
          id: stored.id,
          name: payload.name,
          place,
          website: payload.website,
          phone: payload.listedPhone || undefined,
          email: payload.inviteTo || undefined,
          tradeId: payload.tradeId,
          status: decision.status,
          matchNote,
          evidence: [
            { kind: "website", url: payload.website, observedAt },
            ...(payload.localMention
              ? [
                  {
                    kind: payload.localMention.kind,
                    sourceName: payload.localMention.sourceName,
                    url: payload.localMention.url,
                    observedAt,
                  },
                ]
              : []),
          ],
        })
      : null;
  payload.result = HhhRecommendationResultSchema.parse({
    outcome: company ? "published" : "withheld",
    company,
    invite: stored.invite,
  });
  payload.stage = "done";
  note(
    payload,
    company
      ? `Published as ${decision.status}. Invite ${stored.invite}.`
      : `Withheld. Invite ${stored.invite}.`,
  );
}

export async function runRecommendationSlice(args: {
  admin: SupabaseClient;
  store: Store;
  cells: PlaceCellStore;
  jobId: string;
  lock?: string;
  release?: boolean;
}): Promise<{ continue: boolean; lock?: string }> {
  const job = await getPartnerJob(args.admin, args.jobId);
  if (!job || job.status === "ready" || job.status === "failed") return { continue: false };
  const payload = readRecommendPayload(job.payload);
  if (!payload) return { continue: false };
  if (!canRun(payload, args.lock)) return { continue: false };
  const lock = randomUUID();
  payload.lock = lock;
  payload.lockAt = new Date().toISOString();
  await savePartnerJob(args.admin, {
    id: job.id,
    status: "running",
    payload: { ...payload },
    publicResult: null,
  });
  try {
    if (payload.stage === "resolve") await resolveSite(payload);
    else if (payload.stage === "site") await readSite(payload);
    else if (payload.stage === "gates") await applyGates(payload);
    else if (payload.stage === "mention") await readMention(payload);
    else if (payload.stage === "store") {
      await publish({ store: args.store, cells: args.cells, payload });
    } else payload.stage = "done";
    const done = payload.stage === "done";
    if (done) {
      payload.lock = undefined;
      payload.lockAt = undefined;
      await savePartnerJob(args.admin, {
        id: job.id,
        status: "ready",
        payload: { ...payload },
        publicResult: payload.result ?? null,
      });
      return { continue: false };
    }
    await savePartnerJob(args.admin, {
      id: job.id,
      status: "running",
      payload: { ...payload },
      publicResult: null,
    });
    if (args.release) {
      payload.lock = undefined;
      payload.lockAt = undefined;
      await savePartnerJob(args.admin, {
        id: job.id,
        status: "running",
        payload: { ...payload },
        publicResult: null,
      });
    }
    return { continue: true, lock: args.release ? undefined : lock };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Recommendation step failed";
    console.error("[hhh-recommend]", message);
    payload.lock = undefined;
    payload.lastError = message;
    note(payload, message);
    await savePartnerJob(args.admin, {
      id: job.id,
      status: "failed",
      payload: { ...payload },
      publicResult: null,
    });
    return { continue: false };
  }
}
