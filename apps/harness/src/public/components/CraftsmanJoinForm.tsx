import React, { useState } from "react";
import { Link } from "react-router-dom";
import { translations } from "../data/translations";
import { PUBLIC_TRADES } from "../data/trades";
import type { Language } from "../types";

interface CraftsmanJoinFormProps {
  lang: Language;
}

export const CraftsmanJoinForm: React.FC<CraftsmanJoinFormProps> = ({ lang }) => {
  const t = translations[lang].craftsmanPage;
  const forms = translations[lang].joinForms;
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [trade, setTrade] = useState("");
  const [street, setStreet] = useState("");
  const [houseNumber, setHouseNumber] = useState("");
  const [postcode, setPostcode] = useState("");
  const [city, setCity] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting || done) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/public/apply-craftsman", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: companyName.trim(),
          contactName: contactName.trim(),
          email: email.trim(),
          trade,
          tradeId: trade,
          street: street.trim(),
          houseNumber: houseNumber.trim(),
          postcode: postcode.trim(),
          city: city.trim(),
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
    <form className="join" onSubmit={handleSubmit}>
      <label>
        {forms.companyName}
        <input
          name="bedrijf"
          required
          autoComplete="organization"
          value={companyName}
          onChange={(event) => setCompanyName(event.target.value)}
          disabled={done}
        />
      </label>
      <label>
        {forms.yourName}
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
        {forms.email}
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
        {forms.sector}
        <select
          name="vak"
          required
          value={trade}
          onChange={(event) => setTrade(event.target.value)}
          disabled={done}
        >
          <option value="" disabled>
            {forms.chooseSector}
          </option>
          {PUBLIC_TRADES.map((option) => (
            <option key={option.id} value={option.id}>
              {lang === "nl" ? option.labelNl : option.labelEn}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t.address}
        <span className="address-line">
          <input
            name="straat"
            required
            autoComplete="address-line1"
            placeholder={forms.street}
            value={street}
            onChange={(event) => setStreet(event.target.value)}
            disabled={done}
          />
          <input
            name="nummer"
            required
            autoComplete="address-line2"
            placeholder={forms.houseNumber}
            value={houseNumber}
            onChange={(event) => setHouseNumber(event.target.value)}
            disabled={done}
          />
        </span>
        <span className="address-place">
          <input
            name="postcode"
            required
            autoComplete="postal-code"
            placeholder={forms.postcode}
            value={postcode}
            onChange={(event) => setPostcode(event.target.value)}
            disabled={done}
          />
          <input
            name="plaats"
            required
            autoComplete="address-level2"
            placeholder={forms.city}
            value={city}
            onChange={(event) => setCity(event.target.value)}
            disabled={done}
          />
        </span>
      </label>
      <p className="form-note">
        {forms.registerPrivacyNotice}{" "}
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
