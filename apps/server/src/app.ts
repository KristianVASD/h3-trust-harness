import { randomUUID } from "node:crypto";
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { getCookie, setCookie } from "hono/cookie";
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
import type { Store } from "@h3-trust/store";
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
import {
  SEARCH_COOKIE,
  SEARCH_LIMIT,
  SEARCH_SESSION_HEADER,
  authMiddleware,
  canWrite,
  consumeSearch,
  createSupabaseAdmin,
  ensureSearchSession,
  isAdmin,
  isAuthRequired,
  isValidSearchSessionId,
  requireWrite,
  type AppVariables,
  type Profile,
} from "./auth.js";

export type CreateAppOptions = {
  store: Store;
  searchPlansRoot: string;
  /** Optional local export dir; skipped on serverless when unset. */
  writableRoot?: string;
  corsOrigins?: string[];
};

export function createApp(options: CreateAppOptions) {
  const { store, searchPlansRoot, writableRoot } = options;
  const admin = createSupabaseAdmin();
  const authRequired = isAuthRequired();
  const searchMemory = new Map<string, number>();

  const corsOrigins = options.corsOrigins ?? [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    ...(process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim())
      : []),
  ];

  const app = new Hono<{ Variables: AppVariables }>();

  app.use(
    "*",
    cors({
      origin: (origin) => {
        if (!origin) return corsOrigins[0] ?? "*";
        if (corsOrigins.includes(origin)) return origin;
        // Allow any Vercel preview/production host without re-deploying CORS_ORIGIN
        if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) return origin;
        return corsOrigins[0] ?? origin;
      },
      credentials: true,
      allowHeaders: [
        "Content-Type",
        "Authorization",
        "X-H3-Search-Session",
      ],
    }),
  );

  app.use("*", authMiddleware(admin, authRequired));

  // Mutating routes need write privilege when auth is on
  app.use("/api/*", requireWrite());

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

  app.get("/api/health", (c) =>
    c.json({
      ok: true,
      service: "h3-trust-harness",
      storeDriver: process.env.STORE_DRIVER ?? "file",
      authRequired,
      hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
      hasServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      hasAdminEmail: Boolean(process.env.ADMIN_EMAIL),
      writableRoot: writableRoot ?? null,
    }),
  );

  // ---- Auth / profile ----------------------------------------------------

  app.get("/api/me", async (c) => {
    const auth = c.get("auth");
    if (!auth) {
      if (!authRequired) {
        return c.json({
          authRequired: false,
          user: null,
          profile: null,
          openMode: true,
        });
      }
      return c.json({ error: "Not authenticated", code: "auth_required" }, 401);
    }
    return c.json({
      authRequired,
      user: { id: auth.user.id, email: auth.user.email },
      profile: auth.profile,
      canWrite: canWrite(auth, authRequired),
      isAdmin: isAdmin(auth),
    });
  });

  app.patch("/api/me", async (c) => {
    const auth = c.get("auth");
    if (!auth || !admin) {
      return c.json({ error: "Authentication required" }, 401);
    }
    const body = await c.req.json();
    const patch: Partial<Profile> = {
      updated_at: new Date().toISOString(),
    };
    if (typeof body.display_name === "string") {
      patch.display_name = body.display_name.trim() || null;
    }
    if (typeof body.preferred_location === "string") {
      patch.preferred_location = body.preferred_location.trim() || null;
    }
    const { data, error } = await admin
      .from("profiles")
      .update(patch)
      .eq("id", auth.profile.id)
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 400);
    return c.json({ profile: data });
  });

  app.get("/api/admin/volunteers", async (c) => {
    const auth = c.get("auth");
    if (!isAdmin(auth) || !admin) {
      return c.json({ error: "Admin only" }, 403);
    }
    const { data, error } = await admin
      .from("profiles")
      .select("*")
      .eq("role", "curad_volunteer")
      .order("created_at", { ascending: false });
    if (error) return c.json({ error: error.message }, 400);
    return c.json({ volunteers: data ?? [] });
  });

  app.post("/api/admin/volunteers/:id/approve", async (c) => {
    const auth = c.get("auth");
    if (!isAdmin(auth) || !admin) {
      return c.json({ error: "Admin only" }, 403);
    }
    const { data, error } = await admin
      .from("profiles")
      .update({
        status: "approved",
        updated_at: new Date().toISOString(),
      })
      .eq("id", c.req.param("id"))
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 400);
    return c.json({ profile: data });
  });

  app.post("/api/admin/volunteers/:id/reject", async (c) => {
    const auth = c.get("auth");
    if (!isAdmin(auth) || !admin) {
      return c.json({ error: "Admin only" }, 403);
    }
    const { data, error } = await admin
      .from("profiles")
      .update({
        status: "rejected",
        updated_at: new Date().toISOString(),
      })
      .eq("id", c.req.param("id"))
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 400);
    return c.json({ profile: data });
  });

  // ---- Anonymous search session ------------------------------------------

  function resolveSearchSessionId(c: {
    req: { header: (name: string) => string | undefined };
  }): { sessionId: string; isNew: boolean } {
    const fromHeader = c.req.header(SEARCH_SESSION_HEADER)?.trim();
    if (isValidSearchSessionId(fromHeader)) {
      return { sessionId: fromHeader!, isNew: false };
    }
    const fromCookie = getCookie(c as never, SEARCH_COOKIE)?.trim();
    if (isValidSearchSessionId(fromCookie)) {
      return { sessionId: fromCookie!, isNew: false };
    }
    return { sessionId: randomUUID(), isNew: true };
  }

  function attachSearchSessionCookie(
    c: Parameters<typeof setCookie>[0],
    sessionId: string,
  ) {
    setCookie(c, SEARCH_COOKIE, sessionId, {
      httpOnly: true,
      // HTTPS on Vercel; local dev relies on X-H3-Search-Session header
      secure: process.env.VERCEL === "1",
      sameSite: "Lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
  }

  app.post("/api/search/session", async (c) => {
    const { sessionId } = resolveSearchSessionId(c);
    attachSearchSessionCookie(c, sessionId);
    const state = await ensureSearchSession(admin, sessionId, searchMemory);
    return c.json({
      ...state,
      limit: SEARCH_LIMIT,
    });
  });

  app.post("/api/search/consume", async (c) => {
    const { sessionId } = resolveSearchSessionId(c);
    attachSearchSessionCookie(c, sessionId);
    // Logged-in approved users are not quota-limited
    const auth = c.get("auth");
    if (canWrite(auth, authRequired)) {
      const state = await ensureSearchSession(admin, sessionId, searchMemory);
      return c.json({
        ok: true,
        searchCount: state.searchCount,
        remaining: SEARCH_LIMIT,
        limit: SEARCH_LIMIT,
        unlimited: true,
      });
    }
    const result = await consumeSearch(admin, sessionId, searchMemory);
    if (!result.ok) {
      return c.json({ ...result, limit: SEARCH_LIMIT }, 429);
    }
    return c.json({ ...result, limit: SEARCH_LIMIT, unlimited: false });
  });

  // ---- Search plans ------------------------------------------------------

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

  // ---- Missions & Omega --------------------------------------------------

  app.get("/api/missions", async (c) => {
    // Public list for search matching when auth off; when auth on still
    // allow public search to list missions (search page needs it).
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
    try {
      await store.warmStartMissionSources(mission.id, mission.location);
    } catch {
      /* mission still created */
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

  app.get("/api/sources", async (c) => {
    return c.json(await store.listAllSources());
  });

  const missionCollections = CollectionNameSchema.options.filter(
    (name) =>
      name !== "missions" && name !== "patterns" && name !== "sources",
  ) as Exclude<CollectionName, "missions" | "patterns" | "sources">[];

  for (const collection of missionCollections) {
    app.get(`/api/missions/:missionId/${collection}`, async (c) => {
      const items = await store.listByMission(
        collection,
        c.req.param("missionId"),
      );
      return c.json(items);
    });

    app.post(`/api/missions/:missionId/${collection}`, async (c) => {
      const body = await c.req.json();
      const missionId = c.req.param("missionId");
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
    const items = await store.listByMission(
      "sources",
      c.req.param("missionId"),
    );
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
      if (writableRoot) {
        const exportDir = path.join(writableRoot, "export");
        await mkdir(exportDir, { recursive: true });
        const outPath = path.join(exportDir, `${c.req.param("id")}.json`);
        await writeFile(outPath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
      }
      return c.json(bundle);
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : "Export failed" },
        404,
      );
    }
  });

  return app;
}
