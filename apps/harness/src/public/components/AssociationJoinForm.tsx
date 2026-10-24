import React, { useState } from "react";
import { Link } from "react-router-dom";
import { translations } from "../data/translations";
import type { Language } from "../types";

interface AssociationJoinFormProps {
  lang: Language;
  sourceHolderKind?: string;
  orgLabel?: string;
}

export const AssociationJoinForm: React.FC<AssociationJoinFormProps> = ({
  lang,
  sourceHolderKind = "local_association",
  orgLabel,
}) => {
  const t = translations[lang].homeShell;
  const forms = translations[lang].joinForms;
  const [orgName, setOrgName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [place, setPlace] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting || done) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/public/apply-partner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationName: orgName.trim(),
          contactName: contactName.trim(),
          email: email.trim(),
          city: place.trim(),
          sourceHolderKind,
          shareManagedCompanyData: false,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };
      if (!res.ok || data.success === false) {
        setError(data.error || forms.errorGeneric);
        return;
      }
      setDone(true);
    } catch {
      setError(forms.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="join" id="join-form" onSubmit={handleSubmit}>
      <label>
        {orgLabel ?? t.fieldOrg}
        <input
          name="vereniging"
          required
          autoComplete="organization"
          value={orgName}
          onChange={(event) => setOrgName(event.target.value)}
          disabled={done}
        />
      </label>
      <label>
        {t.fieldContact}
        <input
          name="contact"
          required
          autoComplete="name"
          value={contactName}
          onChange={(event) => setContactName(event.target.value)}
          disabled={done}
        />
      </label>
      <label>
        {t.fieldEmail}
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={done}
        />
      </label>
      <label>
        {t.fieldPlace}
        <input
          name="plaats"
          required
          autoComplete="address-level2"
          value={place}
          onChange={(event) => setPlace(event.target.value)}
          disabled={done}
        />
      </label>
      <p className="form-note">
        {forms.privacyNotice}{" "}
        <Link to="/privacy">{translations[lang].legal.privacy}</Link>
      </p>
      <div className="actions">
        <button className="public-btn" type="submit" disabled={submitting || done}>
          {submitting ? t.formSending : t.formSubmit}
        </button>
      </div>
      <p
        className={error ? "form-status error" : "form-status"}
        role="status"
        aria-live="polite"
      >
        {done ? t.formSuccess : error}
      </p>
    </form>
  );
};
