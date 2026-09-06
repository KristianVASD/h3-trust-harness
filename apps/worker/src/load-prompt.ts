import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const PROMPT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../prompts");

const cache = new Map<string, string>();

const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,40}$/i;

export function listPromptNames(): string[] {
  return readdirSync(PROMPT_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""))
    .sort();
}

export function loadPrompt(name: string): string {
  if (!NAME_RE.test(name)) throw new Error("Invalid prompt name");
  const hit = cache.get(name);
  if (hit) return hit;
  const text = readFileSync(join(PROMPT_DIR, `${name}.md`), "utf8");
  cache.set(name, text);
  return text;
}

export function savePrompt(name: string, body: string): void {
  if (!NAME_RE.test(name)) throw new Error("Invalid prompt name");
  writeFileSync(join(PROMPT_DIR, `${name}.md`), body.replace(/\r\n/g, "\n"), "utf8");
  cache.delete(name);
}

const SOUL_PATHS = [
  join(PROMPT_DIR, "soul.md"),
  join(dirname(fileURLToPath(import.meta.url)), "../../../fixtures/samples/H3TrustSoul.md"),
];

let soulCache: { version: string; text: string } | null = null;

export function loadSoul(): { version: string; text: string } {
  if (soulCache) return soulCache;
  for (const path of SOUL_PATHS) {
    try {
      const text = readFileSync(path, "utf8").replace(/\r\n/g, "\n").trim();
      if (!text) continue;
      const version =
        text.match(/\*\*Version:\*\*\s*([0-9.]+)/i)?.[1] ?? "1.0";
      soulCache = { version, text };
      return soulCache;
    } catch {
      continue;
    }
  }
  soulCache = { version: "1.0", text: "" };
  return soulCache;
}
