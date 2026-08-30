import type { Hono } from "hono";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  TRADE_IDS,
  coerceLandscapeInput,
  countrySlug,
  displayCountry,
  emptyNationLandscape,
  type TradeId,
} from "@h3-trust/schema";
import type { Store } from "@h3-trust/store";
import type { AppVariables } from "./auth.js";
import {
  aggregateSearchDemands,
  isAdmin,
  listSearchDemands,
  type SearchDemand,
} from "./auth.js";
import {
  buildCountryDoors,
  buildCountryIndex,
  buildDoorListStyles,
  capDemands,
  capEvents,
  listDeskJobs,
} from "./control-desk.js";
import type { NationLandscapeStore } from "./nation-landscape-store.js";
import type { WorkerEvent, WorkerRun } from "./worker-progress.js";

async function latestNationRuns(
  admin: SupabaseClient | null,
): Promise<Map<string, WorkerRun>> {
  const map = new Map<string, WorkerRun>();
  if (!admin) return map;
  const { data, error } = await admin
    .from("worker_runs")
    .select("*")
    .eq("command", "nation_map")
    .order("created_at", { ascending: false })
    .limit(40);
  if (error || !data) return map;
  for (const row of data as WorkerRun[]) {
    const slug = (row.target_id ?? "").trim();
    if (!slug || map.has(slug)) continue;
    map.set(slug, row);
  }
  return map;
}

