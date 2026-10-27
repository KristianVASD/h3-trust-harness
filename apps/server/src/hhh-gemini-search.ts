import {
  foldTradeLabel,
  GeminiCheckSchema,
  reviewFoundFirms,
  websiteHost,
  type GeminiCandidate,
  type GeminiCheck,
} from "@h3-trust/schema";
import { parseJsonObject } from "./address-search-llm.js";

type Annotation = {
  type?: string;
  url_citation?: { url?: string };
};

const SHORTLIST_MODEL = "deepseek/deepseek-v4.1-flash-1017";

function geminiModel(): string {
  return process.env.HHH_GEMINI_MODEL?.trim() || SHORTLIST_MODEL;
}

function collectUrls(payload: unknown): string[] {
  const urls = new Set<string>();
  const walk = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    const record = value as Record<string, unknown>;
    for (const [key, child] of Object.entries(record)) {
      if (key === "url" && typeof child === "string") urls.add(child);
      if (key === "url_citation" && child && typeof child === "object") {
        const cited = (child as { url?: string }).url;
        if (cited) urls.add(cited);
      }
      if (key === "website") continue;
      walk(child);
    }
  };
  walk(payload);
  return [...urls];
}

async function complete(body: Record<string, unknown>): Promise<{ content: string; urls: string[] }> {
  const key = (process.env.OPENROUTER_API_KEY ?? "").trim();
  if (!key) throw new Error("OPENROUTER_API_KEY is not set");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.H3_API_BASE ?? "https://h3-trust-harness.vercel.app",
      "X-Title": "H3 Trust Harness",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 300)}`);
  }
  const payload = (await res.json()) as {
    choices?: Array<{ message?: { content?: string; annotations?: Annotation[] } }>;
  };
  const message = payload.choices?.[0]?.message;
  const content = message?.content?.trim() ?? "";
  const urls = collectUrls({
    annotations: message?.annotations ?? [],
    content: content.replace(/"website"\s*:\s*"[^"]*"/g, ""),
  });
  for (const annotation of message?.annotations ?? []) {
    const url = annotation.url_citation?.url;
    if (url) urls.push(url);
  }
  return { content, urls };
}

async function ask(
  messages: { role: string; content: string }[],
  maxResults = 5,
): Promise<{ content: string; urls: string[] }> {
  const model = geminiModel();
  const withWeb = {
    model,
    messages,
    plugins: [{ id: "web", max_results: maxResults }],
    provider: { sort: "price" },
    temperature: 0.1,
    max_tokens: 4000,
    reasoning: { enabled: false },
  };
  try {
    return await complete(withWeb);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("OpenRouter 400")) throw err;
    const online = model.endsWith(":online") ? model : `${model}:online`;
    return complete({
      model: online,
      messages,
      temperature: 0.1,
      max_tokens: 4000,
      reasoning: { enabled: false },
    });
  }
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function textList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function firstText(row: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = asText(row[key]);
    if (value) return value;
  }
  return "";
}

/** Read the model list. A missing website stays empty so a phone or address can still be kept. */
export function proposedCandidates(raw: Record<string, unknown>): GeminiCandidate[] {
  const list = Array.isArray(raw.companies) ? raw.companies : [];
  const out: GeminiCandidate[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const name = firstText(row, ["name", "naam"]);
    if (!name) continue;
    out.push({
      name,
      website: firstText(row, ["website", "url", "site"]),
      address: firstText(row, ["address", "adres"]),
      phone: firstText(row, ["phone", "telefoon"]),
      email: firstText(row, ["email", "e-mail"]),
      candidateBasis: textList(row.candidate_basis ?? row.candidateBasis),
      riskFlags: textList(row.risk_flags ?? row.riskFlags),
    });
  }
  return out;
}

/**
 * First question: up to ten plausible local firms. This is discovery, not proof.
 */
export async function findLocalCompanies(args: {
  tradeLabel: string;
  jobText: string;
  place: string;
}): Promise<{ companies: GeminiCandidate[]; skipped: string[]; raw: string; parsed: boolean }> {
  const jobLine = args.jobText.trim() || `particulier onderhoud door een ${args.tradeLabel.toLowerCase()}`;
  const messages = [
    {
      role: "system",
      content: [
        "Maak een kandidatenlijst, geen betrouwbaarheidsoordeel.",
        "Vind maximaal 10 echte vakbedrijven die fysiek gevestigd zijn in of nabij de gevraagde plaats en de klus voor particulieren uitvoeren.",
        "Geef voorkeur aan een unieke bedrijfsnaam, eigen website, volledig vestigingsadres, lokaal of direct 06-nummer, zichtbare eigenaar/team/historie en diensten die bij de klus passen.",
        "Noteer als risk_flags: een generieke vak-plus-plaatsnaam, veel plaats-landingspagina's, vage bedrijfsidentiteit, virtueel of postadres, landelijke doorschakeling en een 085/088-nummer.",
        "Een 085/088-nummer is alleen een waarschuwing en nooit op zichzelf een reden om het bedrijf weg te laten.",
        "Geen tussenpersonen, vergelijkers of offerteplatforms. Gebruik de eigen website als je die vond en verzin geen bedrijf of URL.",
        "Een bedrijf zonder website mag terug met telefoonnummer en adres. Geef minder dan 10 als er onvoldoende aannemelijke kandidaten zijn.",
        'Antwoord alleen met JSON: {"companies":[{"name":"","address":"","website":"","phone":"","email":"","candidate_basis":[""],"risk_flags":[""]}]}',
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Plaats: ${args.place}`,
        `Vak: ${args.tradeLabel}`,
        `Klus: ${jobLine}`,
        "Vind lokale bedrijven die een huishouden hiervoor kan inhuren.",
      ].join("\n"),
    },
  ];
  const { content } = await ask(messages, 10);
  if (!content) {
    throw new Error("Find step returned no company list. The model used the whole reply before the JSON.");
  }
  let proposed: GeminiCandidate[] = [];
  let raw = "";
  let parsed = true;
  try {
    proposed = proposedCandidates(parseJsonObject(content));
  } catch {
    raw = content.slice(0, 500);
    parsed = false;
  }
  const reviewed = reviewFoundFirms(proposed);
  if (reviewed.kept.length === 0 && !raw) raw = content.slice(0, 500);
  return { companies: reviewed.kept, skipped: reviewed.skipped, raw, parsed };
}

