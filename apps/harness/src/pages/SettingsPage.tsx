import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function SettingsPage() {
  const {
    session,
    profile,
    loading,
    openMode,
    canWrite,
    isPending,
    isAdmin,
    signOut,
    updatePassword,
    updateProfile,
  } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [location, setLocation] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(profile?.display_name ?? "");
    setLocation(profile?.preferred_location ?? "");
  }, [profile]);

  if (loading) return <main className="page">Loading…</main>;
  if (!session && !openMode) return <Navigate to="/login" replace />;
  if (!session && openMode) {
    return (
      <main className="page auth-page">
        <h1>Settings</h1>
        <p>
          Local open mode — no account. Configure Supabase and sign in for
          profile settings.
        </p>
        <Link className="btn secondary" to="/login">
          Sign in
        </Link>
      </main>
    );
  }

  async function onSaveProfile(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      await updateProfile({
        display_name: displayName,
        preferred_location: location,
      });
      setMessage("Profile saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      await updatePassword(password);
      setPassword("");
      setMessage("Password updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password change failed");
    }
  }

  return (
    <main className="page auth-page">
      <h1>Account settings</h1>
      <p>
        Signed in as <strong>{profile?.email ?? session?.user.email}</strong>
        {" · "}
        {profile?.role ?? "—"} / {profile?.status ?? "—"}
        {isPending && " (browse only until approved)"}
        {canWrite && " · can write"}
        {isAdmin && (
          <>
            {" · "}
            <Link to="/admin">Admin: engine</Link>
          </>
        )}
      </p>

      <form className="stack" onSubmit={onSaveProfile}>
        <h2>Profile</h2>
        <label>
          Display name
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>
        <label>
          Preferred location
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Haarlemmermeer"
          />
        </label>
        <button className="btn" type="submit">
          Save profile
        </button>
      </form>

      <form className="stack" onSubmit={onChangePassword}>
        <h2>Change password</h2>
        <label>
          New password
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </label>
        <button className="btn secondary" type="submit">
          Update password
        </button>
      </form>

      {message && <p className="notice">{message}</p>}
      {error && <p className="error">{error}</p>}

      <button
        className="btn secondary"
        type="button"
        onClick={() => void signOut()}
      >
        Sign out
      </button>
    </main>
  );
}
