import {
  GeminiCheckSchema,
  selectFoundFirms,
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

async function ask(messages: { role: string; content: string }[]): Promise<{ content: string; urls: string[] }> {
  const model = geminiModel();
  const withWeb = {
    model,
    messages,
    plugins: [{ id: "web", max_results: 5 }],
    provider: { sort: "price" },
    temperature: 0.1,
    max_tokens: 800,
  };
  try {
    return await complete(withWeb);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("OpenRouter 400")) throw err;
    const online = model.endsWith(":online") ? model : `${model}:online`;
    return complete({ model: online, messages, temperature: 0.1, max_tokens: 800 });
  }
}

function localPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("085") || digits.startsWith("088") || digits.startsWith("3185") || digits.startsWith("3188")) {
    return "";
  }
  return raw.trim();
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function proposedCandidates(raw: Record<string, unknown>): GeminiCandidate[] {
  const list = Array.isArray(raw.companies) ? raw.companies : [];
  const out: GeminiCandidate[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const name = asText(row.name);
    const website = asText(row.website);
    if (!name || !website) continue;
    out.push({
      name,
      website,
      address: asText(row.address),
      phone: localPhone(asText(row.phone)),
      email: asText(row.email),
    });
  }
  return out;
}

/**
 * First question: up to five local firms.
 * Lead sites and national 085/088 numbers are dropped. A missing citation is not.
 */
export async function findLocalCompanies(args: {
  tradeLabel: string;
  jobText: string;
  place: string;
}): Promise<GeminiCandidate[]> {
  const jobLine = args.jobText.trim() || `particulier onderhoud door een ${args.tradeLabel.toLowerCase()}`;
  const messages = [
    {
      role: "system",
      content: [
        "Zoek naar vakbedrijven die fysiek in de plaats gevestigd zijn, of het lokale netnummer hebben.",
        'Antwoord alleen met JSON: {"companies":[{"name":"","address":"","website":"","phone":"","email":""}]}',
        "Geef hooguit 5 bedrijven voor particulier onderhoud. Een bedrijf in een buurdorp mag.",
        "Lokale verankering, zoals een familiebedrijf, een bedrijventerrein of een club, is een plus en geen eis.",
        "Geen tussenpersonen (geen Werkspot, Trustoo, Zoofy) en geen landelijke 085- of 088-nummers.",
        "Gebruik de eigen website van het bedrijf. Verzin geen bedrijf en geen URL.",
        "Ontbreekt het e-mailadres, geef het lokale telefoonnummer. Zoek niet eindeloos naar een e-mailadres.",
        "Zijn er minder dan 5 echte bedrijven, geef er minder terug.",
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
  const { content } = await ask(messages);
  let proposed: GeminiCandidate[] = [];
  try {
    proposed = proposedCandidates(parseJsonObject(content));
  } catch {
    proposed = [];
  }
  return selectFoundFirms(proposed);
}

/** Second Gemini question: local mentions only. A missing company means no mention. */
export async function checkLocalMentions(args: {
  place: string;
  tradeLabel: string;
  companies: readonly GeminiCandidate[];
}): Promise<GeminiCheck> {
  const names = args.companies.map((company) => ({
    name: company.name,
    website: company.website,
    place: args.place,
  }));
  const messages = [
    {
      role: "system",
      content: [
        "Controleer of deze bedrijven voorkomen op pagina's van ondernemersverenigingen, jaarfeesten of voetbalclubs, als lid of sponsor.",
        "Geef alleen JSON terug. Een bedrijf zonder lokale vermelding laat je weg.",
        "Verzin geen URL. Elke bron heeft een volledige https-URL van de pagina waarop het bedrijf staat.",
        "about is company of person. Een familielid is person en telt niet als het bedrijf.",
        "kind is ov, sport of festivity. outcome is member, sponsor of mentioned.",
        "category is local_business_association, sponsorship of municipal_initiative. scope is local.",
        "Een landelijk certificaat (Techniek Nederland, NVKL, KvK) en de eigen website van het bedrijf zijn geen lokale vermelding.",
        "Geen score.",
        'Vorm: {"place":"","trade":"","checked_on":"","sources":[{"id":"s1","name":"","url":"","category":"","scope":"local","place":"","description":"","list_public":true}],"companies":[{"name":"","place":"","phone":"","email":"","website":"","claims":[{"kind":"ov","outcome":"member","about":"company","org_name":"","relation":"","source_ids":["s1"],"pages_checked":[],"note":null}]}]}',
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Plaats: ${args.place}`,
        `Vak: ${args.tradeLabel}`,
        `Bedrijven: ${JSON.stringify(names)}`,
        "Geef alleen de bedrijven terug die op een lokale pagina genoemd worden.",
      ].join("\n"),
    },
  ];
  const { content } = await ask(messages);
  const parsed = GeminiCheckSchema.safeParse(parseJsonObject(content));
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Gemini check JSON was not usable");
  }
  return parsed.data;
}
