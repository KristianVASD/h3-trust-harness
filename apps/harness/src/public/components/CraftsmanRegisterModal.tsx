import React, { useEffect, useState } from "react";
import { X, CheckCircle2, User, Mail, MapPin, Building2 } from "lucide-react";
import { PUBLIC_TRADES } from "../data/trades";
import { translations } from "../data/translations";
import { Language } from "../types";

interface CraftsmanRegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
}

export const CraftsmanRegisterModal: React.FC<CraftsmanRegisterModalProps> = ({
  isOpen,
  onClose,
  lang,
}) => {
  const t = translations[lang].joinForms;
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [trade, setTrade] = useState("");
  const [street, setStreet] = useState("");
  const [houseNumber, setHouseNumber] = useState("");
  const [postcode, setPostcode] = useState("");
  const [city, setCity] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCompanyName("");
    setContactName("");
    setTrade("");
    setStreet("");
    setHouseNumber("");
    setPostcode("");
    setCity("");
    setEmail("");
    setSubmitting(false);
    setSubmitted(false);
    setError(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const canSubmit = Boolean(
    companyName.trim() &&
      contactName.trim() &&
      email.trim() &&
      trade &&
      street.trim() &&
      houseNumber.trim() &&
      postcode.trim() &&
      city.trim(),
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

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
        setError(data.error || t.errorGeneric);
        return;
      }
      setSubmitted(true);
    } catch {
      setError(t.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/50"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="relative flex flex-col w-full max-w-md max-h-[min(36rem,calc(100dvh-1.5rem))] rounded-2xl bg-white shadow-2xl border border-zinc-200 overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-zinc-100">
          <div className="min-w-0">
            <p className="text-[11px] font-mono uppercase text-[#406A56] font-semibold">
              {t.registerKicker}
            </p>
            <h3 className="font-serif text-xl text-zinc-900 font-semibold leading-snug">
              {t.registerTitle}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full border border-zinc-200 bg-white text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {submitted ? (
            <div className="text-center py-6">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h4 className="font-serif text-xl font-bold text-zinc-900 mb-2">
                {t.thanksTitle}
              </h4>
              <p className="text-sm text-zinc-600 font-sans mb-2 leading-relaxed">
                {t.thanksBody}
              </p>
              <p className="text-sm text-zinc-700 font-sans mb-6 leading-relaxed">
                {t.thanksShare}
              </p>
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 rounded-xl bg-[#1E3A2F] text-white text-sm font-semibold hover:bg-[#162B23]"
              >
                {t.close}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3.5">
              <p className="text-sm text-zinc-600 leading-relaxed">
                {t.registerIntro}
              </p>

              <div>
                <label className="block text-xs font-mono font-medium text-zinc-700 mb-1">
                  {t.companyName} *
                </label>
                <div className="relative">
                  <Building2 className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Bv. Schildersbedrijf De Pijp"
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-zinc-300 bg-[#FBFBFA] focus:outline-none focus:border-[#1E3A2F] focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono font-medium text-zinc-700 mb-1">
                  {t.yourName} *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-zinc-300 bg-[#FBFBFA] focus:outline-none focus:border-[#1E3A2F] focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono font-medium text-zinc-700 mb-1">
                  {t.email} *
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="naam@adres.nl"
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-zinc-300 bg-[#FBFBFA] focus:outline-none focus:border-[#1E3A2F] focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono font-medium text-zinc-700 mb-1">
                  {t.sector} *
                </label>
                <select
                  required
                  value={trade}
                  onChange={(e) => setTrade(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 bg-white focus:outline-none focus:border-[#1E3A2F]"
                >
                  <option value="" disabled>
                    {t.chooseSector}
                  </option>
                  {PUBLIC_TRADES.map((option) => (
                    <option key={option.id} value={option.id}>
                      {lang === "nl" ? option.labelNl : option.labelEn}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono font-medium text-zinc-700 mb-1">
                  {t.street} *
                </label>
                <div className="grid grid-cols-[1fr_5.5rem] gap-2">
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      required
                      value={street}
                      onChange={(e) => setStreet(e.target.value)}
                      placeholder={t.street}
                      className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-zinc-300 bg-[#FBFBFA] focus:outline-none focus:border-[#1E3A2F] focus:bg-white"
                    />
                  </div>
                  <input
                    type="text"
                    required
                    value={houseNumber}
                    onChange={(e) => setHouseNumber(e.target.value)}
                    placeholder={t.houseNumber}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 bg-[#FBFBFA] focus:outline-none focus:border-[#1E3A2F] focus:bg-white"
                  />
                </div>
                <div className="grid grid-cols-[7rem_1fr] gap-2 mt-2">
                  <input
                    type="text"
                    required
                    value={postcode}
                    onChange={(e) => setPostcode(e.target.value)}
                    placeholder={t.postcode}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 bg-[#FBFBFA] focus:outline-none focus:border-[#1E3A2F] focus:bg-white"
                  />
                  <input
                    type="text"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder={t.city}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 bg-[#FBFBFA] focus:outline-none focus:border-[#1E3A2F] focus:bg-white"
                  />
                </div>
              </div>

              {error ? (
                <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {error}
                </p>
              ) : null}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl border border-zinc-300 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={submitting || !canSubmit}
                  className="flex-1 py-2.5 rounded-xl bg-[#1E3A2F] text-white font-medium text-sm hover:bg-[#162B23] disabled:opacity-50"
                >
                  {submitting ? t.sending : t.send}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
