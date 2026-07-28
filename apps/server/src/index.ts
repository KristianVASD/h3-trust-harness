import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  CollectionNameSchema,
  DEFAULT_SEARCH_PLAN_VERSION,
  SearchPlanSchema,
  computeMissionCoverage,
  type CollectionName,
  type Mission,
  type Producer,
  type SearchPlan,
  type Source,
} from "@h3-trust/schema";
import { FileStore } from "@h3-trust/store";
import {
  DiscoverRouteError,
  runDiscoverForMission,
} from "./omega/discover-route.js";
import {
  ProbeRouteError,
  runProbeForMission,
} from "./omega/probe-route.js";
import {
  ExtractRouteError,
  runExtractForSource,
} from "./omega/extract-route.js";
import {
  BarrierRouteError,
  declineBarrierForSource,
  fulfillBarrierForSource,
} from "./omega/barrier-route.js";
import {
  HarvestRouteError,
  runHarvestForCompany,
} from "./omega/harvest-route.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const writableRoot = path.resolve(__dirname, "../../../writable");
const searchPlansRoot = path.resolve(__dirname, "../../../searchplans");
const store = new FileStore(writableRoot);

async function listSearchPlanVersions(): Promise<string[]> {
  try {
    const files = await readdir(searchPlansRoot);
    return files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/i, ""))
      .sort();
  } catch {
    return [];
  }
}

async function loadSearchPlan(version: string): Promise<SearchPlan | null> {
  const safe = version.replace(/[^a-zA-Z0-9._-]/g, "");
  if (!safe) return null;
  try {
    const raw = await readFile(
      path.join(searchPlansRoot, `${safe}.json`),
      "utf8",
    );
    return SearchPlanSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

const app = new Hono();

app.use(
  "*",
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
  }),
);

app.get("/api/health", (c) =>
  c.json({ ok: true, service: "h3-trust-harness", writableRoot }),
);

/** Shared (non-mission) search plans — versioned under /searchplans. */
app.get("/api/searchplans", async (c) => {
  const versions = await listSearchPlanVersions();
  const latest = versions.includes(DEFAULT_SEARCH_PLAN_VERSION)
    ? DEFAULT_SEARCH_PLAN_VERSION
    : (versions[versions.length - 1] ?? DEFAULT_SEARCH_PLAN_VERSION);
  return c.json({ versions, latest });
});

app.get("/api/searchplans/:version", async (c) => {
  const plan = await loadSearchPlan(c.req.param("version"));
  if (!plan) return c.json({ error: "Search plan not found" }, 404);
  return c.json(plan);
});

app.get("/api/missions", async (c) => {
  const missions = await store.listMissions();
  return c.json(missions);
});

app.get("/api/missions/:id", async (c) => {
  const mission = await store.getMission(c.req.param("id"));
  if (!mission) return c.json({ error: "Not found" }, 404);
  return c.json(mission);
});

app.post("/api/missions", async (c) => {
  const body = await c.req.json();
  const mission = await store.upsertMission(body as Mission);
  // Reuse CARA-confirmed national + same-location lists so Data Worker
  // is not empty on a new sector / location mission.
  try {
    await store.warmStartMissionSources(mission.id, mission.location);
  } catch {
    /* mission still created; worker can link sources manually */
  }
  return c.json(mission, 201);
});

app.put("/api/missions/:id", async (c) => {
  const body = await c.req.json();
  if (body.id !== c.req.param("id")) {
    return c.json({ error: "ID mismatch" }, 400);
  }
  const mission = await store.upsertMission(body as Mission);
  return c.json(mission);
});

