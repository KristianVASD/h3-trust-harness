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
