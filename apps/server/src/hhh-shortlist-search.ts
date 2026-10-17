import { parseJsonObject } from "./address-search-llm.js";
import { filterHitsToSearch, websiteHost } from "@h3-trust/schema";

export type SearchHit = { name: string; website: string };

type Annotation = {
  type?: string;
  url_citation?: { url?: string; content?: string; title?: string };
};

function collectSearchUrls(payload: unknown): string[] {
  const urls = new Set<string>();
  const walk = (value: unknown, insideCompany: boolean): void => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item, insideCompany);
      return;
    }
    const record = value as Record<string, unknown>;
    const looksLikeCompany =
      typeof record.name === "string" && typeof record.website === "string";
    for (const [key, child] of Object.entries(record)) {
      if (looksLikeCompany && key === "website") continue;
      if (key === "url" && typeof child === "string") urls.add(child);
      if (key === "url_citation" && child && typeof child === "object") {
        const cited = (child as { url?: string }).url;
        if (cited) urls.add(cited);
      }
      walk(child, insideCompany || looksLikeCompany);
    }
  };
  walk(payload, false);
  return [...urls];
}

function proposedCompanies(raw: Record<string, unknown>): SearchHit[] {
  const list = Array.isArray(raw.companies) ? raw.companies : [];
  const out: SearchHit[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as { name?: unknown; website?: unknown };
    if (typeof row.name !== "string" || typeof row.website !== "string") continue;
    out.push({ name: row.name, website: row.website });
  }
  return out;
}

async function complete(body: Record<string, unknown>): Promise<{
  content: string;
  urls: string[];
}> {
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
  const urls = collectSearchUrls({
    annotations: message?.annotations ?? [],
    content: content.replace(/"website"\s*:\s*"[^"]*"/g, ""),
  });
  for (const annotation of message?.annotations ?? []) {
    const url = annotation.url_citation?.url;
    if (url) urls.push(url);
  }
  return { content, urls };
}

/**
 * One web search for this postcode, trade, and job.
 * A company is kept only when its website host appeared in the search hits.
 */
export async function browserSearchCompanies(args: {
  model: string;
  tradeLabel: string;
  jobText: string;
  place: string;
  postcode4?: string;
  elementCodes: readonly string[];
}): Promise<SearchHit[]> {
  const placeLine = [args.place, args.postcode4].filter(Boolean).join(" ");
  const jobLine = [args.jobText, args.elementCodes.join(" ")].filter(Boolean).join(". ");
  const model = args.model.trim() || process.env.OPENROUTER_MODEL || "minimax/minimax-m3:free";
  const messages = [
    {
      role: "system",
      content: [
        "Search the live Dutch web for real local service companies.",
        "Return JSON only: {\"companies\":[{\"name\":\"\",\"website\":\"\"}]}",
        "Return at most 6 firms that do this exact kind of work for households near the postcode.",
        "Use each firm's own website. Skip lead-gen, comparison sites, national switchboards, and directories.",
        "Every website must be a URL that appeared in the search results.",
        "If fewer than 6 real firms show up, return fewer. Do not invent a company or a URL.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Place: ${placeLine || "Netherlands"}`,
        `Trade: ${args.tradeLabel}`,
        `Job: ${jobLine || args.tradeLabel}`,
        "Find 6 local companies a household could hire for this job.",
      ].join("\n"),
    },
  ];
  let content = "";
  let urls: string[] = [];
  try {
    const first = await complete({
      model,
      messages,
      plugins: [{ id: "web", max_results: 10 }],
      temperature: 0.1,
    });
    content = first.content;
    urls = first.urls;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("OpenRouter 400")) throw err;
    const online = model.endsWith(":online") ? model : `${model}:online`;
    const second = await complete({ model: online, messages, temperature: 0.1 });
    content = second.content;
    urls = second.urls;
  }
  let proposed: SearchHit[] = [];
  try {
    proposed = proposedCompanies(parseJsonObject(content));
  } catch {
    proposed = [];
  }
  const allowed = urls.filter((url) => websiteHost(url));
  return filterHitsToSearch(proposed, allowed);
}
