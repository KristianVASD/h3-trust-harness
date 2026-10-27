import { randomUUID } from "node:crypto";
import type { Hono } from "hono";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HhhShortlistRequestSchema } from "@h3-trust/schema";
import type { Store } from "@h3-trust/store";
import { geocodeCached } from "./address-search-job.js";
import { isAdmin, type AppVariables } from "./auth.js";
import { releaseHeldSearch, runFoundKnockout } from "./hhh-gemini-run.js";
import { deferHhhSlice, scheduleHhhShortlistStep, scheduleLocalSourceGeocode } from "./hhh-shortlist-kick.js";
import {
  abortLivePartnerJobs,
  deleteRecentPartnerJobs,
  findPartnerJobByRequest,
  getPartnerJob,
  insertPartnerJob,
  listPartnerJobs,
  toDeskJob,
} from "./hhh-shortlist-jobs.js";
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

const LIVE_LOCK_MS = 90_000;
const HANDOFF_AFTER_MS = 20_000;

type ShortlistDeps = { store: Store; admin: SupabaseClient; cells: PlaceCellStore };

function beginHhhShortlist(deps: ShortlistDeps, jobId: string, lock?: string): void {
  deferHhhSlice(
    runHhhChain(deps, jobId, lock).catch((err) => {
      console.error("[hhh-shortlist] slice failed", err instanceof Error ? err.message : err);
    }),
  );
}

/** Run stages in this invocation, then hand the rest to a fresh one before the 60s limit. */
async function runHhhChain(deps: ShortlistDeps, jobId: string, lock?: string): Promise<void> {
  const started = Date.now();
  let nextLock = lock;
  for (let step = 0; step < 6; step += 1) {
    if (step > 0 && Date.now() - started > HANDOFF_AFTER_MS) {
      scheduleHhhShortlistStep(jobId, nextLock);
      return;
    }
    const result = await runHhhShortlistSlice({
      admin: deps.admin,
      store: deps.store,
      cells: deps.cells,
      jobId,
      lock: nextLock,
    });
    const latest = await getPartnerJob(deps.admin, jobId);
    if (!latest || latest.status === "failed" || latest.status === "ready") return;
    if (!result.continue || !result.lock) return;
    nextLock = result.lock;
  }
  scheduleHhhShortlistStep(jobId, nextLock);
}

function nudgeIdleShortlist(
  deps: ShortlistDeps,
  job: { id: string; status: string; payload: Record<string, unknown> },
): void {
  if (job.status !== "queued" && job.status !== "running") return;
  const lock = typeof job.payload.lock === "string" ? job.payload.lock : "";
  const at = typeof job.payload.lockAt === "string" ? Date.parse(job.payload.lockAt) : Number.NaN;
  const fresh = Boolean(lock) && Number.isFinite(at) && Date.now() - at < LIVE_LOCK_MS;
  if (fresh) return;
  beginHhhShortlist(deps, job.id);
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
        nudgeIdleShortlist({ store: deps.store, admin: deps.admin, cells: deps.cells }, existing);
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
          lock: randomUUID(),
          lockAt: new Date().toISOString(),
          candidates: [],
          found: [],
          drops: [],
          fromCache: false,
          progress: [],
        },
      });
      const bootLock = typeof job.payload.lock === "string" ? job.payload.lock : undefined;
      beginHhhShortlist({ store: deps.store, admin: deps.admin, cells: deps.cells }, job.id, bootLock);
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
    const released = await releaseHeldSearch({
      admin: deps.admin,
      store: deps.store,
      cells: deps.cells,
      job,
    });
    if (released) return c.json({ jobId: job.id, status: "ready", ...released });
    nudgeIdleShortlist({ store: deps.store, admin: deps.admin, cells: deps.cells }, job);
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
      const { data: live } = await deps.admin
        .from("partner_jobs")
        .select("id,status,payload")
        .in("status", ["queued", "running"])
        .limit(5);
      for (const row of live ?? []) {
        nudgeIdleShortlist(
          { store: deps.store, admin: deps.admin, cells: deps.cells },
          row as { id: string; status: string; payload: Record<string, unknown> },
        );
      }
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

  app.post("/api/control/hhh-shortlist/abort-live", async (c) => {
    if (!isAdmin(c.get("auth"))) return c.json({ error: "Admin only" }, 403);
    if (!deps.admin) return c.json(engineUnavailable(), 503);
    try {
      const aborted = await abortLivePartnerJobs(deps.admin);
      return c.json({ aborted });
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : "Could not abort shortlist jobs" },
        500,
      );
    }
  });

  app.post("/api/control/hhh-shortlist/delete-recent", async (c) => {
    if (!isAdmin(c.get("auth"))) return c.json({ error: "Admin only" }, 403);
    if (!deps.admin) return c.json(engineUnavailable(), 503);
    const body = (await c.req.json().catch(() => null)) as { limit?: unknown } | null;
    const limit =
      typeof body?.limit === "number" && Number.isFinite(body.limit)
        ? body.limit
        : 40;
    try {
      await abortLivePartnerJobs(deps.admin);
      const deleted = await deleteRecentPartnerJobs(deps.admin, limit);
      return c.json({ deleted });
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : "Could not delete shortlist jobs" },
        500,
      );
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
    const existing = await getPartnerJob(admin, jobId);
    if (!existing || existing.status === "failed" || existing.status === "ready") {
      return c.json({ accepted: false, skipped: true, status: existing?.status ?? "missing" }, 200);
    }
    beginHhhShortlist({ store: deps.store, admin, cells: deps.cells }, jobId, lock);
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
