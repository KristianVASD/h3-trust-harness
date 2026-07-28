import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
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
};

const SEARCH_LIMIT = 5;
const SEARCH_COOKIE = "h3_search_session";

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
    const auth = await resolveAuthFromRequest(
      admin,
      c.req.header("Authorization"),
    );
    c.set("auth", auth);
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
      path.startsWith("/api/admin/")
    ) {
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
    const authRequired = c.get("authRequired");
    if (!authRequired) return next();
    const auth = c.get("auth");
    if (!canReadMission(auth, authRequired)) {
      return c.json({ error: "Authentication required", code: "auth_required" }, 401);
    }
    return next();
  };
}

export { SEARCH_LIMIT, SEARCH_COOKIE };

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

export type { Context, Next };
