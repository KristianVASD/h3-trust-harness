import type { Hono } from "hono";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ADDRESS_SEARCH_STAGES,
  TRADE_IDS,
  cellIsFresh,
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
import type { PlaceCellStore } from "./place-cell-store.js";
import type { WorkerEvent, WorkerRun } from "./worker-progress.js";
import { PackOnboardError } from "./pack-onboard-route.js";
import { playbookIncoming, seedDoorPlaybook } from "./door-playbook-route.js";

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

export type PlaceProgressRow = {
  id: string;
  label: string;
  address: string;
  woonplaats?: string;
  gemeente?: string;
  postcode4?: string;
  radiusKm: number;
  updatedAt: string;
  fresh: boolean;
  finishedStages: string[];
  stageTotal: number;
  ecology: { ov: number; sport: number; festivity: number };
  candidateCount: number;
  missionId: string;
  run: {
    id: string;
    status: WorkerRun["status"];
    progress_pct: number;
    current_action: string | null;
    error: string | null;
    updated_at: string;
  } | null;
};

async function addressRunsByCell(
  admin: SupabaseClient | null,
): Promise<Map<string, WorkerRun>> {
  const map = new Map<string, WorkerRun>();
  if (!admin) return map;
  const { data, error } = await admin
    .from("worker_runs")
    .select("*")
    .eq("command", "address_search")
    .order("created_at", { ascending: false })
    .limit(80);
  if (error || !data) return map;
  for (const row of data as WorkerRun[]) {
    const id = (row.target_id ?? "").trim();
    if (!id || map.has(id)) continue;
    map.set(id, row);
  }
  return map;
}

export function registerControlRoutes(
  app: Hono<{ Variables: AppVariables }>,
  options: {
    store: Store;
    admin: SupabaseClient | null;
    landscapes: NationLandscapeStore;
    cells: PlaceCellStore;
    searchDemandMemory: SearchDemand[];
  },
): void {
  const { store, admin, landscapes, cells, searchDemandMemory } = options;

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
    const [landscape, doorsPack, demandsRaw, latestRun, allCells, runsByCell] =
      await Promise.all([
        landscapes.get(raw),
        buildCountryDoors(store, raw),
        listSearchDemands(admin, searchDemandMemory, 80),
        latestRunForTarget(admin, { countrySlug: slug }),
        cells.list(),
        addressRunsByCell(admin),
      ]);
    const jobs = await listDeskJobs(store, raw);
    const events = capEvents(await eventsForRun(admin, latestRun?.id));
    const demands = capDemands(aggregateSearchDemands(demandsRaw), raw);
    const places: PlaceProgressRow[] = allCells
      .filter((cell) => countrySlug(cell.countrySlug || cell.country) === slug)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((cell) => {
        const run = runsByCell.get(cell.id);
        return {
          id: cell.id,
          label: cell.label,
          address: cell.address,
          woonplaats: cell.woonplaats,
          gemeente: cell.gemeente,
          postcode4: cell.postcode4,
          radiusKm: cell.radiusKm,
          updatedAt: cell.updatedAt,
          fresh: cellIsFresh(cell.updatedAt),
          finishedStages: cell.finishedStages,
          stageTotal: ADDRESS_SEARCH_STAGES.length,
          ecology: {
            ov: cell.ecology.ov.length,
            sport: cell.ecology.sport.length,
            festivity: cell.ecology.festivity.length,
          },
          candidateCount: cell.candidates.length,
          missionId: cell.missionId,
          run: run
            ? {
                id: run.id,
                status: run.status,
                progress_pct: run.progress_pct,
                current_action: run.current_action,
                error: run.error,
                updated_at: run.updated_at,
              }
            : null,
        };
      });
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
      places,
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
              sourceCount: 0,
              missionCount: 0,
              trustedCount: 0,
              trustListCount: 0,
              identityToolCount: 0,
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

  app.post("/api/control/countries/:country/doors/:tradeId/playbook", async (c) => {
    const raw = decodeURIComponent(c.req.param("country"));
    const tradeRaw = c.req.param("tradeId");
    if (!TRADE_IDS.includes(tradeRaw as TradeId)) {
      return c.json({ error: "Unknown trade door" }, 404);
    }
    const body = await c.req.json().catch(() => null);
    try {
      const result = await seedDoorPlaybook(store, {
        country: raw,
        tradeId: tradeRaw,
        raw: playbookIncoming(body),
      });
      return c.json(result, result.createdMission ? 201 : 200);
    } catch (err) {
      if (err instanceof PackOnboardError) {
        return c.json({ error: err.message }, err.status as 400);
      }
      const message = err instanceof Error ? err.message : "Failed to seed door";
      return c.json({ error: message }, 500);
    }
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
