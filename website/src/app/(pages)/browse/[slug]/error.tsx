"use client";

/**
 * Route-level error boundary for /browse/[slug].
 *
 * Catches anything the server-side render of the artist profile
 * throws so the user gets an artist-context page (with a back link
 * to the marketplace) instead of the generic global "Something went
 * wrong" full-page error. Also surfaces the digest reference more
 * prominently, that's what we'd grep Vercel function logs for to
 * diagnose what actually broke.
 */

import { useEffect, useState } from "react";
import Link from "next/link";

export default function BrowseSlugError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    console.error("[/browse/[slug]] render error:", error);
    if (error.stack) console.error(error.stack);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center bg-background px-6 py-16">
      <div className="text-center max-w-xl w-full">
        <h1 className="font-serif text-2xl sm:text-3xl text-foreground mb-3">
          We couldn&apos;t load this artist&apos;s profile
        </h1>
        <p className="text-sm text-muted leading-relaxed mb-6">
          Something went wrong while rendering the page. The artist&apos;s
          data may be in an unexpected shape, refreshing usually helps,
          and the rest of the marketplace is fine.
        </p>

        {/* Reference digest is the only thing that survives prod
            error masking, pasted into Vercel logs it leads straight
            to the actual stack trace. Worth showing prominently. */}
        {error.digest && (
          <div className="bg-stone-50 border border-border rounded-sm px-4 py-3 mb-6 inline-block">
            <p className="text-[11px] uppercase tracking-wider text-muted mb-1">
              Reference
            </p>
            <p className="text-xs font-mono text-foreground select-all">
              {error.digest}
            </p>
          </div>
        )}

        {(error.message && (detailsOpen || isLocalhost())) && (
          <div className="bg-stone-50 border border-border rounded-sm p-4 mb-6 text-left">
            <p className="text-[11px] uppercase tracking-wider text-muted mb-2">
              Technical details
            </p>
            <p className="text-xs font-mono text-foreground break-words">
              {error.message}
            </p>
          </div>
        )}
        {!detailsOpen && !isLocalhost() && error.message && (
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
            className="w-full sm:w-auto px-6 py-2.5 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-sm transition-colors"
          >
            Try Again
          </button>
          <Link
            href="/browse"
            className="w-full sm:w-auto px-6 py-2.5 text-sm font-medium text-foreground border border-border hover:border-foreground/30 rounded-sm transition-colors text-center"
          >
            Back to Marketplace
          </Link>
        </div>
      </div>
    </div>
  );
}

function isLocalhost(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  );
}
