"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    // Always log full details to the console for support / dev tools.
    console.error("Application error:", error);
    if (error.stack) console.error(error.stack);
  }, [error]);

  // In dev, surface details inline so we don't need browser devtools
  // open to figure out what crashed. In prod they live behind a
  // disclosure so users don't see a stack trace by default.
  const isDev =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1");

  return (
    <div className="min-h-[60vh] flex items-center justify-center bg-background px-6">
      <div className="text-center max-w-xl w-full">
        <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-6">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-accent"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>

        <h1 className="text-2xl sm:text-3xl font-serif text-foreground mb-3">
          Something went wrong
        </h1>
        <p className="text-sm sm:text-base text-muted leading-relaxed mb-6">
          We&apos;re sorry, something unexpected happened. Please try again.
        </p>

        {/* Inline error message, visible by default in dev, behind
            a disclosure in prod. Lets us actually diagnose user
            reports of "something went wrong" without needing a
            screenshot of the browser console. */}
        {(isDev || detailsOpen) && (
          <div className="bg-stone-50 border border-border rounded-sm p-4 mb-6 text-left">
            <p className="text-[11px] uppercase tracking-wider text-muted mb-2">
              Technical details
            </p>
            <p className="text-xs font-mono text-foreground break-words">
              {error.message || "(no message)"}
            </p>
            {error.digest && (
              <p className="text-[11px] text-muted mt-2 font-mono">
                Reference: {error.digest}
              </p>
            )}
          </div>
        )}
        {!isDev && !detailsOpen && (
          <button
            type="button"
            onClick={() => setDetailsOpen(true)}
            className="text-xs text-muted hover:text-foreground underline mb-6"
          >
            Show technical details
          </button>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={reset}
            className="w-full sm:w-auto px-6 py-2.5 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-sm transition-colors duration-200"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="w-full sm:w-auto px-6 py-2.5 text-sm font-medium text-foreground border border-border hover:border-foreground/30 rounded-sm transition-colors duration-200 text-center"
          >
            Go to Homepage
          </Link>
        </div>
      </div>
    </div>
  );
}
