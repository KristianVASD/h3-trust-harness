import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { supabaseConfigured } from "../lib/supabase";

export function SignupPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signUp(email.trim(), password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-up failed");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <main className="page auth-page">
        <h1>Application received</h1>
        <p>
          You are a <strong>pending CURAD volunteer</strong>. You can sign in
          and browse the harness, but Agree / Adjust / Dissent and other writes
          stay locked until an admin approves you.
        </p>
        <p>
          <em>CURAD</em> is the governance loop. Each act you will later record
          is a <em>CARA</em> (agree · adjust · dissent).
        </p>
        <button className="btn" type="button" onClick={() => navigate("/login")}>
          Continue to sign in
        </button>
      </main>
    );
  }

  return (
    <main className="page auth-page">
      <h1>Become a CURAD volunteer</h1>
      <p>
        CURAD is human governance — align, feedback, preserve dissent. After
        signup you wait for admin approval before you can interact; browsing is
        open immediately.
      </p>
      {!supabaseConfigured && (
        <p className="notice">
          Supabase env vars are missing — signup is disabled in this build.
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
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn" type="submit" disabled={busy || !supabaseConfigured}>
          {busy ? "Submitting…" : "Apply as CURAD volunteer"}
        </button>
      </form>
      <p>
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </main>
  );
}
