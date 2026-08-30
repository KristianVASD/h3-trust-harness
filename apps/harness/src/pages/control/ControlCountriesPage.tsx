import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type ControlCountryRow } from "../../api";
import { StatusChip } from "../../components/Badges";
import { useAuth } from "../../auth/AuthContext";
import { useCanInteract } from "../../hooks/useCanInteract";

function landscapeTone(
  status: ControlCountryRow["landscapeStatus"],
): "done" | "active" | "waiting" {
  if (status === "ready") return "done";
  if (status === "mapping") return "active";
  return "waiting";
}

export function ControlCountriesPage() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { canInteract } = useCanInteract();
  const [countries, setCountries] = useState<ControlCountryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countryName, setCountryName] = useState("");
  const [saving, setSaving] = useState(false);
  const [mapAfter, setMapAfter] = useState(false);

  async function load() {
    try {
      setError(null);
      const res = await api.listControlCountries();
      setCountries(res.countries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load countries");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onStart(e: FormEvent) {
    e.preventDefault();
    if (!countryName.trim() || !canInteract) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.startControlCountry({
        country: countryName.trim(),
        map: mapAfter && isAdmin,
      });
      navigate(`/control/${res.landscape.countrySlug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start country");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <header className="control-hero">
        <p className="control-eyebrow">Mission Control</p>
        <h1>Countries</h1>
        <p className="muted">
          Start a country, then explore sectors. Nation mapping is the trust
          landscape — how local proof is found — before you open a trade door.
        </p>
      </header>
      {error ? <div className="error">{error}</div> : null}
      {loading ? (
        <p className="muted">Loading countries…</p>
      ) : countries.length === 0 ? (
        <div className="empty">
          No countries yet. Start one below — Netherlands is the usual first
          desk.
        </div>
      ) : (
        <div className="control-country-grid">
          {countries.map((c) => (
            <Link
              key={c.countrySlug}
              className="control-country-card"
              to={`/control/${c.countrySlug}`}
            >
              <h3>{c.country}</h3>
              <p className="muted">
                {c.doorsFilled}/{c.doorTotal} doors · {c.companyCount} companies ·{" "}
                {c.listCount} lists
              </p>
              <div className="row" style={{ gap: "0.4rem", flexWrap: "wrap" }}>
                <StatusChip
                  label={`landscape ${c.landscapeStatus}`}
                  tone={landscapeTone(c.landscapeStatus)}
                />
                {c.lastRun ? (
                  <StatusChip
                    label={`${c.lastRun.status} · ${c.lastRun.progress_pct}%`}
                    tone={c.lastRun.status === "succeeded" ? "done" : "active"}
                  />
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      )}

      <section className="panel control-start">
        <h2>Start a country</h2>
        <p className="hint">
          Creates the 12-channel trust-landscape stub. Mapping writes the
          playbook (traineeships, business clubs, sport platforms, festivities).
        </p>
        <form className="form-stack" onSubmit={(e) => void onStart(e)}>
          <label>
            Country
            <input
              value={countryName}
              onChange={(e) => setCountryName(e.target.value)}
              placeholder="Netherlands"
              required
            />
          </label>
          {isAdmin ? (
            <label className="row" style={{ gap: "0.5rem", alignItems: "center" }}>
              <input
                type="checkbox"
                checked={mapAfter}
                onChange={(e) => setMapAfter(e.target.checked)}
              />
              Map trust landscape after create
            </label>
          ) : null}
          <button className="btn" type="submit" disabled={saving || !canInteract}>
            {saving ? "Starting…" : "Start country"}
          </button>
        </form>
      </section>
    </div>
  );
}
