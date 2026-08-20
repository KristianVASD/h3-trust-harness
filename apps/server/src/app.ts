import { randomUUID } from "node:crypto";
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { getCookie, setCookie } from "hono/cookie";
import {
  CollectionNameSchema,
  DEFAULT_SEARCH_PLAN_VERSION,
  MASTERLIST,
  SearchPlanSchema,
  computeMissionCoverage,
  filterElementsForUi,
  resolveElementAliases,
  type CollectionName,
  type Mission,
  type Producer,
  type SearchPlan,
  type ServiceContext,
  type Source,
  type UiAudience,
  defaultAudienceForCategory,
  isLocalDirectoryMission,
  isMixedSourceCategory,
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
  ImportRouteError,
  runOmegaImport,
} from "./omega/import-route.js";
import {
  CompanyImportError,
  importCompaniesForMission,
} from "./companies-import-route.js";
import { exportHhhHighTrustLeads } from "./hhh-export.js";
import { buildCoverageDesk } from "./coverage-desk.js";
import { countriesMatch, isNationalPack } from "./pack-match.js";
import {
  PackOnboardError,
  onboardCountrySectorPack,
} from "./pack-onboard-route.js";
import {
  importNicheForPack,
  importStackedMixedList,
  peelMixedOnlyFromMission,
  promoteUnknownToSectorPack,
} from "./stacked-import.js";
import {
  SEARCH_COOKIE,
  SEARCH_LIMIT,
  SEARCH_SESSION_HEADER,
  aggregateSearchDemands,
  authMiddleware,
  canWrite,
  consumeSearch,
  createSupabaseAdmin,
  ensureSearchSession,
  isAdmin,
  isAuthRequired,
  isValidSearchSessionId,
  listSearchDemands,
  normalizeSearchDemandInput,
  recordSearchDemand,
  requireWrite,
  type AppVariables,
  type Profile,
  type SearchDemand,
} from "./auth.js";

