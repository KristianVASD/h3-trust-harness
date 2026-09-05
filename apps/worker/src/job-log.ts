import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");

export async function logJobOutput(args: {
  runId: string;
  step: string;
  payload: unknown;
}): Promise<string> {
  const dir = join(ROOT, "writable", "logs", args.runId);
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = join(dir, `${stamp}-${args.step}.json`);
  await writeFile(path, JSON.stringify(args.payload, null, 2), "utf8");
  return path;
}

export function previewForEvent(value: unknown, max = 4000): unknown {
  const raw = JSON.stringify(value);
  if (!raw) return value;
  if (raw.length <= max) return value;
  return { truncated: true, chars: raw.length, preview: raw.slice(0, max) };
}