async function latestRunForTarget(
  admin: SupabaseClient | null,
  args: { countrySlug?: string; missionId?: string },
): Promise<WorkerRun | null> {
  if (!admin) return null;
  let query = admin
    .from("worker_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1);
  if (args.countrySlug) {
    query = query.eq("command", "nation_map").eq("target_id", args.countrySlug);
  } else if (args.missionId) {
    query = query.eq("mission_id", args.missionId);
  } else {
    return null;
  }
  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  return data as WorkerRun;
}

async function eventsForRun(
  admin: SupabaseClient | null,
  runId: string | undefined,
): Promise<WorkerEvent[]> {
  if (!admin || !runId) return [];
  const { data, error } = await admin
    .from("worker_events")
    .select("*")
    .eq("run_id", runId)
    .order("created_at", { ascending: false })
    .limit(5);
  if (error || !data) return [];
  return data as WorkerEvent[];
}

export function registerControlRoutes(
  app: Hono<{ Variables: AppVariables }>,
  options: {
    store: Store;
    admin: SupabaseClient | null;
    landscapes: NationLandscapeStore;
    searchDemandMemory: SearchDemand[];
  },
): void {
  const { store, admin, landscapes, searchDemandMemory } = options;

  app.get("/api/control/countries", async (c) => {
    const [known, lastRuns] = await Promise.all([
      landscapes.list(),
      latestNationRuns(admin),
    ]);
    const countries = await buildCountryIndex(store, known, lastRuns);
    return c.json({ countries });
  });

  app.post("/api/control/countries", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      country?: unknown;
      map?: unknown;
    } | null;
    const country =
      typeof body?.country === "string" ? body.country.trim() : "";
    if (!country) return c.json({ error: "country is required" }, 400);
    const { landscape, created } = await landscapes.ensure(country);
    let run: WorkerRun | null = null;
    if (body?.map === true) {
      const auth = c.get("auth");
      if (!isAdmin(auth)) {
        return c.json({ landscape, created, run: null, error: "Admin only to map" }, 403);
      }
      if (!admin) {
        return c.json(
          {
            landscape,
            created,
            run: null,
            error: "Engine requires Supabase",
          },
          503,
        );
      }
      run = await enqueueNationMap(admin, landscape.countrySlug, landscape.country);
      if (landscape.status === "empty") {
        await landscapes.upsert({ ...landscape, status: "mapping" });
      }
    }
    return c.json({ landscape, created, run }, created ? 201 : 200);
  });

  app.get("/api/control/countries/:country", async (c) => {
    const raw = decodeURIComponent(c.req.param("country"));
    const slug = countrySlug(raw);
    const [landscape, doorsPack, demandsRaw, latestRun] = await Promise.all([
      landscapes.get(raw),
      buildCountryDoors(store, raw),
      listSearchDemands(admin, searchDemandMemory, 80),
      latestRunForTarget(admin, { countrySlug: slug }),
    ]);
    const jobs = await listDeskJobs(store, raw);
    const events = capEvents(await eventsForRun(admin, latestRun?.id));
    const demands = capDemands(aggregateSearchDemands(demandsRaw), raw);
    return c.json({
      country: landscape?.country ?? displayCountry(raw),
      countrySlug: slug,
      landscape: landscape ?? emptyNationLandscape(raw),
      doors: doorsPack.doors,
      directory: doorsPack.directory ?? null,
      jobs,
      demands,
      latestRun,
      events,
    });
  });

  app.get("/api/control/countries/:country/landscape", async (c) => {
    const raw = decodeURIComponent(c.req.param("country"));
    const landscape = (await landscapes.get(raw)) ?? emptyNationLandscape(raw);
    return c.json({ landscape });
  });

  app.put("/api/control/countries/:country/landscape", async (c) => {
    const raw = decodeURIComponent(c.req.param("country"));
    const body = await c.req.json().catch(() => null);
    const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
    const incoming =
      typeof rec?.text === "string"
        ? rec.text
        : rec && "landscape" in rec
          ? rec.landscape
          : body;
    const existing = await landscapes.get(raw);
    const landscape = coerceLandscapeInput(incoming, raw, existing);
    try {
      const saved = await landscapes.upsert(landscape);
      return c.json({ landscape: saved });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save landscape";
      const missingTable = /nation_landscapes/i.test(message);
      return c.json(
        {
          error: missingTable
            ? "Supabase table nation_landscapes is missing. Apply migration 20260831_nation_landscape.sql, then import again."
            : message,
        },
        500,
      );
    }
  });

  app.get("/api/control/countries/:country/doors/:tradeId", async (c) => {
    const raw = decodeURIComponent(c.req.param("country"));
    const tradeRaw = c.req.param("tradeId");
    if (!TRADE_IDS.includes(tradeRaw as TradeId) && tradeRaw !== "unclassified") {
      return c.json({ error: "Unknown trade door" }, 404);
    }
    const tradeId = tradeRaw as TradeId;
    const [styles, jobs, demandsRaw] = await Promise.all([
      tradeRaw === "unclassified"
        ? buildCountryDoors(store, raw).then((pack) => ({
            door: pack.directory ?? {
              key: `${countrySlug(raw)}|directory`,
              country: displayCountry(raw),
              sector: "Local Directory",
              subsector: "Unclassified",
              companyCount: 0,
              missionCount: 0,
              trustedCount: 0,
              nationalSourceCount: 0,
              localSourceCount: 0,
              searchable: false,
              status: "empty" as const,
              directory: true,
              listNames: [] as string[],
            },
            groups: [],
            directorySources: [],
          }))
        : buildDoorListStyles(store, raw, tradeId),
      listDeskJobs(store, raw, tradeRaw === "unclassified" ? undefined : tradeId),
      listSearchDemands(admin, searchDemandMemory, 80),
    ]);
    const latestRun = await latestRunForTarget(admin, {
      missionId: styles.door.nationalPackId,
    });
    const events = capEvents(await eventsForRun(admin, latestRun?.id));
    const demands = capDemands(
      aggregateSearchDemands(demandsRaw),
      raw,
      tradeRaw === "unclassified" ? undefined : tradeId,
    );
    return c.json({
      country: displayCountry(raw),
      countrySlug: countrySlug(raw),
      tradeId: tradeRaw,
      door: styles.door,
      groups: styles.groups,
      directorySources: styles.directorySources,
      jobs:
        tradeRaw === "unclassified"
          ? jobs.filter((j) => j.directory)
          : jobs.filter((j) => !j.directory),
      demands,
      latestRun,
      events,
    });
  });
}

export async function enqueueNationMap(
  admin: SupabaseClient,
  countrySlugValue: string,
  countryLabel: string,
  model?: string,
): Promise<WorkerRun> {
  const input: Record<string, unknown> = { country: countryLabel };
  if (model) input.model = model;
  const { data, error } = await admin
    .from("worker_runs")
    .insert({
      mission_id: null,
      command: "nation_map",
      target_type: "country",
      target_id: countrySlugValue,
      status: "queued",
      current_action: `Map trust landscape · ${countryLabel}`,
      input,
      step_total: 12,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to enqueue nation_map");
  }
  const run = data as WorkerRun;
  await admin.from("worker_events").insert({
    run_id: run.id,
    mission_id: null,
    level: "info",
    event_type: "queued",
    message: `Queued nation_map for ${countryLabel}`,
    data: { country: countryLabel, countrySlug: countrySlugValue },
  });
  return run;
}
