"use client";

// Fires the first time an artist or venue completes Stripe Connect
// onboarding, then again never. The most common support ticket about
// payouts is "I sold a piece a week ago, where's my money?" — the
// money is sitting in stripe_transfers.status='pending' until the
// 14-day hold lapses or the order ships, both of which the user has no
// way of knowing without being told.
//
// Persistence: localStorage keyed by user id + audience. Switching
// devices re-shows the modal once, which is a feature: each new
// device's first impression should set the expectation correctly,
// rather than silently never explain. If we ever want
// strictly-once-per-user we can mirror the dismiss to a profile
// column, but that's overkill for an FYI screen.

import { useEffect, useState } from "react";

export type PayoutAudience = "artist" | "venue";

interface Props {
  audience: PayoutAudience;
  /** User id, namespaces the dismissed flag. If null/undefined the
   *  modal is suppressed (we'd have no way to remember a dismiss). */
  userId: string | null | undefined;
  /** Set true by the parent once `onboardingComplete` flips. */
  active: boolean;
}

const STORAGE_PREFIX = "wallplace:payout-explainer-seen:";

function storageKey(audience: PayoutAudience, userId: string): string {
  return `${STORAGE_PREFIX}${audience}:${userId}`;
}

function hasSeen(audience: PayoutAudience, userId: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return !!window.localStorage.getItem(storageKey(audience, userId));
  } catch {
    return true; // fail closed so a localStorage error doesn't pin the modal open
  }
}

function markSeen(audience: PayoutAudience, userId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(audience, userId), new Date().toISOString());
  } catch {
    /* swallow */
  }
}

export default function PayoutExplainerModal({ audience, userId, active }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!active || !userId) return;
    if (hasSeen(audience, userId)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(true);
  }, [active, userId, audience]);

  function dismiss() {
    if (userId) markSeen(audience, userId);
    setOpen(false);
  }

  if (!open) return null;

  const isArtist = audience === "artist";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="payout-explainer-title"
      className="fixed inset-0 z-[200] bg-black/55 flex items-center justify-center p-4"
      onClick={dismiss}
    >
      <div
        className="bg-background rounded-sm w-full max-w-lg p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-5">
          <div className="w-9 h-9 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-emerald-700"
              aria-hidden
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 id="payout-explainer-title" className="text-lg font-medium mt-1">
            Payouts are set up
          </h2>
        </div>

        {/* Two short lines, the only thing a new artist or venue really
            needs to know on day one: when shipped orders pay out, when
            QR/in-store sales pay out. Refund mechanics, fee splits, and
            Stripe timing are in the agreement, not here. */}
        <ul className="space-y-2.5 mb-5 text-sm text-foreground">
          <li className="flex gap-3">
            <span className="mt-2 w-1.5 h-1.5 rounded-full bg-accent shrink-0" aria-hidden />
            <p>
              {isArtist
                ? "Online orders pay out 14 days after purchase, or sooner once you mark them delivered."
                : "Online placement orders pay out 14 days after purchase, or sooner once the artist marks them delivered."}
            </p>
          </li>
          <li className="flex gap-3">
            <span className="mt-2 w-1.5 h-1.5 rounded-full bg-accent shrink-0" aria-hidden />
            <p>
              In-store QR sales pay out the same day.
            </p>
          </li>
        </ul>

        <p className="text-xs text-muted mb-5">
          Wallplace takes its platform fee before transferring. Refunds reverse the matching payout. Full terms are in your{" "}
          <a
            href={isArtist ? "/artist-agreement" : "/venue-agreement"}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground transition-colors"
          >
            {isArtist ? "artist" : "venue"} agreement
          </a>.
        </p>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex items-center justify-center px-5 py-2.5 text-sm font-semibold tracking-wide bg-accent text-white rounded-sm hover:bg-accent-hover transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
