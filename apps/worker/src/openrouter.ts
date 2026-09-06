import { recordLlmCall } from "./llm-trace.js";
import { loadSoul } from "./load-prompt.js";

export const DEFAULT_OPENROUTER_MODEL = "minimax/minimax-m3:free";

export class OpenRouterRateLimitError extends Error {
  readonly retryAfterMs: number;
  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = "OpenRouterRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

export function isRateLimitError(err: unknown): boolean {
  if (err instanceof OpenRouterRateLimitError) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /OpenRouter (402|429)|rate.?limit|in_flight_budget|temporarily rate-limited/i.test(
    message,
  );
}

let cooldownUntil = 0;
let chain: Promise<unknown> = Promise.resolve();

export function openRouterCooldownMs(): number {
  return Math.max(0, cooldownUntil - Date.now());
}

export function noteOpenRouterCooldown(waitMs: number): void {
  cooldownUntil = Math.max(cooldownUntil, Date.now() + waitMs);
}

function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function retryAfterMs(res: Response, body: string, attempt: number): number {
  const header = Number(res.headers.get("retry-after") ?? 0);
  const fromJson = body.match(/"Retry-After"\s*:\s*"?(\d+)/i);
  const hinted = header || Number(fromJson?.[1] ?? 0);
  const backoff = Math.min(180_000, 20_000 * 2 ** attempt);
  return Math.max((hinted || 0) * 1000, backoff);
}

function shouldRetryStatus(status: number): boolean {
  return status === 402 || status === 429 || status === 502 || status === 503;
}

async function completeJsonInner(args: {
  model: string;
  system: string;
  user: string;
  job?: string;
  attempts?: number;
}): Promise<string> {
  const key = (process.env.OPENROUTER_API_KEY ?? "").trim();
  if (!key) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }
  const model = args.model.trim() || DEFAULT_OPENROUTER_MODEL;
  const job = args.job || "llm";
  let lastError = "";
  const attempts = Math.max(1, args.attempts ?? 3);
  for (let attempt = 0; attempt < attempts; attempt++) {
    const cool = openRouterCooldownMs();
    if (cool > 0) {
      console.warn(`OpenRouter cool-down ${Math.round(cool / 1000)}s`);
      await new Promise((r) => setTimeout(r, cool));
    }
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.H3_API_BASE ?? "http://localhost:8787",
        "X-Title": "H3 Trust Harness Worker",
      },
      body: JSON.stringify({
        model,
        messages: [
          ...(loadSoul().text
            ? [{ role: "system" as const, content: loadSoul().text }]
            : []),
          { role: "system", content: args.system },
          { role: "user", content: args.user },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    });
    if (res.ok) {
      const body = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = body.choices?.[0]?.message?.content?.trim() ?? "";
      if (!content) throw new Error("OpenRouter returned empty content");
      recordLlmCall({
        at: new Date().toISOString(),
        job,
        model,
        ok: true,
        status: res.status,
        chars: content.length,
        preview: content.slice(0, 4000),
      });
      return content;
    }
    const text = await res.text();
    lastError = `OpenRouter ${res.status}: ${text.slice(0, 500)}`;
    if (shouldRetryStatus(res.status) && attempt < attempts - 1) {
      const waitMs = retryAfterMs(res, text, attempt);
      noteOpenRouterCooldown(waitMs);
      recordLlmCall({
        at: new Date().toISOString(),
        job,
        model,
        ok: false,
        status: res.status,
        waitSec: Math.round(waitMs / 1000),
        preview: "",
        error: lastError.slice(0, 500),
      });
      console.warn(`${lastError} — waiting ${Math.round(waitMs / 1000)}s`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    recordLlmCall({
      at: new Date().toISOString(),
      job,
      model,
      ok: false,
      status: res.status,
      preview: "",
      error: lastError.slice(0, 500),
    });
    if (shouldRetryStatus(res.status)) {
      const waitMs = retryAfterMs(res, text, attempt);
      noteOpenRouterCooldown(waitMs);
      throw new OpenRouterRateLimitError(lastError, waitMs);
    }
    throw new Error(lastError);
  }
  recordLlmCall({
    at: new Date().toISOString(),
    job,
    model,
    ok: false,
    preview: "",
    error: lastError.slice(0, 500),
  });
  throw new Error(lastError);
}

export async function completeJson(args: {
  model: string;
  system: string;
  user: string;
  job?: string;
  attempts?: number;
}): Promise<string> {
  return serialize(() => completeJsonInner(args));
}

export function parseJsonObject(raw: string): Record<string, unknown> {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = (fenced?.[1] ?? raw).trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("No JSON object in model response");
  }
  return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
}
