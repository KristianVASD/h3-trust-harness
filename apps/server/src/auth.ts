import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { randomUUID, timingSafeEqual } from "node:crypto";
import type { Context, MiddlewareHandler, Next } from "hono";

export type ProfileRole = "admin" | "curad_volunteer";
export type ProfileStatus = "pending" | "approved" | "rejected";

export type Profile = {
  id: string;
  email: string;
  role: ProfileRole;
  status: ProfileStatus;
  display_name: string | null;
  preferred_location: string | null;
  created_at: string;
  updated_at: string;
};

export type AuthUser = {
  user: User;
  profile: Profile;
};

export type AppVariables = {
  auth: AuthUser | null;
  authRequired: boolean;
  isWorker: boolean;
};

/** Shared secret for the local engine worker. Never expose to the browser. */
export function isWorkerBearer(
  authorizationHeader: string | undefined,
): boolean {
  const expected = (process.env.H3_WORKER_TOKEN ?? "").trim();
  if (!expected || expected.length < 16) return false;
  if (!authorizationHeader?.startsWith("Bearer ")) return false;
  const token = authorizationHeader.slice("Bearer ".length).trim();
  if (!token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const SEARCH_LIMIT = Number(process.env.SEARCH_SESSION_LIMIT ?? 5) || 5;
const SEARCH_COOKIE = "h3_search_session";
const SEARCH_SESSION_HEADER = "x-h3-search-session";

const SESSION_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidSearchSessionId(value: string | undefined | null): boolean {
  if (!value) return false;
  const v = value.trim();
  return SESSION_ID_RE.test(v) || /^h3-[a-z0-9-]+$/i.test(v);
}

export function createSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function isAuthRequired(): boolean {
  const explicit = process.env.AUTH_REQUIRED?.toLowerCase();
  if (explicit === "true" || explicit === "1") return true;
  if (explicit === "false" || explicit === "0") return false;
  const driver = (process.env.STORE_DRIVER ?? "file").toLowerCase();
  return driver === "postgres" || driver === "supabase";
}

export async function loadProfile(
  admin: SupabaseClient,
  userId: string,
): Promise<Profile | null> {
  const { data, error } = await admin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as Profile;
}

export async function resolveAuthFromRequest(
  admin: SupabaseClient | null,
  authorizationHeader: string | undefined,
): Promise<AuthUser | null> {
  if (!admin || !authorizationHeader?.startsWith("Bearer ")) return null;
  const token = authorizationHeader.slice("Bearer ".length).trim();
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  let profile = await loadProfile(admin, data.user.id);
  if (!profile && data.user.email) {
    // Race: trigger may not have fired yet
    const { error: upsertErr } = await admin.from("profiles").upsert({
      id: data.user.id,
      email: data.user.email,
      role: "curad_volunteer",
      status: "pending",
    });
    if (!upsertErr) {
      profile = await loadProfile(admin, data.user.id);
    }
  }
  if (!profile) return null;

  // Promote configured admin email
  const adminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (
    adminEmail &&
    profile.email.toLowerCase() === adminEmail &&
    (profile.role !== "admin" || profile.status !== "approved")
  ) {
    const { data: updated } = await admin
      .from("profiles")
      .update({
        role: "admin",
        status: "approved",
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id)
      .select("*")
      .single();
    if (updated) profile = updated as Profile;
  }

  return { user: data.user, profile };
}

export function canWrite(auth: AuthUser | null, authRequired: boolean): boolean {
  if (!authRequired) return true;
  if (!auth) return false;
  if (auth.profile.role === "admin" && auth.profile.status === "approved") {
    return true;
  }
  return (
    auth.profile.role === "curad_volunteer" &&
    auth.profile.status === "approved"
  );
}

export function canReadMission(
  auth: AuthUser | null,
  authRequired: boolean,
): boolean {
  if (!authRequired) return true;
  return Boolean(auth);
}

export function isAdmin(auth: AuthUser | null): boolean {
  return (
    auth?.profile.role === "admin" && auth.profile.status === "approved"
  );
}

export function authMiddleware(
  admin: SupabaseClient | null,
  authRequired: boolean,
): MiddlewareHandler<{ Variables: AppVariables }> {
  return async (c, next) => {
    c.set("authRequired", authRequired);
    const header = c.req.header("Authorization");
    const worker = isWorkerBearer(header);
    c.set("isWorker", worker);
    if (worker) {
      c.set("auth", null);
      await next();
      return;
    }
    try {
      const auth = await resolveAuthFromRequest(admin, header);
      c.set("auth", auth);
    } catch (err) {
      console.error("[auth] resolve failed", err);
      c.set("auth", null);
    }
    await next();
  };
}

/** Block mutating routes when auth is required and user cannot write. */
export function requireWrite(): MiddlewareHandler<{ Variables: AppVariables }> {
  return async (c, next) => {
    const method = c.req.method.toUpperCase();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      return next();
    }
    const path = c.req.path;
    // Always allow profile self-update + anonymous search quota
    if (
      path === "/api/me" ||
      path === "/api/search/session" ||
      path === "/api/search/consume" ||
      path === "/api/search/demand" ||
      path.startsWith("/api/admin/")
    ) {
      return next();
    }
    if (c.get("isWorker")) {
      return next();
    }
    const authRequired = c.get("authRequired");
    const auth = c.get("auth");
    if (!canWrite(auth, authRequired)) {
      if (authRequired && auth && auth.profile.status === "pending") {
        return c.json(
          {
            error:
              "Awaiting admin approval — you can browse but cannot interact yet.",
            code: "pending_approval",
          },
          403,
        );
      }
      if (authRequired && !auth) {
        return c.json({ error: "Authentication required", code: "auth_required" }, 401);
      }
      return c.json({ error: "Forbidden", code: "forbidden" }, 403);
    }
    return next();
  };
}

/** Mission/worker reads require login when AUTH_REQUIRED. Public search stays open. */
export function requireLoginForMissionReads(): MiddlewareHandler<{
  Variables: AppVariables;
}> {
  return async (c, next) => {
    if (c.get("isWorker")) return next();
    const authRequired = c.get("authRequired");
    if (!authRequired) return next();
    const auth = c.get("auth");
    if (!canReadMission(auth, authRequired)) {
      return c.json({ error: "Authentication required", code: "auth_required" }, 401);
    }
    return next();
  };
}

export { SEARCH_LIMIT, SEARCH_COOKIE, SEARCH_SESSION_HEADER };

export async function ensureSearchSession(
  admin: SupabaseClient | null,
  sessionId: string,
  memory: Map<string, number>,
): Promise<{ sessionId: string; searchCount: number; remaining: number }> {
  if (admin) {
    const { data } = await admin
      .from("search_sessions")
      .select("*")
      .eq("session_id", sessionId)
      .maybeSingle();
    if (!data) {
      await admin.from("search_sessions").insert({
        session_id: sessionId,
        search_count: 0,
      });
      return {
        sessionId,
        searchCount: 0,
        remaining: SEARCH_LIMIT,
      };
    }
    const count = data.search_count as number;
    return {
      sessionId,
      searchCount: count,
      remaining: Math.max(0, SEARCH_LIMIT - count),
    };
  }
  const count = memory.get(sessionId) ?? 0;
  return {
    sessionId,
    searchCount: count,
    remaining: Math.max(0, SEARCH_LIMIT - count),
  };
}

export async function consumeSearch(
  admin: SupabaseClient | null,
  sessionId: string,
  memory: Map<string, number>,
): Promise<
  | { ok: true; searchCount: number; remaining: number }
  | { ok: false; searchCount: number; remaining: 0; error: string }
> {
  const current = await ensureSearchSession(admin, sessionId, memory);
  if (current.searchCount >= SEARCH_LIMIT) {
    return {
      ok: false,
      searchCount: current.searchCount,
      remaining: 0,
      error: `Search limit reached (${SEARCH_LIMIT} per session during test phase).`,
    };
  }
  const next = current.searchCount + 1;
  if (admin) {
    const { error } = await admin
      .from("search_sessions")
      .update({ search_count: next })
      .eq("session_id", sessionId);
    if (error) {
      return {
        ok: false,
        searchCount: current.searchCount,
        remaining: 0,
        error: error.message,
      };
    }
  } else {
    memory.set(sessionId, next);
  }
  return {
    ok: true,
    searchCount: next,
    remaining: Math.max(0, SEARCH_LIMIT - next),
  };
}

export type SearchDemandOutcome =
  | "hit"
  | "no_match"
  | "empty_companies"
  | "ambiguous"
  | "quota_blocked";

export type SearchDemand = {
  id: string;
  session_id: string | null;
  user_id: string | null;
  what: string;
  location: string;
  country: string | null;
  parsed_sector: string | null;
  matched_mission_id: string | null;
  outcome: SearchDemandOutcome;
  created_at: string;
};

export type SearchDemandAggregate = {
  key: string;
  what: string;
  location: string;
  country: string | null;
  count: number;
  lastAt: string;
  outcomes: Partial<Record<SearchDemandOutcome, number>>;
  matchedMissionId: string | null;
};

const OUTCOMES = new Set<SearchDemandOutcome>([
  "hit",
  "no_match",
  "empty_companies",
  "ambiguous",
  "quota_blocked",
]);

export function normalizeSearchDemandInput(
  body: unknown,
  options: { allowMissingOutcome?: boolean } = {},
): {
  what: string;
  location: string;
  country: string | null;
  parsed_sector: string | null;
  matched_mission_id: string | null;
  outcome: SearchDemandOutcome | null;
} | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const what = String(b.what ?? "").trim();
  const location = String(b.location ?? "").trim();
  const outcomeRaw = String(b.outcome ?? "").trim() as SearchDemandOutcome;
  const hasOutcome = OUTCOMES.has(outcomeRaw);
  if (!what || !location) return null;
  if (!hasOutcome && !options.allowMissingOutcome) return null;
  const country = String(b.country ?? "").trim() || null;
  const parsed_sector = String(b.parsed_sector ?? "").trim() || null;
  const matched_mission_id =
    String(b.matched_mission_id ?? "").trim() || null;
  return {
    what: what.slice(0, 200),
    location: location.slice(0, 200),
    country: country ? country.slice(0, 120) : null,
    parsed_sector: parsed_sector ? parsed_sector.slice(0, 200) : null,
    matched_mission_id: matched_mission_id
      ? matched_mission_id.slice(0, 80)
      : null,
    outcome: hasOutcome ? outcomeRaw : null,
  };
}

export async function recordSearchDemand(
  admin: SupabaseClient | null,
  memory: SearchDemand[],
  input: {
    session_id: string | null;
    user_id: string | null;
    what: string;
    location: string;
    country: string | null;
    parsed_sector: string | null;
    matched_mission_id: string | null;
    outcome: SearchDemandOutcome;
  },
): Promise<SearchDemand> {
  const row: SearchDemand = {
    id: randomUUID(),
    session_id: input.session_id,
    user_id: input.user_id,
    what: input.what,
    location: input.location,
    country: input.country,
    parsed_sector: input.parsed_sector,
    matched_mission_id: input.matched_mission_id,
    outcome: input.outcome,
    created_at: new Date().toISOString(),
  };

  if (admin) {
    const { data, error } = await admin
      .from("search_demands")
      .insert({
        session_id: row.session_id,
        user_id: row.user_id,
        what: row.what,
        location: row.location,
        country: row.country,
        parsed_sector: row.parsed_sector,
        matched_mission_id: row.matched_mission_id,
        outcome: row.outcome,
      })
      .select("*")
      .single();
    if (!error && data) return data as SearchDemand;
    // Retry without user_id (FK / auth edge cases must not drop demand)
    if (error) {
      console.error("[search_demands] insert failed", error.message);
      const retry = await admin
        .from("search_demands")
        .insert({
          session_id: row.session_id,
          user_id: null,
          what: row.what,
          location: row.location,
          country: row.country,
          parsed_sector: row.parsed_sector,
          matched_mission_id: row.matched_mission_id,
          outcome: row.outcome,
        })
        .select("*")
        .single();
      if (!retry.error && retry.data) return retry.data as SearchDemand;
      console.error("[search_demands] retry failed", retry.error?.message);
    }
  }

  memory.unshift(row);
  if (memory.length > 500) memory.length = 500;
  return row;
}

export async function listSearchDemands(
  admin: SupabaseClient | null,
  memory: SearchDemand[],
  limit = 200,
): Promise<SearchDemand[]> {
  const capped = Math.min(Math.max(limit, 1), 500);
  if (admin) {
    const { data, error } = await admin
      .from("search_demands")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(capped);
    if (!error && data) return data as SearchDemand[];
    console.error("[search_demands] list failed", error?.message);
  }
  return memory.slice(0, capped);
}

/** Collapse double-logs from the same search (early hit + later empty_companies). */
const DEMAND_DEDUPE_MS = 90_000;

export function aggregateSearchDemands(
  demands: SearchDemand[],
): SearchDemandAggregate[] {
  // Newest first so the later outcome in a burst wins.
  const ordered = [...demands].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
  const keptTimes = new Map<string, number[]>();
  const unique: SearchDemand[] = [];

  for (const d of ordered) {
    const what = (d.parsed_sector || d.what).trim();
    const location = d.location.trim();
    const country = d.country?.trim() || "";
    const session = d.session_id?.trim() || `anon:${d.id}`;
    const groupKey = `${session}|${normalizeKey(location)}|${normalizeKey(country)}|${normalizeKey(what)}`;
    const t = Date.parse(d.created_at);
    const times = keptTimes.get(groupKey) ?? [];
    const nearDuplicate =
      Number.isFinite(t) &&
      times.some((kept) => Math.abs(kept - t) <= DEMAND_DEDUPE_MS);
    if (nearDuplicate) continue;
    if (Number.isFinite(t)) {
      times.push(t);
      keptTimes.set(groupKey, times);
    }
    unique.push(d);
  }

  const map = new Map<string, SearchDemandAggregate>();
  for (const d of unique) {
    const what = (d.parsed_sector || d.what).trim();
    const location = d.location.trim();
    const country = d.country?.trim() || null;
    const key = `${normalizeKey(location)}|${normalizeKey(country ?? "")}|${normalizeKey(what)}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        key,
        what,
        location,
        country,
        count: 1,
        lastAt: d.created_at,
        outcomes: { [d.outcome]: 1 },
        matchedMissionId: d.matched_mission_id,
      });
      continue;
    }
    existing.count += 1;
    existing.outcomes[d.outcome] = (existing.outcomes[d.outcome] ?? 0) + 1;
    if (d.created_at > existing.lastAt) {
      existing.lastAt = d.created_at;
      if (d.matched_mission_id) existing.matchedMissionId = d.matched_mission_id;
    } else if (!existing.matchedMissionId && d.matched_mission_id) {
      existing.matchedMissionId = d.matched_mission_id;
    }
  }
  return [...map.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return b.lastAt.localeCompare(a.lastAt);
  });
}

function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export type { Context, Next };
