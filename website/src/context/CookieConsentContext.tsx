"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "wallplace-cookie-consent";

interface CookieConsentContextValue {
  consentGiven: boolean | null;
  setConsent: (v: boolean) => void;
}

const CookieConsentContext = createContext<CookieConsentContextValue | null>(null);

export function CookieConsentProvider({ children }: { children: React.ReactNode }) {
  const [consentGiven, setConsentGiven] = useState<boolean | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored === "true") setConsentGiven(true);
    else if (stored === "false") setConsentGiven(false);
  }, []);

  const setConsent = useCallback((v: boolean) => {
    localStorage.setItem(STORAGE_KEY, String(v));
    setConsentGiven(v);
  }, []);

  return (
    <CookieConsentContext.Provider value={{ consentGiven, setConsent }}>
      {children}
    </CookieConsentContext.Provider>
  );
}

export function useCookieConsent() {
  const ctx = useContext(CookieConsentContext);
  if (!ctx) throw new Error("useCookieConsent must be used within CookieConsentProvider");
  return ctx;
}
