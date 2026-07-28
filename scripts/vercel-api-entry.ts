/**
 * Source entry for the Vercel serverless API bundle.
 * Bundled by scripts/bundle-api.mjs → api/index.js (not typechecked by Vercel).
 */
import path from "node:path";
import { Hono } from "hono";
import { createStore } from "@h3-trust/store";
import { createApp } from "../apps/server/src/app.ts";

process.env.STORE_DRIVER ??= "postgres";
process.env.AUTH_REQUIRED ??= "true";

const searchPlansRoot = path.join(process.cwd(), "searchplans");

function buildApp() {
  try {
    const store = createStore({ driver: "postgres" });
    return createApp({
      store,
      searchPlansRoot,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api] failed to boot store/app:", message);
    const fallback = new Hono();
    fallback.all("*", (c) =>
      c.json(
        {
          ok: false,
          error: message,
          hint:
            "Set STORE_DRIVER=postgres, SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY on the Vercel project (server env, not only VITE_*).",
        },
        500,
      ),
    );
    return fallback;
  }
}

const app = buildApp();

export default app;
