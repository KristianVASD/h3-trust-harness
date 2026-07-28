/**
 * Source entry for the Vercel serverless API bundle.
 * Bundled by scripts/bundle-api.mjs → api/index.js (not typechecked by Vercel).
 */
import path from "node:path";
import { createStore } from "@h3-trust/store";
import { createApp } from "../apps/server/src/app.ts";

process.env.STORE_DRIVER ??= "postgres";
process.env.AUTH_REQUIRED ??= "true";

const searchPlansRoot = path.join(process.cwd(), "searchplans");

const store = createStore({ driver: "postgres" });

const app = createApp({
  store,
  searchPlansRoot,
});

export default app;
