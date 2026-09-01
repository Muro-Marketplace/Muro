"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useCookieConsent } from "@/context/CookieConsentContext";

export default function CookieBanner() {
  const { consentGiven, setConsent } = useCookieConsent();
  const [visible, setVisible] = useState(false);
  // QA 2026-08-30 bug 15: this bar is `fixed bottom-0` with nothing reserving
  // space beneath it, so it sat permanently on top of whatever the page ends
  // with. On /artist-portal/blogs/new that is the action row, and because the
  // page was already at maximum scroll there was nowhere left to scroll: a new
  // artist, who by definition has not dismissed the bar, simply could not save
  // a post, with nothing on screen explaining why. Measuring the bar and
  // adding an equal spacer to the end of the document fixes it for every
  // bottom-anchored control at once, rather than per page.
  const barRef = useRef<HTMLDivElement | null>(null);
  const [barHeight, setBarHeight] = useState(0);

  useEffect(() => {
    if (consentGiven === null) {
      const timer = setTimeout(() => setVisible(true), 300);
      return () => clearTimeout(timer);
    }
  }, [consentGiven]);

  // Keep the spacer the same height as the bar, including when it reflows
  // (narrow screens stack the text above the buttons).
  useEffect(() => {
    const el = barRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const sync = () => setBarHeight(el.offsetHeight);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [visible, consentGiven]);

  if (consentGiven !== null) return null;

  return (
    <>
    {/* Reserves the bar's own height at the end of the flow, so anything the
        page ends with can still be scrolled clear of it. */}
    <div aria-hidden="true" style={{ height: barHeight }} />
    <div
      ref={barRef}
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
    </>
  );
}
