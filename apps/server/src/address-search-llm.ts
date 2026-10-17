import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FALLBACK_PROMPT = `You help one address search. You do not discover new national associations.

- Propose only public http(s) URLs a person could open without a login.
- Sport and festivity pages are for sponsors and standholders, never private members.
- Company websites must be the firm's own craft site, not a lead-gen or city-doorway page.
- Trade ids and specialisation ids must come from the list in the user message.
- Audiences: private and hoa are households (B2C). commercial and industrial are B2B. municipal stays municipal.
- If you are unsure, return an empty list. Do not invent a branchevereniging.
`;

function readFirst(paths: string[]): string {
  for (const path of paths) {
    try {
      const text = readFileSync(path, "utf8").trim();
      if (text) return text;
    } catch {
      /* next path */
    }
  }
  return "";
}

export function addressSearchPrompt(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const fromDisk = readFirst([
    join(process.cwd(), "apps/worker/prompts/address-search.md"),
    join(here, "../../worker/prompts/address-search.md"),
  ]);
  return fromDisk || FALLBACK_PROMPT;
}

export class AddressSearchRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AddressSearchRateLimitError";
  }
}

export function parseJsonObject(raw: string): Record<string, unknown> {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = (fenced?.[1] ?? raw).trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in model response");
  return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
}

/** One JSON completion. Returns null when the server key is unset. */
export async function askAddressJson(
  model: string,
  system: string,
  user: string,
): Promise<Record<string, unknown> | null> {
  const key = (process.env.OPENROUTER_API_KEY ?? "").trim();
  if (!key) return null;
  const prompt = addressSearchPrompt();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.H3_API_BASE ?? "https://h3-trust-harness.vercel.app",
      "X-Title": "H3 Trust Harness",
    },
    body: JSON.stringify({
      model: model.trim() || process.env.OPENROUTER_MODEL || "minimax/minimax-m3:free",
      messages: [
        { role: "system", content: `${prompt}\n\n${system}` },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    }),
  });
  if (res.status === 402 || res.status === 429) {
    const text = await res.text();
    throw new AddressSearchRateLimitError(`OpenRouter ${res.status}: ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 300)}`);
  }
  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content?.trim() ?? "";
  if (!content) return null;
  try {
    return parseJsonObject(content);
  } catch {
    return null;
  }
}
