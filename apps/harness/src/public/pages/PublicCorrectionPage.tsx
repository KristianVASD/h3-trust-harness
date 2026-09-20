import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { translations } from "../data/translations";
import { usePublic } from "../PublicContext";

export function PublicCorrectionPage() {
  const { lang } = usePublic();
  const t = translations[lang].correctionForm;
  const legal = translations[lang].legal;
  const [params] = useSearchParams();
  const [companyName, setCompanyName] = useState(
    () => params.get("bedrijf") ?? params.get("company") ?? "",
  );
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("visitor");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = Boolean(
    companyName.trim() && contactName.trim() && email.trim() && message.trim(),
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/public/correction-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: companyName.trim(),
          contactName: contactName.trim(),
          email: email.trim(),
          role,
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
  }

  return (
    <div className="public-section">
      <div className="public-page-card px-5 sm:px-8 lg:px-12 py-8 sm:py-12 max-w-xl">
        <p className="text-xs font-mono uppercase tracking-widest text-[#1E3A2F] font-semibold">
          {t.kicker}
        </p>
        <h1 className="font-serif text-3xl sm:text-4xl text-zinc-900 font-normal mt-2">
          {t.title}
        </h1>
        <p className="text-sm text-zinc-600 mt-3 leading-relaxed">{t.intro}</p>

        {submitted ? (
          <div className="mt-8 p-5 rounded-xl bg-emerald-50 border border-emerald-100">
            <h2 className="font-serif text-xl text-zinc-900">{t.thanksTitle}</h2>
            <p className="text-sm text-zinc-600 mt-2 leading-relaxed">{t.thanksBody}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div>
              <label className="block text-xs font-mono font-medium text-zinc-700 mb-1">
                {t.companyName} *
              </label>
              <input
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 bg-[#FBFBFA] focus:outline-none focus:border-[#1E3A2F]"
              />
            </div>
            <div>
              <label className="block text-xs font-mono font-medium text-zinc-700 mb-1">
                {t.yourName} *
              </label>
              <input
                required
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 bg-[#FBFBFA] focus:outline-none focus:border-[#1E3A2F]"
              />
            </div>
            <div>
              <label className="block text-xs font-mono font-medium text-zinc-700 mb-1">
                {t.email} *
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 bg-[#FBFBFA] focus:outline-none focus:border-[#1E3A2F]"
              />
            </div>
            <div>
              <label className="block text-xs font-mono font-medium text-zinc-700 mb-1">
                {t.roleLabel}
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 bg-[#FBFBFA] focus:outline-none focus:border-[#1E3A2F]"
              >
                <option value="owner">{t.roleOwner}</option>
                <option value="holder">{t.roleHolder}</option>
                <option value="visitor">{t.roleVisitor}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-mono font-medium text-zinc-700 mb-1">
                {t.whatsWrong} *
              </label>
              <textarea
                required
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 bg-[#FBFBFA] focus:outline-none focus:border-[#1E3A2F]"
              />
            </div>
            {error ? (
              <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </p>
            ) : null}
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              {t.privacyNotice}{" "}
              <a href="/privacy" className="underline text-[#1E3A2F]">
                {legal.privacy}
              </a>
            </p>
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
  );
}
