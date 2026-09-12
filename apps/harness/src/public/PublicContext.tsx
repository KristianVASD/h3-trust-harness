import { createContext, useContext } from "react";
import type { Language, PageView } from "./types";

export type PublicContextValue = {
  lang: Language;
  setLang: (lang: Language) => void;
  openRegister: (asCommunityDrager?: boolean) => void;
  openPartner: () => void;
  openHarness: () => void;
  navigateView: (view: PageView) => void;
};

const PublicContext = createContext<PublicContextValue | null>(null);

export const PublicProvider = PublicContext.Provider;

export function usePublic(): PublicContextValue {
  const ctx = useContext(PublicContext);
  if (!ctx) {
    throw new Error("usePublic must be used inside PublicLayout");
  }
  return ctx;
}
