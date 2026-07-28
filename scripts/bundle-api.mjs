/**
 * Bundle the Hono API into api/index.mjs so Vercel loads it as ESM
 * (root package.json is not "type": "module", so .js is treated as CJS).
 */
import * as esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { unlink } from "node:fs/promises";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await esbuild.build({
  absWorkingDir: root,
  entryPoints: [path.join(root, "scripts/vercel-api-entry.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: path.join(root, "api/index.mjs"),
  logLevel: "info",
  alias: {
    "@h3-trust/schema/omega": path.join(
      root,
      "packages/schema/src/omega-commands.ts",
    ),
    "@h3-trust/schema": path.join(root, "packages/schema/src/index.ts"),
    "@h3-trust/store": path.join(root, "packages/store/src/index.ts"),
  },
  external: [
    "@supabase/supabase-js",
    "hono",
    "hono/*",
    "@hono/*",
    "zod",
  ],
});

// Remove legacy CJS-ambiguous entry if present
try {
  await unlink(path.join(root, "api/index.js"));
} catch {
  /* ok */
}

console.log("Wrote api/index.mjs");
