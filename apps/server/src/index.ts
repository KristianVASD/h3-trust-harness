import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createStore, resolveStoreDriver } from "@h3-trust/store";
import { createApp } from "./app.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const writableRoot = path.resolve(
  process.env.WRITABLE_ROOT ?? path.join(repoRoot, "writable"),
);
const searchPlansRoot = path.resolve(repoRoot, "searchplans");

const driver = resolveStoreDriver();
const store = createStore({
  driver,
  writableRoot,
});

const app = createApp({
  store,
  searchPlansRoot,
  writableRoot,
});

const port = Number(process.env.PORT ?? 8787);

console.log(`H3 Trust API listening on http://localhost:${port}`);
console.log(`Store driver: ${driver}`);
if (driver === "file") console.log(`Writable root: ${writableRoot}`);

serve({ fetch: app.fetch, port });

export { app };
