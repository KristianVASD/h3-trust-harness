import type { Hono } from "hono";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TradeId } from "@h3-trust/schema";
import type { Store } from "@h3-trust/store";
import { isAdmin, type AppVariables } from "./auth.js";
import { enqueueNationHarvest, enqueuePlaceTest } from "./nation-harvest.js";
import {
  isWorkerCommand,
  isWorkerStatus,
  isWorkerTargetType,
  type WorkerEvent,
  type WorkerRun,
} from "./worker-progress.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function engineUnavailable() {
  return {
    error: "Engine requires Supabase (set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY).",
    code: "engine_unavailable",
  };
}

async function insertEvent(
  db: SupabaseClient,
  row: {
    run_id: string;
    mission_id: string | null;
    level?: string;
    event_type: string;
    step_name?: string;
    message: string;
    data?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await db.from("worker_events").insert({
    run_id: row.run_id,
    mission_id: row.mission_id,
    level: row.level ?? "info",
    event_type: row.event_type,
    step_name: row.step_name ?? null,
    message: row.message,
    data: row.data ?? {},
  });
  if (error) {
    console.error("[worker_events] insert failed", error.message);
  }
}

export function registerWorkerAdminRoutes(
  app: Hono<{ Variables: AppVariables }>,
  options: { admin: SupabaseClient | null; store: Store },
): void {
  const { admin, store } = options;

  app.get("/api/missions/:missionId/worker/active", async (c) => {
    if (!admin) return c.json({ run: null });
    const missionId = c.req.param("missionId");
    if (!UUID_RE.test(missionId)) {
      return c.json({ error: "Invalid mission id" }, 400);
    }
    const { data, error } = await admin
      .from("worker_runs")
      .select(
        "id, mission_id, command, status, current_action, progress_pct, heartbeat_at, created_at",
      )
      .eq("mission_id", missionId)
      .in("status", ["queued", "running", "waiting_human"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return c.json({ error: error.message }, 400);
    return c.json({ run: (data as WorkerRun | null) ?? null });
  });

  app.get("/api/admin/worker/runs", async (c) => {
    const auth = c.get("auth");
    if (!isAdmin(auth)) return c.json({ error: "Admin only" }, 403);
    if (!admin) return c.json(engineUnavailable(), 503);

    let query = admin
      .from("worker_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    const missionId = c.req.query("missionId")?.trim();
    if (missionId) {
      if (!UUID_RE.test(missionId)) {
        return c.json({ error: "Invalid missionId" }, 400);
      }
      query = query.eq("mission_id", missionId);
    }
    const status = c.req.query("status")?.trim();
    if (status) {
      if (!isWorkerStatus(status)) {
        return c.json({ error: "Invalid status" }, 400);
      }
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) return c.json({ error: error.message }, 400);
    return c.json({ runs: (data ?? []) as WorkerRun[] });
  });

  app.get("/api/admin/worker/runs/:id", async (c) => {
    const auth = c.get("auth");
    if (!isAdmin(auth)) return c.json({ error: "Admin only" }, 403);
    if (!admin) return c.json(engineUnavailable(), 503);

    const id = c.req.param("id");
    const { data: run, error } = await admin
      .from("worker_runs")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) return c.json({ error: error.message }, 400);
    if (!run) return c.json({ error: "Run not found" }, 404);

    const { data: events, error: evErr } = await admin
      .from("worker_events")
      .select("*")
      .eq("run_id", id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (evErr) return c.json({ error: evErr.message }, 400);

    return c.json({
      run: run as WorkerRun,
      events: ((events ?? []) as WorkerEvent[]).reverse(),
    });
  });

  app.get("/api/admin/worker/runs/:id/events", async (c) => {
    const auth = c.get("auth");
    if (!isAdmin(auth)) return c.json({ error: "Admin only" }, 403);
    if (!admin) return c.json(engineUnavailable(), 503);

    const { data, error } = await admin
      .from("worker_events")
      .select("*")
      .eq("run_id", c.req.param("id"))
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) return c.json({ error: error.message }, 400);
    return c.json({ events: (data ?? []) as WorkerEvent[] });
  });

  app.post("/api/admin/worker/runs", async (c) => {
    const auth = c.get("auth");
    if (!isAdmin(auth)) return c.json({ error: "Admin only" }, 403);
    if (!admin) return c.json(engineUnavailable(), 503);

    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return c.json({ error: "JSON body required" }, 400);
    }
    const rec = body as Record<string, unknown>;
    const missionId =
      typeof rec.missionId === "string" ? rec.missionId.trim() : "";
    const command = typeof rec.command === "string" ? rec.command.trim() : "";
    if (!isWorkerCommand(command)) {
      return c.json({ error: "Invalid command" }, 400);
    }

    const isNationMap = command === "nation_map";
    const isNationHarvest = command === "nation_harvest";
    const isPlaceTest = command === "place_test";
    if (isNationHarvest || isPlaceTest) {
      const country =
        typeof rec.country === "string" ? rec.country.trim() : "Netherlands";
      const model =
        typeof rec.model === "string" ? rec.model.trim() || undefined : undefined;
      try {
        if (isNationHarvest) {
          const { parent, children } = await enqueueNationHarvest({
            admin,
            store,
            country,
            model,
          });
          await insertEvent(admin, {
            run_id: parent.id,
            mission_id: null,
            event_type: "queued",
            message: `Queued ${children.length} sector doors for ${country}`,
            data: {
              childRunIds: children.map((r) => r.id),
              model: model ?? null,
              country,
            },
          });
          return c.json({ run: parent, children }, 201);
        }
        const location =
          typeof rec.location === "string" ? rec.location.trim() : "Alkmaar";
        const tradeRaw =
          typeof rec.tradeId === "string" ? rec.tradeId.trim() : "paint";
        const { run, missionId: placeMissionId, created } = await enqueuePlaceTest({
          admin,
          store,
          country,
          location,
          tradeId: tradeRaw as TradeId,
          model,
        });
        await insertEvent(admin, {
          run_id: run.id,
          mission_id: placeMissionId,
          event_type: "queued",
          message: `Queued place test ${location} · ${tradeRaw}${created ? " (new mission)" : ""}`,
          data: { location, tradeId: tradeRaw, model: model ?? null, country },
        });
        return c.json({ run }, 201);
      } catch (err) {
        return c.json(
          { error: err instanceof Error ? err.message : "Failed to enqueue" },
          400,
        );
      }
    }
    if (!isNationMap && !UUID_RE.test(missionId)) {
      return c.json({ error: "missionId (uuid) required" }, 400);
    }

    const mission = missionId ? await store.getMission(missionId) : null;
    if (!isNationMap && !mission) {
      return c.json({ error: "Mission not found" }, 404);
    }

    const targetTypeRaw =
      typeof rec.targetType === "string" ? rec.targetType.trim() : "";
    const targetType = targetTypeRaw
      ? isWorkerTargetType(targetTypeRaw)
        ? targetTypeRaw
        : null
      : isNationMap
        ? "country"
        : command === "full_mission"
          ? "mission"
          : null;
    if (targetTypeRaw && !targetType) {
      return c.json({ error: "Invalid targetType" }, 400);
    }
    const targetId =
      typeof rec.targetId === "string" ? rec.targetId.trim() || null : null;
    const country =
      typeof rec.country === "string" ? rec.country.trim() : "";
    const model =
      typeof rec.model === "string" ? rec.model.trim() || undefined : undefined;

    const input: Record<string, unknown> = {};
    if (model) input.model = model;
    if (country) input.country = country;

    const { data, error } = await admin
      .from("worker_runs")
      .insert({
        mission_id: isNationMap ? null : missionId,
        command,
        target_type: targetType,
        target_id: targetId,
        status: "queued",
        current_action: isNationMap
          ? `Queued nation map · ${country || targetId || "country"}`
          : "Queued",
        input,
        step_total: command === "full_mission" ? 8 : command === "nation_map" ? 12 : 1,
      })
      .select("*")
      .single();
    if (error || !data) {
      return c.json({ error: error?.message ?? "Failed to enqueue" }, 400);
    }
    const run = data as WorkerRun;
    await insertEvent(admin, {
      run_id: run.id,
      mission_id: isNationMap ? null : missionId,
      event_type: "queued",
      message: isNationMap
        ? `Queued ${command} for ${country || targetId || "country"}`
        : `Queued ${command} for ${mission?.location} · ${mission?.subsector}`,
      data: { command, targetType, targetId, model: model ?? null, country },
    });
    return c.json({ run }, 201);
  });

  app.post("/api/admin/worker/runs/:id/cancel", async (c) => {
    const auth = c.get("auth");
    if (!isAdmin(auth)) return c.json({ error: "Admin only" }, 403);
    if (!admin) return c.json(engineUnavailable(), 503);

    const now = new Date().toISOString();
    const { data, error } = await admin
      .from("worker_runs")
      .update({
        status: "cancelled",
        current_action: "Cancelled",
        finished_at: now,
        updated_at: now,
      })
      .eq("id", c.req.param("id"))
      .in("status", ["queued", "running", "waiting_human"])
      .select("*")
      .maybeSingle();
    if (error) return c.json({ error: error.message }, 400);
    if (!data) {
      return c.json({ error: "Run is not cancellable" }, 409);
    }
    const run = data as WorkerRun;
    await insertEvent(admin, {
      run_id: run.id,
      mission_id: run.mission_id,
      level: "warn",
      event_type: "cancelled",
      message: "Run cancelled by admin",
    });
    return c.json({ run });
  });

  app.post("/api/admin/worker/runs/:id/retry", async (c) => {
    const auth = c.get("auth");
    if (!isAdmin(auth)) return c.json({ error: "Admin only" }, 403);
    if (!admin) return c.json(engineUnavailable(), 503);

    const { data: original, error } = await admin
      .from("worker_runs")
      .select("*")
      .eq("id", c.req.param("id"))
      .maybeSingle();
    if (error) return c.json({ error: error.message }, 400);
    if (!original) return c.json({ error: "Run not found" }, 404);
    const src = original as WorkerRun;
    if (src.status !== "failed" && src.status !== "cancelled") {
      return c.json({ error: "Only failed or cancelled runs can be retried" }, 409);
    }

    const { data, error: insErr } = await admin
      .from("worker_runs")
      .insert({
        mission_id: src.mission_id,
        command: src.command,
        target_type: src.target_type,
        target_id: src.target_id,
        status: "queued",
        current_action: "Queued (retry)",
        input: src.input ?? {},
        step_total: src.step_total || 1,
      })
      .select("*")
      .single();
    if (insErr || !data) {
      return c.json({ error: insErr?.message ?? "Retry failed" }, 400);
    }
    const run = data as WorkerRun;
    await insertEvent(admin, {
      run_id: run.id,
      mission_id: run.mission_id,
      event_type: "queued",
      message: `Retry of ${src.id} queued`,
      data: { retriedFrom: src.id },
    });
    return c.json({ run }, 201);
  });
}
