import React, { useEffect, useState } from "react";
import { X, Building, CheckCircle2, Mail, User } from "lucide-react";
import { translations } from "../data/translations";
import { Language } from "../types";

interface PartnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
}

export const PartnerModal: React.FC<PartnerModalProps> = ({
  isOpen,
  onClose,
  lang,
}) => {
  const t = translations[lang].joinForms;
  const [orgName, setOrgName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOrgName("");
    setContactName("");
    setEmail("");
    setMessage("");
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

  const canSubmit = Boolean(orgName.trim() && contactName.trim() && email.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

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
          message: message.trim(),
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
            <p className="text-[11px] font-mono uppercase text-[#C58B3A] font-semibold">
              {t.sectorKicker}
            </p>
            <h3 className="font-serif text-xl text-zinc-900 font-semibold leading-snug">
              {t.sectorTitle}
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
              <p className="text-sm text-zinc-600 leading-relaxed">{t.sectorIntro}</p>

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
                  {t.organization} *
                </label>
                <div className="relative">
                  <Building className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="Bv. OnderhoudNL"
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
                    placeholder="contact@branche.nl"
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-zinc-300 bg-[#FBFBFA] focus:outline-none focus:border-[#1E3A2F] focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono font-medium text-zinc-700 mb-1">
                  {t.note}
                </label>
                <textarea
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 bg-[#FBFBFA] focus:outline-none focus:border-[#1E3A2F] focus:bg-white"
                />
              </div>

              {error ? (
                <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={submitting || !canSubmit}
                className="w-full py-2.5 rounded-xl bg-[#1E3A2F] text-white font-medium text-sm hover:bg-[#162B23] disabled:opacity-50"
              >
                {submitting ? t.sending : t.send}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