app.delete("/api/missions/:id", async (c) => {
  const ok = await store.deleteMission(c.req.param("id"));
  if (!ok) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

/**
 * Phase 3 — Ask Ω on one open gap cell.
 * Runs runOcCommand("discover"), persists provisional candidates, returns skipped.
 */
app.post("/api/missions/:missionId/omega/discover", async (c) => {
  const missionId = c.req.param("missionId");
  const body = await c.req.json();
  try {
    const result = await runDiscoverForMission(store, missionId, body);
    return c.json(result, 201);
  } catch (err) {
    if (err instanceof DiscoverRouteError) {
      return c.json({ error: err.message }, err.status);
    }
    return c.json(
      { error: err instanceof Error ? err.message : "Discover failed" },
      400,
    );
  }
});

/**
 * Phase 4 — Probe one source.
 * Runs runOcCommand("probe"), merges richness + extractionGuide onto the Source.
 */
app.post("/api/missions/:missionId/omega/probe", async (c) => {
  const missionId = c.req.param("missionId");
  const body = await c.req.json();
  try {
    const result = await runProbeForMission(
      store,
      missionId,
      body,
      loadSearchPlan,
    );
    return c.json(result);
  } catch (err) {
    if (err instanceof ProbeRouteError) {
      return c.json({ error: err.message }, err.status);
    }
    return c.json(
      { error: err instanceof Error ? err.message : "Probe failed" },
      400,
    );
  }
});

/**
 * Phase 6 — Gated extract for one accepted+probed source.
 * Blocked sources never reach the scraper.
 */
app.post(
  "/api/missions/:missionId/sources/:sourceId/extract",
  async (c) => {
    try {
      const result = await runExtractForSource(
        store,
        c.req.param("missionId"),
        c.req.param("sourceId"),
      );
      return c.json(result, 201);
    } catch (err) {
      if (err instanceof ExtractRouteError) {
        return c.json({ error: err.message }, err.status);
      }
      return c.json(
        { error: err instanceof Error ? err.message : "Extract failed" },
        400,
      );
    }
  },
);

/** Phase 6 — Human fulfils an Ω-raised access barrier. */
app.post(
  "/api/missions/:missionId/sources/:sourceId/barriers/:barrierId/fulfill",
  async (c) => {
    const body = await c.req.json();
    try {
      const result = await fulfillBarrierForSource(
        store,
        c.req.param("missionId"),
        c.req.param("sourceId"),
        c.req.param("barrierId"),
        body.fulfillment ?? body,
      );
      return c.json(result);
    } catch (err) {
      if (err instanceof BarrierRouteError) {
        return c.json({ error: err.message }, err.status);
      }
      return c.json(
        { error: err instanceof Error ? err.message : "Fulfill failed" },
        400,
      );
    }
  },
);

/** Phase 6 — Human declines a barrier (mandatory reason). */
app.post(
  "/api/missions/:missionId/sources/:sourceId/barriers/:barrierId/decline",
  async (c) => {
    const body = await c.req.json();
    try {
      const result = await declineBarrierForSource(
        store,
        c.req.param("missionId"),
        c.req.param("sourceId"),
        c.req.param("barrierId"),
        body,
      );
      return c.json(result);
    } catch (err) {
      if (err instanceof BarrierRouteError) {
        return c.json({ error: err.message }, err.status);
      }
      return c.json(
        { error: err instanceof Error ? err.message : "Decline failed" },
        400,
      );
    }
  },
);

/**
 * Phase 7 — Harvest company profile (Can / For / Notable).
 * Soft-fails with harvest-failed Observation; never raises a barrier.
 */
app.post(
  "/api/missions/:missionId/companies/:companyId/harvest",
  async (c) => {
    try {
      const result = await runHarvestForCompany(
        store,
        c.req.param("missionId"),
        c.req.param("companyId"),
      );
      return c.json(result);
    } catch (err) {
      if (err instanceof HarvestRouteError) {
        return c.json({ error: err.message }, err.status);
      }
      return c.json(
        { error: err instanceof Error ? err.message : "Harvest failed" },
        400,
      );
    }
  },
);

/**
 * Phase 8 — Barrier-aware mission coverage (pure, computed on read).
 */
app.get("/api/missions/:missionId/coverage", async (c) => {
  const missionId = c.req.param("missionId");
  const mission = await store.getMission(missionId);
  if (!mission) return c.json({ error: "Not found" }, 404);
  const [sources, companies] = await Promise.all([
    store.listByMission("sources", missionId),
    store.listByMission("companies", missionId),
  ]);
  const plan = await loadSearchPlan(
    mission.search_plan_version || DEFAULT_SEARCH_PLAN_VERSION,
  );
  const coverage = computeMissionCoverage({
    sources,
    companies,
    planEntries: plan?.entries ?? [],
  });
  return c.json(coverage);
});

/** Link reusable catalogue sources into an existing mission (idempotent). */
app.post("/api/missions/:missionId/sources/warm-start", async (c) => {
  const missionId = c.req.param("missionId");
  const mission = await store.getMission(missionId);
  if (!mission) return c.json({ error: "Not found" }, 404);
  try {
    const linked = await store.warmStartMissionSources(
      missionId,
      mission.location,
    );
    return c.json({ linked: linked.length, sources: linked });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Warm-start failed" },
      400,
    );
  }
});

/** Create a new catalogue Source and link it to this mission. */
app.post("/api/missions/:missionId/sources", async (c) => {
  const missionId = c.req.param("missionId");
  const body = await c.req.json();
  try {
    const saved = await store.createSourceInMission(missionId, body as Source);
    return c.json(saved, 201);
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Create source failed" },
      400,
    );
  }
});

