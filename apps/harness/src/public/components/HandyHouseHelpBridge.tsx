import React from "react";
import { Shield, EyeOff, ArrowUpRight, Home } from "lucide-react";
import { Language } from "../types";

const HHH_URL = "https://handyhousehelp.ai";

interface HandyHouseHelpBridgeProps {
  lang: Language;
  onExploreMatching?: () => void;
}

export const HandyHouseHelpBridge: React.FC<HandyHouseHelpBridgeProps> = ({
  lang,
}) => {
  return (
    <section id="handyhousehelp" className="public-section">
      <div className="public-page-card px-5 sm:px-8 lg:px-12 py-10 sm:py-14">
        <div className="max-w-3xl mx-auto text-center mb-10">
          <span className="text-xs font-mono uppercase tracking-widest text-[#C45A12] font-semibold">
            {lang === "nl" ? "Het initiatief" : "The initiative"}
          </span>
          <h2 className="font-serif text-3xl sm:text-4xl text-zinc-900 font-normal mt-2">
            HandyHouseHelp
          </h2>
          <p className="text-base sm:text-lg text-zinc-600 mt-3 font-sans leading-relaxed">
            {lang === "nl"
              ? "HandyHouseHelp helpt huishoudens en vakmensen elkaar te vinden — zonder je data te verkopen. Jij houdt zelf de regie."
              : "HandyHouseHelp helps households and tradespeople find each other — without selling your data. You stay in control."}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
          <div className="p-6 rounded-2xl bg-[#FFF7F0] border border-[#F3D2B3]">
            <EyeOff className="w-7 h-7 text-[#C45A12] mb-3" />
            <h3 className="font-serif text-xl font-semibold text-zinc-900 mb-2">
              {lang === "nl"
                ? "Geen verkoop van je data"
                : "Your data is not for sale"}
            </h3>
            <p className="text-sm text-zinc-600 leading-relaxed">
              {lang === "nl"
                ? "Een keer onderhoud aan de ketel hoeft niet te betekenen dat je timeline volstaat met reclame voor CV-ketels. Data wordt niet gedeeld of doorverkocht aan adverteerders."
                : "Needing boiler service once should not fill your timeline with heating ads. Data is not shared or sold to advertisers."}
            </p>
          </div>
          <div className="p-6 rounded-2xl bg-white border border-zinc-200">
            <Shield className="w-7 h-7 text-[#1E3A2F] mb-3" />
            <h3 className="font-serif text-xl font-semibold text-zinc-900 mb-2">
              {lang === "nl"
                ? "Zelf je gegevens veilig houden"
                : "Keep your own data safe"}
            </h3>
            <p className="text-sm text-zinc-600 leading-relaxed">
              {lang === "nl"
                ? "HandyHouseHelp is het lokale hulp-initiatief: verbinden, plannen, duidelijkheid. H3 levert het open trust-netwerk; HandyHouseHelp de menselijke hulp eromheen."
                : "HandyHouseHelp is the local help initiative: connect, plan, stay clear. H3 provides the open trust network; HandyHouseHelp the human help around it."}
            </p>
          </div>
        </div>

        <div className="p-6 sm:p-8 rounded-2xl bg-[#C45A12] text-white flex flex-col sm:flex-row items-center justify-between gap-5">
          <div className="flex items-start gap-3 text-left">
            <Home className="w-6 h-6 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-serif text-xl font-semibold">
                {lang === "nl"
                  ? "Meer over HandyHouseHelp"
                  : "More about HandyHouseHelp"}
              </h3>
              <p className="text-sm text-orange-50 mt-1">
                {lang === "nl"
                  ? "Kijk op de site voor hoe het initiatief werkt — en hoe jouw data bij jou blijft."
                  : "See the site for how the initiative works — and how your data stays yours."}
              </p>
            </div>
          </div>
          <a
            href={HHH_URL}
            target="_blank"
            rel="noreferrer"
            className="public-cta-light inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold shrink-0 hover:bg-orange-50"
          >
            <span>handyhousehelp.ai</span>
            <ArrowUpRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    </section>
  );
};
