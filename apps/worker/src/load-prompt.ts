import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PROMPT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../prompts");

const cache = new Map<string, string>();

export function loadPrompt(name: string): string {
  const hit = cache.get(name);
  if (hit) return hit;
  const text = readFileSync(join(PROMPT_DIR, `${name}.md`), "utf8").trim();
  cache.set(name, text);
  return text;
}
