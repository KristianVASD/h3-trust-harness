import {
  foldTradeLabel,
  GeminiCheckSchema,
  GeminiEvidenceResultSchema,
  GeminiLandscapeSchema,
  GeminiReviewSchema,
  GeminiSourceCandidatesSchema,
  reviewFoundFirms,
  websiteHost,
  type GeminiCandidate,
  type GeminiCheck,
  type GeminiEvidenceResult,
  type GeminiLandscape,
  type GeminiReview,
  type GeminiUsage,
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

type Completion = {
  content: string;
  urls: string[];
  usage: GeminiUsage;
  cutOff: boolean;
};

/** Reply room for a test run. The model is not told this number. */
const OUTPUT_TOKENS = 20_000;

function readUsage(value: unknown): GeminiUsage {
  const row =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const promptTokens = typeof row.prompt_tokens === "number" ? row.prompt_tokens : 0;
  const completionTokens =
    typeof row.completion_tokens === "number" ? row.completion_tokens : 0;
  const totalTokens =
    typeof row.total_tokens === "number"
      ? row.total_tokens
      : promptTokens + completionTokens;
  return { promptTokens, completionTokens, totalTokens };
}

async function complete(body: Record<string, unknown>): Promise<Completion> {
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
    choices?: Array<{
      finish_reason?: string;
      message?: { content?: string; annotations?: Annotation[] };
    }>;
    usage?: unknown;
  };
  const choice = payload.choices?.[0];
  const message = choice?.message;
  const content = message?.content?.trim() ?? "";
  const urls = collectUrls({
    annotations: message?.annotations ?? [],
    content: content.replace(/"website"\s*:\s*"[^"]*"/g, ""),
  });
  for (const annotation of message?.annotations ?? []) {
    const url = annotation.url_citation?.url;
    if (url) urls.push(url);
  }
  return {
    content,
    urls: [...new Set(urls)],
    usage: readUsage(payload.usage),
    cutOff: choice?.finish_reason === "length",
  };
}