function citationKey(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const path = url.pathname.replace(/\/+$/, "") || "/";
    return `${url.hostname.replace(/^www\./i, "").toLowerCase()}${path}`;
  } catch {
    return null;
  }
}

/** Keep only source URLs returned by the web-search citation layer. */
export function filterCheckToCitations(check: GeminiCheck, citations: readonly string[]): GeminiCheck {
  const cited = new Set(citations.map(citationKey).filter((key): key is string => Boolean(key)));
  const sources = check.sources.filter((source) => {
    const key = citationKey(source.url);
    return Boolean(key && cited.has(key) && websiteHost(source.url));
  });
  const sourceIds = new Set(sources.map((source) => source.id));
  const companies = check.companies.flatMap((company) => {
    const companyName = foldTradeLabel(company.name);
    const claims = company.claims
      .map((claim) => ({
        ...claim,
        source_ids: claim.source_ids.filter((id) => sourceIds.has(id)),
      }))
      .filter((claim) => {
        const observed = foldTradeLabel(claim.observed_name ?? "");
        if (!observed || !companyName) return false;
        const sameName =
          observed === companyName ||
          (observed.length >= 8 &&
            companyName.length >= 8 &&
            (observed.includes(companyName) || companyName.includes(observed)));
        return claim.source_ids.length > 0 && sameName;
      });
    return claims.length > 0 ? [{ ...company, claims }] : [];
  });
  return { ...check, sources, companies };
}

/** Second question: accepted local structures only. A missing company means no mention. */
export async function checkLocalMentions(args: {
  place: string;
  tradeLabel: string;
  companies: readonly GeminiCandidate[];
}): Promise<GeminiCheck> {
  const names = args.companies.map((company) => ({
    name: company.name,
    website: company.website,
    address: company.address,
    place: args.place,
  }));
  const messages = [
    {
      role: "system",
      content: [
        "Controleer de bedrijven uitsluitend op officiële openbare pagina's van lokale ondernemersverenigingen of coöperaties, plaatselijke sportclubs en plaatselijke jaarfeesten, braderieën, kermissen of feestcommissies.",
        "Geef een bedrijf alleen terug als zijn bedrijfsnaam daadwerkelijk op zo'n pagina staat als lid, sponsor, deelnemer of organisator.",
        "Leid een relatie niet af uit alleen een adres of vestigingsplaats. Gebruik uitsluitend de drie genoemde soorten lokale organisaties.",
        "Geef alleen positieve treffers en verzin geen URL of relatie. Een bedrijf zonder treffer laat je weg.",
        "kind is ov, sport of festivity. outcome is member, sponsor of mentioned. about is company.",
        "category is local_business_association, sports_club, football_club, sponsorship of festivity. scope is local.",
        'Antwoord alleen met JSON: {"place":"","trade":"","checked_on":"","sources":[{"id":"s1","name":"","url":"","category":"sports_club","scope":"local","place":"","description":"","list_public":true}],"companies":[{"name":"","place":"","phone":"","email":"","website":"","claims":[{"kind":"sport","outcome":"sponsor","about":"company","org_name":"","relation":"","observed_name":"","source_ids":["s1"],"pages_checked":[],"note":null}]}]}',
      ]
        .join("\n"),
    },
    {
      role: "user",
      content: [
        `Plaats: ${args.place}`,
        `Vak: ${args.tradeLabel}`,
        `Bedrijven: ${JSON.stringify(names)}`,
        "Geef alleen bedrijven terug waarvan de naam op een toegestane lokale organisatiepagina staat.",
      ].join("\n"),
    },
  ];
  const { content, urls } = await ask(messages, 10);
  const parsed = GeminiCheckSchema.safeParse(parseJsonObject(content));
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Gemini check JSON was not usable");
  }
  return filterCheckToCitations(parsed.data, urls);
}
