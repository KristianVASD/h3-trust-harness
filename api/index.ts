/**
 * Vercel serverless function — Hono app on /api/*
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStore } from "@h3-trust/store";
import { createApp } from "../apps/server/src/app.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const searchPlansRoot = path.resolve(__dirname, "../searchplans");

process.env.STORE_DRIVER ??= "postgres";
process.env.AUTH_REQUIRED ??= "true";

const store = createStore({ driver: "postgres" });

const app = createApp({
  store,
  searchPlansRoot,
});

export default app;
