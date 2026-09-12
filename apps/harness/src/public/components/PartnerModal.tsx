import React, { useState } from 'react';
import { X, Building, CheckCircle2, Mail, User } from 'lucide-react';
import { Language } from '../types';

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
  const [orgName, setOrgName] = useState('');
  const [sector, setSector] = useState('Schilders & Onderhoud');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName || !email) return;

    setSubmitting(true);
    try {
      await fetch('/api/public/apply-partner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationName: orgName,
          sector,
          contactName,
          email,
          message,
        }),
      });
    } catch {
      // fallback
    }
    setSubmitting(false);
    setSubmitted(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 sm:p-8 shadow-2xl border border-zinc-200 my-8">
        
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
        >
          <X className="w-5 h-5" />
        </button>

        {submitted ? (
          <div className="text-center py-6">
            <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="font-serif text-2xl font-bold text-zinc-900 mb-2">
              {lang === 'nl' ? 'Interesse Ontvangen' : 'Inquiry Received'}
            </h3>
            <p className="text-sm text-zinc-600 font-sans mb-6">
              {lang === 'nl'
                ? 'Dank voor de interesse. Ons team voor sectorverbinding neemt binnen 2 werkdagen contact op voor een verkennend gesprek.'
                : 'Thank you for your interest. Our team will get in touch within 2 business days to schedule an introductory call.'}
            </p>
            <button
              onClick={() => {
                setSubmitted(false);
                onClose();
              }}
              className="px-6 py-2.5 rounded-xl bg-[#1E3A2F] text-white text-sm font-semibold hover:bg-[#162B23]"
            >
              {lang === 'nl' ? 'Sluiten' : 'Close'}
            </button>
          </div>
        ) : (
          <div>
            <div className="mb-6">
              <span className="text-xs font-mono uppercase text-[#C58B3A] font-semibold">
                {lang === 'nl' ? 'Sectorpartnerschap' : 'Sector Partnership'}
              </span>
              <h3 className="font-serif text-2xl text-zinc-900 font-semibold mt-1">
                {lang === 'nl' ? 'Word Sectorpartner van H3' : 'Become an H3 Sector Partner'}
              </h3>
              <p className="text-xs sm:text-sm text-zinc-500 font-sans mt-1">
                {lang === 'nl'
                  ? 'Help bepalen wat vertrouwen in jouw vak betekent en breng lichte, behulpzame AI-tooling naar jouw leden.'
                  : 'Help shape trust standards in your trade and deliver lightweight, helpful AI tools to your guild members.'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-mono font-medium text-zinc-700 mb-1">
                  {lang === 'nl' ? 'Naam Brancheorganisatie of Netwerk *' : 'Association or Network Name *'}
                </label>
                <div className="relative">
                  <Building className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="Bv. Koninklijke OnderhoudNL / Ondernemerskring"
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-zinc-300 focus:outline-none focus:border-[#1E3A2F]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono font-medium text-zinc-700 mb-1">
                  {lang === 'nl' ? 'Sector of Regio' : 'Sector or Region'}
                </label>
                <input
                  type="text"
                  value={sector}
                  onChange={(e) => setSector(e.target.value)}
                  placeholder="Bv. Installatietechniek, Bouw, Amsterdam e.o."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 focus:outline-none focus:border-[#1E3A2F]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono font-medium text-zinc-700 mb-1">
                    {lang === 'nl' ? 'Contactpersoon' : 'Contact Person'}
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder="Naam"
                      className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-zinc-300 focus:outline-none focus:border-[#1E3A2F]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-mono font-medium text-zinc-700 mb-1">
                    {lang === 'nl' ? 'E-mailadres *' : 'Email *'}
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="contact@branche.nl"
                      className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-zinc-300 focus:outline-none focus:border-[#1E3A2F]"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono font-medium text-zinc-700 mb-1">
                  {lang === 'nl' ? 'Vraag of toelichting (optioneel)' : 'Note (optional)'}
                </label>
                <textarea
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={lang === 'nl' ? 'Waar liggen de uitdagingen voor jullie vakmensen?' : 'What are the key trust challenges in your sector?'}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 focus:outline-none focus:border-[#1E3A2F]"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-xl bg-[#1E3A2F] text-white font-medium text-sm hover:bg-[#162B23] transition-colors shadow-sm disabled:opacity-50"
              >
                {submitting
                  ? (lang === 'nl' ? 'Verzenden...' : 'Sending...')
                  : (lang === 'nl' ? 'Aanvraag Verzenden' : 'Submit Inquiry')}
              </button>
            </form>
          </div>
        )}

      </div>
    </div>
  );
};
