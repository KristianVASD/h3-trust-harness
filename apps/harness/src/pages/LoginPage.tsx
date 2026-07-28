import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { supabaseConfigured } from "../lib/supabase";

export function LoginPage() {
  const { signIn, session } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from =
    (location.state as { from?: string } | null)?.from ?? "/settings";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) navigate(from, { replace: true });
  }, [session, from, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Sign-in failed";
      const lower = raw.toLowerCase();
      if (lower.includes("email not confirmed") || lower.includes("confirm")) {
        setError(
          "Email not confirmed. In Supabase → Authentication → Providers → Email, turn OFF “Confirm email” for the test phase (or confirm the user in Authentication → Users).",
        );
      } else if (
        lower.includes("invalid login") ||
        lower.includes("invalid credentials")
      ) {
        setError(
          "Wrong email or password. Use the password from Sign up (there is no default admin password). Reset in Supabase → Authentication → Users if needed.",
        );
      } else {
        setError(raw);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page auth-page">
      <h1>Sign in</h1>
      {!supabaseConfigured && (
        <p className="notice">
          Supabase is not configured locally. Set{" "}
          <code>VITE_SUPABASE_URL</code> and{" "}
          <code>VITE_SUPABASE_ANON_KEY</code> to enable login. Local{" "}
          <code>STORE_DRIVER=file</code> still works in open mode.
        </p>
      )}
      <form className="stack" onSubmit={onSubmit}>
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button
          className="btn"
          type="submit"
          disabled={busy || !supabaseConfigured}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p>
        Want to join CURAD?{" "}
        <Link to="/signup">Become a CURAD volunteer</Link>
      </p>
    </main>
  );
}
