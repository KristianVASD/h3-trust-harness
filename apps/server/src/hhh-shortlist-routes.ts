import { randomUUID } from "node:crypto";
import type { Hono } from "hono";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HhhShortlistRequestSchema } from "@h3-trust/schema";
import type { Store } from "@h3-trust/store";
import { geocodeCached } from "./address-search-job.js";
import { isAdmin, type AppVariables } from "./auth.js";
import { runFoundKnockout } from "./hhh-gemini-run.js";
import { deferHhhSlice, scheduleHhhShortlistStep, scheduleLocalSourceGeocode } from "./hhh-shortlist-kick.js";
import { findPartnerJobByRequest, getPartnerJob, insertPartnerJob, listPartnerJobs, toDeskJob } from "./hhh-shortlist-jobs.js";
import { runHhhShortlistSlice } from "./hhh-shortlist-run.js";
import {
  geocodePendingSources,
  parseLocalSourceCsv,
  summarizeLocalSources,
  upsertLocalSources,
} from "./hhh-shortlist-sources.js";
import type { PlaceCellStore } from "./place-cell-store.js";

function engineUnavailable() {
  return {
    error: "Engine requires Supabase (set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY).",
    code: "engine_unavailable",
  };
}

export function registerHhhShortlistRoutes(
  app: Hono<{ Variables: AppVariables }>,
  deps: { store: Store; admin: SupabaseClient | null; cells: PlaceCellStore },
): void {
  app.post("/api/partner/hhh/shortlist", async (c) => {
    if (!c.get("isPartner") && !isAdmin(c.get("auth"))) {
      return c.json({ error: "Forbidden", code: "forbidden" }, 403);
    }
    if (!deps.admin) return c.json(engineUnavailable(), 503);
    const body = await c.req.json().catch(() => null);
    const parsed = HhhShortlistRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid shortlist request" }, 400);
    }
    const input = parsed.data;
    try {
      const existing = await findPartnerJobByRequest(deps.admin, input.requestId);
      if (existing) {
        if (existing.status === "queued" || existing.status === "running") {
          scheduleHhhShortlistStep(existing.id);
        }
        return c.json({ jobId: existing.id, status: existing.status, requestId: input.requestId }, 202);
      }
      const query = input.postcode4 ?? input.gemeente ?? "";
      const geo =
        (await geocodeCached(deps.cells, query, input.postcode4 ? "adres" : "woonplaats")) ??
        (await geocodeCached(deps.cells, query, "woonplaats"));
      if (!geo) return c.json({ error: `No PDOK hit for “${query}”` }, 400);
      const placeLabel = geo.woonplaats || geo.gemeente || input.gemeente || input.postcode4 || geo.label;
      const job = await insertPartnerJob(deps.admin, {
        id: randomUUID(),
        requestId: input.requestId,
        payload: {
          requestId: input.requestId,
          postcode4: input.postcode4 ?? geo.postcode4,
          gemeente: input.gemeente ?? geo.gemeente,
          woonplaats: geo.woonplaats,
          placeLabel,
          lat: geo.lat,
          lon: geo.lon,
          tradeId: input.tradeId,
          elementCodes: input.elementCodes,
          jobText: input.jobText ?? "",
          route: "gemini-found",
          stage: "lookup",
          candidates: [],
          found: [],
          drops: [],
          fromCache: false,
          progress: [],
        },
      });
      scheduleHhhShortlistStep(job.id);
      return c.json({ jobId: job.id, status: job.status, requestId: input.requestId }, 202);
    } catch (err) {
      console.error("[hhh-shortlist] enqueue", err instanceof Error ? err.message : err);
      return c.json({ error: "Could not start the shortlist" }, 500);
    }
  });

  app.get("/api/partner/hhh/shortlist/:jobId", async (c) => {
    if (!c.get("isPartner") && !isAdmin(c.get("auth"))) {
      return c.json({ error: "Forbidden", code: "forbidden" }, 403);
    }
    if (!deps.admin) return c.json(engineUnavailable(), 503);
    const job = await getPartnerJob(deps.admin, c.req.param("jobId"));
    if (!job) return c.json({ error: "Shortlist job not found" }, 404);
    if (job.status === "ready" && job.public_result) {
      return c.json({ jobId: job.id, status: "ready", ...job.public_result });
    }
    if (job.status === "failed") return c.json({ jobId: job.id, status: "failed" });
    return c.json({ jobId: job.id, status: job.status });
  });

  app.get("/api/control/hhh-shortlist", async (c) => {
    if (!isAdmin(c.get("auth"))) return c.json({ error: "Admin only" }, 403);
    if (!deps.admin) return c.json(engineUnavailable(), 503);
    try {
      const jobs = await listPartnerJobs(deps.admin);
      return c.json({ jobs });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Could not list shortlist jobs" }, 500);
    }
  });

  app.post("/api/control/hhh-shortlist/:jobId/step", async (c) => {
    if (!isAdmin(c.get("auth"))) return c.json({ error: "Admin only" }, 403);
    if (!deps.admin) return c.json(engineUnavailable(), 503);
    const jobId = c.req.param("jobId");
    const admin = deps.admin;
    try {
      const result = await runHhhShortlistSlice({
        admin,
        store: deps.store,
        cells: deps.cells,
        jobId,
        release: true,
      });
      const job = await getPartnerJob(admin, jobId);
      if (!job) return c.json({ error: "Shortlist job not found" }, 404);
      return c.json({
        continued: result.continue,
        job: toDeskJob({
          id: job.id,
          request_id: job.request_id,
          status: job.status,
          payload: job.payload,
          public_result: job.public_result,
          updated_at: new Date().toISOString(),
        }),
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Could not run the shortlist step" }, 500);
    }
  });

  app.get("/api/control/local-sources", async (c) => {
    if (!isAdmin(c.get("auth"))) return c.json({ error: "Admin only" }, 403);
    if (!deps.admin) return c.json(engineUnavailable(), 503);
    try {
      return c.json(await summarizeLocalSources(deps.admin));
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Could not read local lists" }, 500);
    }
  });

  app.post("/api/internal/hhh-shortlist/step", async (c) => {
    if (!c.get("isWorker") && !isAdmin(c.get("auth"))) {
      return c.json({ error: "Worker or admin only" }, 403);
    }
    if (!deps.admin) return c.json(engineUnavailable(), 503);
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const jobId = typeof body?.jobId === "string" ? body.jobId.trim() : "";
    const lock = typeof body?.lock === "string" ? body.lock : undefined;
    if (!jobId) return c.json({ error: "jobId is required" }, 400);
    const admin = deps.admin;
    deferHhhSlice(
      runHhhShortlistSlice({
        admin,
        store: deps.store,
        cells: deps.cells,
        jobId,
        lock,
      })
        .then((result) => {
          if (result.continue && result.lock) scheduleHhhShortlistStep(jobId, result.lock);
        })
        .catch((err) => {
          console.error("[hhh-shortlist] slice failed", err instanceof Error ? err.message : err);
        }),
    );
    return c.json({ accepted: true }, 202);
  });

  app.post("/api/internal/hhh-found/knockout", async (c) => {
    if (!c.get("isWorker") && !isAdmin(c.get("auth"))) {
      return c.json({ error: "Worker or admin only" }, 403);
    }
    if (!deps.admin) return c.json(engineUnavailable(), 503);
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const jobId = typeof body?.jobId === "string" ? body.jobId.trim() : "";
    if (!jobId) return c.json({ error: "jobId is required" }, 400);
    const admin = deps.admin;
    deferHhhSlice(
      runFoundKnockout({ admin, store: deps.store, jobId }).catch((err) => {
        console.error("[hhh-found] knockout failed", err instanceof Error ? err.message : err);
      }),
    );
    return c.json({ accepted: true }, 202);
  });

  app.post("/api/control/local-sources/import", async (c) => {
    if (!isAdmin(c.get("auth"))) return c.json({ error: "Admin only" }, 403);
    if (!deps.admin) return c.json(engineUnavailable(), 503);
    const body = (await c.req.json().catch(() => null)) as { csv?: unknown } | null;
    const csv = typeof body?.csv === "string" ? body.csv : "";
    if (!csv.trim()) return c.json({ error: "csv is required" }, 400);
    if (csv.length > 1_000_000) return c.json({ error: "csv is too large" }, 400);
    try {
      const parsed = parseLocalSourceCsv(csv);
      const imported = await upsertLocalSources(deps.admin, parsed.rows);
      scheduleLocalSourceGeocode();
      return c.json({ imported, skipped: parsed.skipped });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Import failed" }, 400);
    }
  });

  app.post("/api/internal/local-sources/geocode", async (c) => {
    if (!c.get("isWorker") && !isAdmin(c.get("auth"))) {
      return c.json({ error: "Worker or admin only" }, 403);
    }
    if (!deps.admin) return c.json(engineUnavailable(), 503);
    const admin = deps.admin;
    deferHhhSlice(
      geocodePendingSources(admin)
        .then((result) => {
          if (result.remaining) scheduleLocalSourceGeocode();
        })
        .catch((err) => {
          console.error("[local-sources] geocode failed", err instanceof Error ? err.message : err);
        }),
    );
    return c.json({ accepted: true }, 202);
  });
}
