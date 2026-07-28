/**
 * Bundle the Hono API into api/index.js so Vercel does not typecheck
 * the monorepo TypeScript graph (workspace packages + Node types).
 */
import * as esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await esbuild.build({
  absWorkingDir: root,
  entryPoints: [path.join(root, "scripts/vercel-api-entry.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: path.join(root, "api/index.js"),
  logLevel: "info",
  alias: {
    "@h3-trust/schema/omega": path.join(
      root,
      "packages/schema/src/omega-commands.ts",
    ),
    "@h3-trust/schema": path.join(root, "packages/schema/src/index.ts"),
    "@h3-trust/store": path.join(root, "packages/store/src/index.ts"),
  },
  // Runtime deps are provided by the serverless install / node_modules
  external: [
    "@supabase/supabase-js",
    "hono",
    "hono/*",
    "@hono/*",
    "zod",
  ],
});

console.log("Wrote api/index.js");
