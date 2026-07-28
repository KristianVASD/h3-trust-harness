import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { setAccessTokenGetter } from "../lib/api-auth";

export type ProfileRole = "admin" | "curad_volunteer";
export type ProfileStatus = "pending" | "approved" | "rejected";

export type Profile = {
  id: string;
  email: string;
  role: ProfileRole;
  status: ProfileStatus;
  display_name: string | null;
  preferred_location: string | null;
  created_at?: string;
  updated_at?: string;
};

type MeResponse = {
  authRequired: boolean;
  openMode?: boolean;
  user: { id: string; email?: string | null } | null;
  profile: Profile | null;
  canWrite?: boolean;
  isAdmin?: boolean;
};

type AuthState = {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  authRequired: boolean;
  openMode: boolean;
  canWrite: boolean;
  isAdmin: boolean;
  isPending: boolean;
  refreshMe: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  updateProfile: (patch: {
    display_name?: string;
    preferred_location?: string;
  }) => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

async function fetchMe(token: string | null): Promise<MeResponse> {
  const res = await fetch("/api/me", {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.status === 401) {
    return {
      authRequired: true,
      user: null,
      profile: null,
    };
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json() as Promise<MeResponse>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [openMode, setOpenMode] = useState(true);
  const [canWrite, setCanWrite] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const applyMe = useCallback((me: MeResponse) => {
    setAuthRequired(me.authRequired);
    setOpenMode(Boolean(me.openMode) || !me.authRequired);
    setProfile(me.profile);
    setCanWrite(
      me.canWrite ??
        (!me.authRequired ||
          (me.profile?.status === "approved" &&
            (me.profile.role === "admin" ||
              me.profile.role === "curad_volunteer"))),
    );
    setIsAdmin(
      me.isAdmin ??
        (me.profile?.role === "admin" && me.profile.status === "approved"),
    );
  }, []);

  const refreshMe = useCallback(async () => {
    const token = session?.access_token ?? null;
    try {
      const me = await fetchMe(token);
      applyMe(me);
    } catch {
      /* keep prior state */
    }
  }, [applyMe, session?.access_token]);

  useEffect(() => {
    setAccessTokenGetter(() => session?.access_token ?? null);
  }, [session?.access_token]);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      if (!supabaseConfigured || !supabase) {
        try {
          const me = await fetchMe(null);
          if (!cancelled) applyMe(me);
        } finally {
          if (!cancelled) setLoading(false);
        }
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setSession(data.session);

      const me = await fetchMe(data.session?.access_token ?? null);
      if (cancelled) return;
      applyMe(me);
      setLoading(false);

      const { data: sub } = supabase.auth.onAuthStateChange(
        async (_event, next) => {
          setSession(next);
          try {
            const nextMe = await fetchMe(next?.access_token ?? null);
            applyMe(nextMe);
          } catch {
            /* ignore */
          }
        },
      );
      return () => sub.subscription.unsubscribe();
    }

    const cleanupPromise = boot();
    return () => {
      cancelled = true;
      void cleanupPromise.then((unsub) => unsub?.());
    };
  }, [applyMe]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error("Supabase is not configured");
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error("Supabase is not configured");
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) {
      setSession(null);
      setProfile(null);
      return;
    }
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    if (!supabase) throw new Error("Supabase is not configured");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  }, []);

  const updateProfile = useCallback(
    async (patch: { display_name?: string; preferred_location?: string }) => {
      const token = session?.access_token;
      if (!token) throw new Error("Not signed in");
      const res = await fetch("/api/me", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { profile: Profile };
      setProfile(data.profile);
    },
    [session?.access_token],
  );

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      profile,
      authRequired,
      openMode,
      canWrite,
      isAdmin,
      isPending: profile?.status === "pending",
      refreshMe,
      signIn,
      signUp,
      signOut,
      updatePassword,
      updateProfile,
    }),
    [
      loading,
      session,
      profile,
      authRequired,
      openMode,
      canWrite,
      isAdmin,
      refreshMe,
      signIn,
      signUp,
      signOut,
      updatePassword,
      updateProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
