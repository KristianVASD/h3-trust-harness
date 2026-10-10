import type { Hono } from "hono";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PlaceCellSchema } from "@h3-trust/schema";
import type { Store } from "@h3-trust/store";
import {
  applyAddressSnapshot,
  enqueueAddressSearch,
  geocodeCached,
  type AddressCompanyInput,
  type AddressSeedInput,
} from "./address-search-job.js";
import { isAdmin, type AppVariables } from "./auth.js";
import type { PlaceCellStore } from "./place-cell-store.js";

function engineUnavailable() {
  return {
    error: "Engine requires Supabase (set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY).",
    code: "engine_unavailable",
  };
}

export function registerAddressSearchRoutes(
  app: Hono<{ Variables: AppVariables }>,
  deps: {
    store: Store;
    admin: SupabaseClient | null;
    cells: PlaceCellStore;
  },
): void {
  app.post("/api/control/countries/:country/address-search", async (c) => {
    const auth = c.get("auth");
    if (!isAdmin(auth)) return c.json({ error: "Admin only" }, 403);
    if (!deps.admin) return c.json(engineUnavailable(), 503);
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return c.json({ error: "JSON body required" }, 400);
    const address = typeof body.address === "string" ? body.address.trim() : "";
    const postcode = typeof body.postcode === "string" ? body.postcode.trim() : "";
    const place = typeof body.place === "string" ? body.place.trim() : "";
    const model = typeof body.model === "string" ? body.model.trim() : undefined;
    try {
      const result = await enqueueAddressSearch({
        admin: deps.admin,
        store: deps.store,
        cells: deps.cells,
        country: c.req.param("country"),
        address,
        postcode,
        place,
        model,
      });
      return c.json(result, 201);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Address search failed" }, 400);
    }
  });

  app.get("/api/place-cells/:id", async (c) => {
    if (!c.get("isWorker") && !isAdmin(c.get("auth"))) {
      return c.json({ error: "Worker or admin only" }, 403);
    }
    const cell = await deps.cells.get(c.req.param("id"));
    if (!cell) return c.json({ error: "Place cell not found" }, 404);
    return c.json({ cell });
  });

  app.post("/api/geo/nl", async (c) => {
    if (!c.get("isWorker") && !isAdmin(c.get("auth"))) {
      return c.json({ error: "Worker or admin only" }, 403);
    }
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const q = typeof body?.q === "string" ? body.q.trim() : "";
    const kind = body?.kind === "woonplaats" ? "woonplaats" : "adres";
    if (!q) return c.json({ error: "q is required" }, 400);
    const hit = await geocodeCached(deps.cells, q, kind);
    return c.json({ hit });
  });

  app.post("/api/place-cells/:id/apply", async (c) => {
    if (!c.get("isWorker") && !isAdmin(c.get("auth"))) {
      return c.json({ error: "Worker or admin only" }, 403);
    }
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return c.json({ error: "JSON body required" }, 400);
    const parsed = PlaceCellSchema.safeParse(body.cell);
    if (!parsed.success) return c.json({ error: "Invalid place cell" }, 400);
    if (parsed.data.id !== c.req.param("id")) {
      return c.json({ error: "Cell id mismatch" }, 400);
    }
    try {
      const result = await applyAddressSnapshot({
        store: deps.store,
        cells: deps.cells,
        cell: parsed.data,
        sources: Array.isArray(body.sources) ? (body.sources as AddressSeedInput[]) : [],
        companies: Array.isArray(body.companies) ? (body.companies as AddressCompanyInput[]) : [],
      });
      return c.json(result);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Apply failed" }, 400);
    }
  });
}
