/**
 * Vercel serverless entry — export the Hono app fetch handler.
 * Build copies or re-exports this from api/index.ts.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStore } from "@h3-trust/store";
import { createApp } from "../src/app.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const searchPlansRoot = path.resolve(repoRoot, "searchplans");

const store = createStore({ driver: "postgres" });

const app = createApp({
  store,
  searchPlansRoot,
});

export default app;