async function ask(
  messages: { role: string; content: string }[],
  options: { maxResults?: number; maxTokens?: number } = {},
): Promise<Completion> {
  const model = geminiModel();
  const withWeb = {
    model,
    messages,
    plugins: [{ id: "web", max_results: options.maxResults ?? 5 }],
    provider: { sort: "price" },
    temperature: 0.1,
    max_tokens: options.maxTokens ?? OUTPUT_TOKENS,
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
      max_tokens: options.maxTokens ?? OUTPUT_TOKENS,
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
}): Promise<{
  companies: GeminiCandidate[];
  skipped: string[];
  raw: string;
  parsed: boolean;
  usage: GeminiUsage;
  cutOff: boolean;
}> {
  const jobLine =
    args.jobText.trim() ||
    `particulier onderhoud door een ${args.tradeLabel.toLowerCase()}`;
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
  const { content, usage, cutOff } = await ask(messages, { maxResults: 10 });
  if (!content) {
    throw new Error(
      "Find step returned no company list. The model used the whole reply before the JSON.",
    );
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
  return {
    companies: reviewed.kept,
    skipped: reviewed.skipped,
    raw,
    parsed,
    usage,
    cutOff,
  };
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
export function filterCheckToCitations(
  check: GeminiCheck,
  citations: readonly string[],
): GeminiCheck {
  const cited = new Set(
    citations.map(citationKey).filter((key): key is string => Boolean(key)),
  );
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

function citationSet(citations: readonly string[]): Set<string> {
  return new Set(citations.map(citationKey).filter((key): key is string => Boolean(key)));
}

function isCited(url: string, citations: Set<string>): boolean {
  const key = citationKey(url);
  return Boolean(key && citations.has(key));
}

export function filterLandscapeToCitations(
  landscape: GeminiLandscape,
  citations: readonly string[],
): GeminiLandscape {
  const cited = citationSet(citations);
  return {
    sources: landscape.sources.filter(
      (source) => isCited(source.url, cited) && !nationalDirectoryHostSafe(source.url),
    ),
  };
}

export function filterEvidenceToCitations(
  evidence: GeminiEvidenceResult,
  citations: readonly string[],
): GeminiEvidenceResult {
  const cited = citationSet(citations);
  return {
    companies: evidence.companies
      .map((company) => ({
        ...company,
        claims: company.claims.filter((claim) => isCited(claim.source_url, cited)),
      }))
      .filter((company) => company.claims.length > 0),
  };
}

export async function findGeminiLandscape(args: {
  place: string;
  tradeLabel: string;
  jobText: string;
}): Promise<{ landscape: GeminiLandscape; usage: GeminiUsage; cutOff: boolean }> {
  const messages = [
    {
      role: "system",
      content: [
        "Breng uitsluitend het openbare bronnenlandschap in kaart; beoordeel nog geen specifieke bedrijven.",
        "Zoek concrete officiële leden-, sponsor-, partner-, zoek- of registerpagina's die bedrijven kunnen bevatten.",
        "Zoek lokale ondernemers- en bedrijvenverenigingen, bedrijventerreinen, coöperaties, sportclubs, lokale evenementen en relevante officiële branche-, vak-, erkennings- en certificeringsregisters.",
        "Een branche- of vakregister is national of regional en is professioneel bewijs, nooit automatisch lokale verankering.",
        "Gebruik alleen werkelijk gevonden URL's. Geen telefoongidsen, vergelijkers, offerteplatforms, sociale media of algemene zoekresultaatpagina's.",
        'Antwoord alleen met JSON: {"sources":[{"id":"s1","name":"","url":"https://","kind":"local_business_association","scope":"local","place":"","listing_type":"members","why_relevant":"","observed_on":"YYYY-MM-DD"}]}',
      ].join("\n"),
    },
    {
      role: "user",
      content: `Plaats: ${args.place}\nVak: ${args.tradeLabel}\nKlus: ${args.jobText}\nVind maximaal 12 bruikbare openbare bronnen.`,
    },
  ];
  const { content, urls, usage, cutOff } = await ask(messages, { maxResults: 12 });
  const parsed = GeminiLandscapeSchema.parse(parseJsonObject(content));
  return {
    landscape: filterLandscapeToCitations(parsed, urls),
    usage,
    cutOff,
  };
}

function nationalDirectoryHostSafe(url: string): boolean {
  const host = websiteHost(url);
  return Boolean(
    host &&
    /(?:telefoonboek|telefoongids|goudengids|bedrijvenregister|trustpilot|werkspot|trustoo|zoofy)\./i.test(
      host,
    ),
  );
}

export async function checkGeminiCandidateEvidence(args: {
  place: string;
  tradeLabel: string;
  jobText: string;
  candidates: readonly GeminiCandidate[];
  landscape: GeminiLandscape;
}): Promise<{ evidence: GeminiEvidenceResult; usage: GeminiUsage; cutOff: boolean }> {
  const messages = [
    {
      role: "system",
      content: [
        "Onderzoek iedere opgegeven kandidaat gericht met websearch en de meegegeven bronnenkaart.",
        "Controleer lokale vermeldingen, officiële professionele aansluiting, identiteit/vestiging, klusmatch en concrete tegenstrijdigheden.",
        "Een landelijke branchevereniging is professional_connection en nooit local_connection.",
        "Geef alleen positieve bevestigingen of concrete conflicten. Niets gevonden is onbekend en geen negatieve conclusie.",
        "Elke claim moet een werkelijk gevonden bron-URL en de letterlijk waargenomen bedrijfsnaam bevatten. Verzin niets.",
        'Antwoord alleen met JSON: {"companies":[{"name":"","claims":[{"observed_name":"","claim_type":"local_connection|professional_connection|identity|job_fit|conflict","outcome":"confirmed|conflict","source_url":"https://","source_name":"","note":""}]}]}',
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Plaats: ${args.place}`,
        `Vak: ${args.tradeLabel}`,
        `Klus: ${args.jobText}`,
        `Kandidaten: ${JSON.stringify(args.candidates)}`,
        `Bronnenkaart: ${JSON.stringify(args.landscape.sources)}`,
      ].join("\n"),
    },
  ];
  const { content, urls, usage, cutOff } = await ask(messages, { maxResults: 12 });
  const parsed = GeminiEvidenceResultSchema.parse(parseJsonObject(content));
  return {
    evidence: filterEvidenceToCitations(parsed, urls),
    usage,
    cutOff,
  };
}

export async function findGeminiSourceCandidates(args: {
  place: string;
  tradeLabel: string;
  jobText: string;
  landscape: GeminiLandscape;
}): Promise<{
  candidates: GeminiCandidate[];
  evidence: GeminiEvidenceResult;
  usage: GeminiUsage;
  cutOff: boolean;
}> {
  const messages = [
    {
      role: "system",
      content: [
        "Zoek via de meegegeven bronnen maximaal vijf aanvullende echte bedrijven voor de gevraagde particuliere klus.",
        "Gebruik AI-websearch; geef alleen bedrijven terug die aantoonbaar in of via een opgegeven bron voorkomen.",
        "Vermeld de eigen bedrijfswebsite als die gevonden is. Geen vergelijkers, offerteplatforms of landelijke bemiddelaars.",
        "Een extra bedrijf moet een bron-URL, letterlijk waargenomen naam en voldoende identiteit hebben. Verzin niets.",
        'Antwoord alleen met JSON: {"companies":[{"name":"","website":"","address":"","phone":"","email":"","candidate_basis":[""],"risk_flags":[],"observed_name":"","source_url":"https://","source_name":"","source_scope":"local|regional|national","source_kind":""}]}',
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Plaats: ${args.place}`,
        `Vak: ${args.tradeLabel}`,
        `Klus: ${args.jobText}`,
        `Bronnenkaart: ${JSON.stringify(args.landscape.sources)}`,
      ].join("\n"),
    },
  ];
  const { content, urls, usage, cutOff } = await ask(messages, { maxResults: 10 });
  const parsed = GeminiSourceCandidatesSchema.parse(parseJsonObject(content));
  const cited = citationSet(urls);
  const accepted = parsed.companies.filter(
    (company) =>
      isCited(company.source_url, cited) &&
      Boolean(company.website || company.phone || company.address),
  );
  const candidates = reviewFoundFirms(
    accepted.map((company) => ({
      name: company.name,
      website: company.website,
      address: company.address,
      phone: company.phone,
      email: company.email,
      candidateBasis: company.candidate_basis,
      riskFlags: company.risk_flags,
    })),
  ).kept;
  return {
    candidates,
    evidence: {
      companies: accepted.map((company) => ({
        name: company.name,
        claims: [
          {
            observed_name: company.observed_name,
            claim_type:
              company.source_scope === "local"
                ? ("local_connection" as const)
                : ("professional_connection" as const),
            outcome: "confirmed" as const,
            source_url: company.source_url,
            source_name: company.source_name,
            note: company.candidate_basis.join("; "),
          },
        ],
      })),
    },
    usage,
    cutOff,
  };
}

export async function reviewGeminiCompanies(args: {
  place: string;
  tradeLabel: string;
  jobText: string;
  candidates: readonly GeminiCandidate[];
  evidence: GeminiEvidenceResult;
}): Promise<{ review: GeminiReview; usage: GeminiUsage; cutOff: boolean }> {
  const messages = [
    {
      role: "system",
      content: [
        "Voer vóór publicatie een echtheids- en risicoscreening uit, geen fraudevaststelling.",
        "Controleer met websearch per bedrijf: bedrijfsidentiteit, vestigingsplaats/regio, gevraagde vakactiviteit, werk voor particulieren en consistente contactgegevens.",
        "Let op generieke vak-plus-plaatsnamen, vele plaatslandingspagina's, offerteplatforms, landelijke doorschakeling en gekopieerde of tegenstrijdige identiteit.",
        "Een 085/088-nummer, jonge website of ontbrekende sponsorvermelding mag nooit zelfstandig uitsluiten.",
        "keep=false alleen bij platform/tussenpersoon, duidelijke vakmismatch, aantoonbare identiteitsmismatch of sterk nep-lokaal patroon.",
        "Zonder onafhankelijke lokale/professionele bron is evidence_level limited, niet automatisch afwijzen.",
        "Noem alleen URLs die je werkelijk hebt gevonden en gebruikt.",
        'Antwoord alleen met JSON: {"companies":[{"name":"","job_fit":true,"location_checked":true,"serves_private":true,"keep":true,"evidence_level":"strong|moderate|limited","risk_flags":[],"hard_reject_reason":null,"summary":"","source_urls":["https://"]}]}',
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Plaats: ${args.place}`,
        `Vak: ${args.tradeLabel}`,
        `Klus: ${args.jobText}`,
        `Bedrijven: ${JSON.stringify(args.candidates)}`,
        `Reeds gevonden bewijs: ${JSON.stringify(args.evidence.companies)}`,
      ].join("\n"),
    },
  ];
  const { content, urls, usage, cutOff } = await ask(messages, { maxResults: 12 });
  const parsed = GeminiReviewSchema.parse(parseJsonObject(content));
  const cited = citationSet(urls);
  return {
    review: {
      companies: parsed.companies.map((company) => {
        const source_urls = company.source_urls.filter((url) => isCited(url, cited));
        if (source_urls.length > 0) return { ...company, source_urls };
        return {
          ...company,
          keep: false,
          source_urls,
          hard_reject_reason: company.hard_reject_reason ?? "review_without_citation",
        };
      }),
    },
    usage,
    cutOff,
  };
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
      ].join("\n"),
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
  const { content, urls } = await ask(messages, { maxResults: 10 });
  const parsed = GeminiCheckSchema.safeParse(parseJsonObject(content));
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Gemini check JSON was not usable",
    );
  }
  return filterCheckToCitations(parsed.data, urls);
}