/** Link an existing Source into this mission (reuse). */
app.post("/api/missions/:missionId/sources/link", async (c) => {
  const missionId = c.req.param("missionId");
  const body = await c.req.json();
  const sourceId = body.sourceId as string | undefined;
  if (!sourceId) {
    return c.json({ error: "sourceId required" }, 400);
  }
  try {
    const result = await store.linkSourceToMission(
      missionId,
      sourceId,
      (body.producer as Producer | undefined) ?? "Human",
    );
    return c.json(result, 201);
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Link failed" },
      400,
    );
  }
});

app.get("/api/sources/linkable", async (c) => {
  const excludeMission = c.req.query("excludeMission");
  if (!excludeMission) {
    return c.json({ error: "excludeMission required" }, 400);
  }
  const q = c.req.query("q") ?? "";
  const items = await store.listLinkableSources(excludeMission, q);
  return c.json(items);
});

/** Full catalogue for mechanical coverage queries. */
app.get("/api/sources", async (c) => {
  return c.json(await store.listAllSources());
});

const missionCollections = CollectionNameSchema.options.filter(
  (name) =>
    name !== "missions" &&
    name !== "patterns" &&
    name !== "sources",
) as Exclude<CollectionName, "missions" | "patterns" | "sources">[];

for (const collection of missionCollections) {
  app.get(`/api/missions/:missionId/${collection}`, async (c) => {
    const items = await store.listByMission(collection, c.req.param("missionId"));
    return c.json(items);
  });

  app.post(`/api/missions/:missionId/${collection}`, async (c) => {
    const body = await c.req.json();
    const missionId = c.req.param("missionId");
    // missionSources use mission_id; others use missionId
    if (collection === "missionSources") {
      if (body.mission_id !== missionId) {
        return c.json({ error: "mission_id mismatch" }, 400);
      }
    } else if (body.missionId !== missionId) {
      return c.json({ error: "missionId mismatch" }, 400);
    }
    const saved = await store.upsert(collection, body);
    return c.json(saved, 201);
  });

  app.put(`/api/${collection}/:id`, async (c) => {
    const body = await c.req.json();
    if (body.id !== c.req.param("id")) {
      return c.json({ error: "ID mismatch" }, 400);
    }
    const saved = await store.upsert(collection, body);
    return c.json(saved);
  });

  app.delete(`/api/${collection}/:id`, async (c) => {
    const ok = await store.remove(collection, c.req.param("id"));
    return c.json({ ok });
  });
}

// Sources PUT/DELETE (catalogue entity — not mission-prefixed create)
app.put("/api/sources/:id", async (c) => {
  const body = await c.req.json();
  if (body.id !== c.req.param("id")) {
    return c.json({ error: "ID mismatch" }, 400);
  }
  const saved = await store.upsert("sources", body);
  return c.json(saved);
});

app.delete("/api/sources/:id", async (c) => {
  const ok = await store.remove("sources", c.req.param("id"));
  return c.json({ ok });
});

app.get("/api/missions/:missionId/sources", async (c) => {
  const items = await store.listByMission("sources", c.req.param("missionId"));
  return c.json(items);
});

app.get("/api/patterns", async (c) => {
  return c.json(await store.listPatterns());
});

app.post("/api/patterns", async (c) => {
  const body = await c.req.json();
  const saved = await store.upsert("patterns", body);
  return c.json(saved, 201);
});

app.get("/api/missions/:id/export", async (c) => {
  try {
    const bundle = await store.exportBundle(c.req.param("id"));
    const exportDir = path.join(writableRoot, "export");
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(exportDir, { recursive: true });
    const outPath = path.join(exportDir, `${c.req.param("id")}.json`);
    await writeFile(outPath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
    return c.json(bundle);
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Export failed" },
      404,
    );
  }
});

const port = Number(process.env.PORT ?? 8787);

console.log(`H3 Trust API listening on http://localhost:${port}`);
console.log(`Writable root: ${writableRoot}`);

serve({ fetch: app.fetch, port });
