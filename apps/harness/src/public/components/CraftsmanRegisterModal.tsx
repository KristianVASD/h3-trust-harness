import React, { useEffect, useState } from "react";
import { X, CheckCircle2, User, Mail, Phone, MapPin } from "lucide-react";
import { Language } from "../types";

interface CraftsmanRegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  isCommunityDrager?: boolean;
  lang: Language;
}

export const CraftsmanRegisterModal: React.FC<CraftsmanRegisterModalProps> = ({
  isOpen,
  onClose,
  isCommunityDrager = false,
  lang,
}) => {
  const [name, setName] = useState("");
  const [trade, setTrade] = useState("Schilder");
  const [street, setStreet] = useState("");
  const [houseNumber, setHouseNumber] = useState("");
  const [postcode, setPostcode] = useState("");
  const [place, setPlace] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [acceptFindable, setAcceptFindable] = useState(false);
  const [acceptAcquisition, setAcceptAcquisition] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName("");
    setTrade("Schilder");
    setStreet("");
    setHouseNumber("");
    setPostcode("");
    setPlace("");
    setEmail("");
    setPhone("");
    setPassword("");
    setAcceptFindable(false);
    setAcceptAcquisition(false);
    setSubmitting(false);
    setSubmitted(false);
  }, [isOpen, isCommunityDrager]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) return;
    if (!isCommunityDrager && (!acceptFindable || !acceptAcquisition)) return;

    setSubmitting(true);
    const city = place.trim();
    const address = [street.trim(), houseNumber.trim()]
      .filter(Boolean)
      .join(" ");
    const location = [address, [postcode.trim(), city].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(", ");

    try {
      await fetch("/api/public/apply-craftsman", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          trade,
          city,
          street,
          houseNumber,
          postcode,
          address: location,
          email,
          password: isCommunityDrager ? "" : password,
          phone,
          isCommunityDrager,
          notes: location,
          accept_findable: acceptFindable,
          accept_free_local_connect: acceptFindable,
          accept_local_connection_improve: acceptFindable,
          opt_in_active_work: acceptAcquisition,
        }),
      });
    } catch {
      /* client-side handled gracefully */
    }

    setSubmitting(false);
    setSubmitted(true);
  };

  const title = isCommunityDrager
    ? lang === "nl"
      ? "Draag een bedrijf aan"
      : "Nominate a company"
    : lang === "nl"
      ? "Schrijf je bedrijf in"
      : "Register your company";

  const intro = isCommunityDrager
    ? lang === "nl"
      ? "Alleen een bedrijf aandragen: naam, adres, e-mail en telefoon. Geen KvK. Wij nemen contact op."
      : "Nominate a company: name, address, email and phone. No Chamber of Commerce. We will get in touch."
    : lang === "nl"
      ? "Schrijf je bedrijf in met adres, e-mail en telefoon. KvK volgt later bij verificatie."
      : "Register your company with address, email and phone. Chamber of Commerce comes later at verification.";

  const canSubmit = isCommunityDrager
    ? Boolean(name && email)
    : Boolean(name && email && acceptFindable && acceptAcquisition);

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
              {isCommunityDrager
                ? lang === "nl"
                  ? "Bedrijf aandragen"
                  : "Nominate a company"
                : lang === "nl"
                  ? "Zelf inschrijven"
                  : "Self-register"}
            </p>
            <h3 className="font-serif text-xl text-zinc-900 font-semibold leading-snug">
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={lang === "nl" ? "Sluiten" : "Close"}
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
                {lang === "nl" ? "Aanmelding ontvangen" : "Signup received"}
              </h4>
              <p className="text-sm text-zinc-600 font-sans mb-6">
                {isCommunityDrager
                  ? lang === "nl"
                    ? "Dank. We nemen contact op met dit bedrijf."
                    : "Thank you. We will contact this company."
                  : lang === "nl"
                    ? "Je bedrijf staat op de aanmeldlijst. KvK en bronnen volgen later, bij echte verificatie."
                    : "Your company is on the list. Chamber of Commerce and sources come later, at verification."}
              </p>
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 rounded-xl bg-[#1E3A2F] text-white text-sm font-semibold hover:bg-[#162B23]"
              >
                {lang === "nl" ? "Sluiten" : "Close"}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3.5">
              <p className="text-sm text-zinc-600">{intro}</p>

              <div>
                <label className="block text-xs font-mono font-medium text-zinc-700 mb-1">
                  {lang === "nl" ? "Bedrijfsnaam *" : "Company name *"}
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={
                      "Bv. Schildersbedrijf De Pijp"
                    }
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-zinc-300 bg-[#FBFBFA] focus:outline-none focus:border-[#1E3A2F] focus:bg-white"
                  />
                </div>
              </div>

              <div>
                  <label className="block text-xs font-mono font-medium text-zinc-700 mb-1">
                    {lang === "nl" ? "Vakgebied" : "Trade"}
                  </label>
                  <select
                    value={trade}
                    onChange={(e) => setTrade(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 bg-white focus:outline-none focus:border-[#1E3A2F]"
                  >
                    <option value="Schilder">Schilder & Onderhoud</option>
                    <option value="Loodgieter">Loodgieter & Installatie</option>
                    <option value="Timmerman">Timmerman & Kozijnen</option>
                    <option value="Dakdekker">Dakdekker & Zinkwerk</option>
                    <option value="Elektricien">Elektricien</option>
                    <option value="Allround">Allround Klusbedrijf</option>
                  </select>
                </div>

              <div>
                <label className="block text-xs font-mono font-medium text-zinc-700 mb-1">
                  {lang === "nl" ? "Adres" : "Address"}
                </label>
                <div className="grid grid-cols-[1fr_5.5rem] gap-2">
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={street}
                      onChange={(e) => setStreet(e.target.value)}
                      placeholder={lang === "nl" ? "Straatnaam" : "Street"}
                      className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-zinc-300 bg-[#FBFBFA] focus:outline-none focus:border-[#1E3A2F] focus:bg-white"
                    />
                  </div>
                  <input
                    type="text"
                    value={houseNumber}
                    onChange={(e) => setHouseNumber(e.target.value)}
                    placeholder={lang === "nl" ? "Nr." : "No."}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 bg-[#FBFBFA] focus:outline-none focus:border-[#1E3A2F] focus:bg-white"
                  />
                </div>
                <div className="grid grid-cols-[7rem_1fr] gap-2 mt-2">
                  <input
                    type="text"
                    value={postcode}
                    onChange={(e) => setPostcode(e.target.value)}
                    placeholder={lang === "nl" ? "Postcode" : "Postcode"}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 bg-[#FBFBFA] focus:outline-none focus:border-[#1E3A2F] focus:bg-white"
                  />
                  <input
                    type="text"
                    value={place}
                    onChange={(e) => setPlace(e.target.value)}
                    placeholder={lang === "nl" ? "Plaats" : "City"}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 bg-[#FBFBFA] focus:outline-none focus:border-[#1E3A2F] focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-mono font-medium text-zinc-700 mb-1">
                    {lang === "nl" ? "E-mail *" : "Email *"}
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
                    {lang === "nl" ? "Telefoon" : "Phone"}
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="06 …"
                      className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-zinc-300 bg-[#FBFBFA] focus:outline-none focus:border-[#1E3A2F] focus:bg-white"
                    />
                  </div>
                </div>
              </div>

              {!isCommunityDrager ? (
                <>
                  <div>
                    <label className="block text-xs font-mono font-medium text-zinc-700 mb-1">
                      {lang === "nl"
                        ? "Wachtwoord (optioneel, voor later inloggen)"
                        : "Password (optional, for later sign-in)"}
                    </label>
                    <input
                      type="password"
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={
                        lang === "nl" ? "Minimaal 8 tekens" : "At least 8 characters"
                      }
                      className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 bg-[#FBFBFA] focus:outline-none focus:border-[#1E3A2F] focus:bg-white"
                    />
                  </div>

                  <div className="p-3 rounded-xl bg-[#1E3A2F]/5 border border-[#1E3A2F]/20 space-y-2.5">
                    <p className="text-[11px] font-mono font-semibold text-[#1E3A2F] uppercase">
                      {lang === "nl"
                        ? "Twee keuzes — geen overlap"
                        : "Two choices — no overlap"}
                    </p>
                    <label className="flex items-start gap-2.5 text-xs text-zinc-700">
                      <input
                        type="checkbox"
                        required
                        checked={acceptFindable}
                        onChange={(e) => setAcceptFindable(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="font-semibold">
                          {lang === "nl" ? "Vindbaar zijn: " : "Be findable: "}
                        </span>
                        {lang === "nl"
                          ? "Ik wil lokaal zichtbaar zijn in het trust-netwerk, gratis verbonden met huishoudens."
                          : "I want to be locally visible in the trust network, connected to households for free."}
                      </span>
                    </label>
                    <label className="flex items-start gap-2.5 text-xs text-zinc-700">
                      <input
                        type="checkbox"
                        required
                        checked={acceptAcquisition}
                        onChange={(e) => setAcceptAcquisition(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="font-semibold">
                          {lang === "nl" ? "Acquisitie: " : "Acquisition: "}
                        </span>
                        {lang === "nl"
                          ? "Ik vraag HandyHouseHelp om actief passend werk naar ons door te sturen."
                          : "I ask HandyHouseHelp to actively send matching work our way."}
                      </span>
                    </label>
                  </div>
                </>
              ) : null}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl border border-zinc-300 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  {lang === "nl" ? "Annuleren" : "Cancel"}
                </button>
                <button
                  type="submit"
                  disabled={submitting || !canSubmit}
                  className="flex-1 py-2.5 rounded-xl bg-[#1E3A2F] text-white font-medium text-sm hover:bg-[#162B23] disabled:opacity-50"
                >
                  {submitting
                    ? lang === "nl"
                      ? "Verzenden…"
                      : "Sending…"
                    : lang === "nl"
                      ? "Aanmelding versturen"
                      : "Send signup"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
