"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCookieConsent } from "@/context/CookieConsentContext";

export default function CookieBanner() {
  const { consentGiven, setConsent } = useCookieConsent();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (consentGiven === null) {
      const timer = setTimeout(() => setVisible(true), 300);
      return () => clearTimeout(timer);
    }
  }, [consentGiven]);

  if (consentGiven !== null) return null;

  return (
    <div
      className={`fixed bottom-0 inset-x-0 z-50 p-4 transition-opacity duration-500 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="mx-auto max-w-[1200px] rounded-xl bg-foreground px-6 py-4 shadow-lg">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-white/90">
            We use essential cookies to make this site work. See our{" "}
            <Link href="/cookies" className="underline text-white hover:text-white/80">
              cookie policy
            </Link>
            .
          </p>

          <div className="flex gap-3 shrink-0">
            <button
              onClick={() => setConsent(false)}
              className="rounded-lg border border-white/30 px-4 py-2 min-h-11 text-sm font-medium text-white transition-colors hover:bg-white/10 cursor-pointer"
            >
              Decline
            </button>
            <button
              onClick={() => setConsent(true)}
              className="rounded-lg bg-accent px-4 py-2 min-h-11 text-sm font-medium text-white transition-colors hover:bg-accent/90 cursor-pointer"
            >
              Accept
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