function normPlace(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findMissionForDemand(
  missions: Mission[],
  input: {
    what: string;
    location: string;
    country: string | null;
    matched_mission_id: string | null;
  },
): Mission | null {
  if (input.matched_mission_id) {
    const byId = missions.find((m) => m.id === input.matched_mission_id);
    if (byId) return byId;
  }
  const loc = normPlace(input.location);
  const country = input.country ? normPlace(input.country) : "";
  const what = normPlace(input.what);
  let best: { mission: Mission; score: number } | null = null;
  for (const m of missions) {
    const mLoc = normPlace(m.location);
    const mCountry = normPlace(m.country);
    const mSector = normPlace(`${m.subsector} ${m.sector}`);
    const tradeOk =
      mSector.includes(what) || what.includes(normPlace(m.subsector));
    if (!tradeOk) continue;
    const countryOk =
      !country ||
      mCountry === country ||
      mCountry.includes(country) ||
      country.includes(mCountry);
    if (!countryOk) continue;

    let score = 2;
    const locHit = mLoc === loc || mLoc.includes(loc) || loc.includes(mLoc);
    if (locHit) score += 2;
    else if (isNationalPack(m)) score += 1;
    else continue;
    if (country) score += 1;
    if (!best || score > best.score) best = { mission: m, score };
  }
  return best && best.score >= 3 ? best.mission : null;
}

async function ensureMissionFromSearchDemand(
  store: Store,
  input: {
    what: string;
    location: string;
    country: string | null;
    matched_mission_id: string | null;
  },
  options: { bumpDemand?: boolean } = {},
): Promise<{ mission: Mission | null; created: boolean }> {
  const bumpDemand = options.bumpDemand !== false;
  const missions = await store.listMissions();
  const existing = findMissionForDemand(missions, input);
  const now = new Date().toISOString();
  if (existing) {
    if (!bumpDemand) {
      return { mission: existing, created: false };
    }
    const demandCount = (existing.demandCount ?? 0) + 1;
    const updated: Mission = {
      ...existing,
      demandCount,
      lastSearchedAt: now,
      updatedAt: now,
    };
    await store.upsertMission(updated);
    return { mission: updated, created: false };
  }
  // Demand is a queue for local overlay — do not spawn a mission per search.
  return { mission: null, created: false };
}

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
  const searchDemandMemory: SearchDemand[] = [];

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

  /**
   * Log a worldwide search demand (anonymous allowed).
   * Pass `ensureOnly: true` to open/find the mission without counting an ask
   * or inserting a demand row — used mid-search before the final outcome is known.
   */
  app.post("/api/search/demand", async (c) => {
    const body = await c.req.json().catch(() => null);
    const ensureOnly =
      Boolean(body && typeof body === "object" && (body as { ensureOnly?: unknown }).ensureOnly);
    const parsed = normalizeSearchDemandInput(body, { allowMissingOutcome: ensureOnly });
    if (!parsed) {
      return c.json(
        {
          error: ensureOnly
            ? "Invalid demand — need what and location."
            : "Invalid demand — need what, location, and outcome.",
        },
        400,
      );
    }
    const { sessionId } = resolveSearchSessionId(c);
    attachSearchSessionCookie(c, sessionId);
    const auth = c.get("auth");

    let mission: Mission | null = null;
    let missionCreated = false;
    try {
      const ensured = await ensureMissionFromSearchDemand(
        store,
        {
          what: parsed.what,
          location: parsed.location,
          country: parsed.country,
          matched_mission_id: parsed.matched_mission_id,
        },
        { bumpDemand: !ensureOnly },
      );
      mission = ensured.mission;
      missionCreated = ensured.created;
    } catch (err) {
      console.error(
        "[search_demands] ensure mission failed",
        err instanceof Error ? err.message : err,
      );
    }

    if (ensureOnly) {
      return c.json(
        {
          ok: true,
          demand: null,
          mission,
          missionCreated,
          ensureOnly: true,
        },
        200,
      );
    }

    const demand = await recordSearchDemand(admin, searchDemandMemory, {
      session_id: sessionId,
      user_id: auth?.user.id ?? null,
      ...parsed,
      outcome: parsed.outcome!,
      matched_mission_id:
        parsed.matched_mission_id || mission?.id || null,
    });

    return c.json(
      {
        ok: true,
        demand,
        mission,
        missionCreated,
      },
      201,
    );
  });

  /** Worldwide search demand feed for Mission Control. */
  app.get("/api/search/demands", async (c) => {
    const limitRaw = Number(c.req.query("limit") ?? 200);
    const demands = await listSearchDemands(admin, searchDemandMemory, limitRaw);
    const aggregates = aggregateSearchDemands(demands);
    return c.json({ demands, aggregates });
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

  // ---- Masterlist (element naming / intake) ------------------------------

  app.get("/api/masterlist", async (c) => {
    const audienceRaw = (c.req.query("audience") ?? "pro").toLowerCase();
    const audience: UiAudience =
      audienceRaw === "consumer" ||
      audienceRaw === "hoa" ||
      audienceRaw === "apartment_owner" ||
      audienceRaw === "pro"
        ? audienceRaw
        : "pro";
    const elements = filterElementsForUi(audience);
    return c.json({
      version: MASTERLIST.version,
      id: MASTERLIST.id,
      locale: MASTERLIST.locale,
      updated: MASTERLIST.updated,
      split_rule: MASTERLIST.split_rule,
      audience,
      categories: MASTERLIST.categories,
      trades: MASTERLIST.trades,
      elementCount: elements.length,
      elements,
    });
  });

  app.post("/api/masterlist/resolve", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      terms?: unknown;
      text?: unknown;
    } | null;
    const fromArray = Array.isArray(body?.terms)
      ? body.terms.filter((t): t is string => typeof t === "string")
      : [];
    const fromText =
      typeof body?.text === "string"
        ? body.text
            .split(/[\n,;|]+/)
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
    const terms = [...fromArray, ...fromText];
    if (!terms.length) {
      return c.json(
        { error: "Provide terms: string[] and/or text: string" },
        400,
      );
    }
    const results = resolveElementAliases(terms);
    const matched = results.filter((r) => r.status === "matched").length;
    const needsReview = results.length - matched;
    return c.json({
      version: MASTERLIST.version,
      count: results.length,
      matched,
      needs_review: needsReview,
      results,
    });
  });

  // ---- Missions & Omega --------------------------------------------------

  app.get("/api/missions", async (c) => {
    // Public list for search matching when auth off; when auth on still
    // allow public search to list missions (search page needs it).
    const missions = await store.listMissions();
    return c.json(missions);
  });

  app.get("/api/control/coverage", async (c) => {
    const desk = await buildCoverageDesk(store);
    return c.json(desk);
  });

  app.post("/api/packs/onboard", async (c) => {
    try {
      const body = await c.req.json();
      const result = await onboardCountrySectorPack(store, body);
      return c.json(result, result.createdMission ? 201 : 200);
    } catch (err) {
      if (err instanceof PackOnboardError) {
        return c.json({ error: err.message }, err.status as 400);
      }
      if (err instanceof CompanyImportError) {
        return c.json({ error: err.message }, err.status as 400 | 404);
      }
      throw err;
    }
  });

  app.get("/api/export/hhh-leads", async (c) => {
    const country = c.req.query("country") ?? undefined;
    const subsector = c.req.query("subsector") ?? undefined;
    const result = await exportHhhHighTrustLeads(store, { country, subsector });
    return c.json(result);
  });

  app.get("/api/directory/companies", async (c) => {
    const country = (c.req.query("country") ?? "").trim();
    if (!country) return c.json({ error: "country is required" }, 400);
    const sourceId = (c.req.query("sourceId") ?? "").trim();
    const missions = await store.listMissions();
    const mission = missions.find(
      (m) =>
        isLocalDirectoryMission(m) &&
        countriesMatch(m, country) &&
        isNationalPack(m),
    );
    if (!mission) {
      return c.json({
        mission: null,
        companies: [],
        unknown: 0,
        potentials: 0,
      });
    }
    const companies = (
      await store.listByMission("companies", mission.id)
    ).filter((co) => {
      if (sourceId && !(co.source_ids ?? []).includes(sourceId)) return false;
      return true;
    });
    return c.json({
      mission,
      companies,
      unknown: companies.filter((co) => co.status === "unknown").length,
      potentials: companies.filter(
        (co) => co.status === "unknown" && co.classify?.verdict === "home_service",
      ).length,
    });
  });

  app.post("/api/missions/:missionId/companies/peel-mixed", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const sourceId =
        typeof body?.sourceId === "string" && body.sourceId.trim()
          ? body.sourceId.trim()
          : undefined;
      const result = await peelMixedOnlyFromMission(store, {
        missionId: c.req.param("missionId"),
        sourceId,
      });
      return c.json(result);
    } catch (err) {
      if (err instanceof CompanyImportError) {
        return c.json({ error: err.message }, err.status as 400 | 404);
      }
      throw err;
    }
  });

  app.post("/api/directory/companies/:companyId/promote", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const result = await promoteUnknownToSectorPack(store, {
        companyId: c.req.param("companyId"),
        country: String(body.country ?? ""),
        subsector: String(body.subsector ?? ""),
        reviewer: String(body.reviewer ?? "Human"),
        reason: typeof body.reason === "string" ? body.reason : undefined,
      });
      return c.json(result);
    } catch (err) {
      if (err instanceof CompanyImportError) {
        return c.json({ error: err.message }, err.status as 400 | 404);
      }
      throw err;
    }
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

  /** Paste/upload Ω job JSON (manual Qwen / offline) — no live API. */
  app.post("/api/missions/:missionId/omega/import", async (c) => {
    const missionId = c.req.param("missionId");
    const body = await c.req.json().catch(() => null);
    try {
      const result = await runOmegaImport(store, missionId, body);
      return c.json(result, 201);
    } catch (err) {
      if (err instanceof ImportRouteError) {
        return c.json({ error: err.message }, err.status);
      }
      return c.json(
        { error: err instanceof Error ? err.message : "Import failed" },
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

  app.post("/api/missions/:missionId/companies/import", async (c) => {
    try {
      const missionId = c.req.param("missionId");
      const body = await c.req.json();
      const sourceId =
        typeof body?.sourceId === "string" ? body.sourceId.trim() : "";
      const listLabel =
        typeof body?.listLabel === "string" ? body.listLabel.trim() : "";
      const rows = Array.isArray(body?.rows) ? body.rows : null;
      if (!sourceId) {
        return c.json({ error: "sourceId is required" }, 400);
      }
      if (!rows) {
        return c.json({ error: "rows[] is required" }, 400);
      }
      const producer =
        body?.producer === "ImportedDataset" ? "ImportedDataset" : "Human";
      const mission = await store.getMission(missionId);
      if (!mission) return c.json({ error: "Mission not found" }, 404);
      const source = await store.get("sources", sourceId);
      const mixed =
        body?.mixed === true ||
        (source ? isMixedSourceCategory(source.category) : false);
      const audienceRaw =
        typeof body?.defaultAudience === "string"
          ? body.defaultAudience
          : source
            ? defaultAudienceForCategory(source.category)
            : undefined;
      const serviceContexts = audienceRaw
        ? [audienceRaw as ServiceContext]
        : undefined;
      const place =
        typeof body?.place === "string" ? body.place.trim() : undefined;

      if (mixed) {
        const stacked = await importStackedMixedList(store, {
          country: mission.country,
          sourceId,
          listLabel: listLabel || "Member list",
          rows,
          producer,
          place,
          serviceContexts,
        });
        return c.json(
          {
            created: stacked.createdUnknown,
            updated: stacked.matched,
            skipped: stacked.skipped,
            createdUnknown: stacked.createdUnknown,
            clusterHits: stacked.clusterHits,
            mixed: true,
            warnings: stacked.warnings,
            companies: [],
          },
          201,
        );
      }

      const result = isLocalDirectoryMission(mission)
        ? await importCompaniesForMission(store, {
            missionId,
            sourceId,
            listLabel: listLabel || "Member list",
            rows,
            producer,
            status: "unknown",
            serviceContexts,
          })
        : await importNicheForPack(store, {
            missionId,
            country: mission.country,
            sourceId,
            listLabel: listLabel || "Member list",
            rows,
            producer,
            place,
            serviceContexts,
          });
      return c.json(
        {
          created: "created" in result ? result.created ?? 0 : 0,
          updated:
            "updated" in result
              ? result.updated ?? 0
              : "matched" in result
                ? result.matched
                : 0,
          skipped: result.skipped,
          clusterHits: "clusterHits" in result ? result.clusterHits : 0,
          mixed: false,
          warnings: result.warnings,
          companies: "companies" in result ? result.companies : [],
        },
        201,
      );
    } catch (err) {
      if (err instanceof CompanyImportError) {
        return c.json({ error: err.message }, err.status as 400 | 404);
      }
      throw err;
    }
  });

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
