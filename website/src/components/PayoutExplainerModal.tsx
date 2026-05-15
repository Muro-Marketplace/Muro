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
        <div className="flex items-start gap-3 mb-4">
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
          <div>
            <h2 id="payout-explainer-title" className="text-lg font-medium">
              Payouts are set up
            </h2>
            <p className="text-sm text-muted mt-0.5">
              {isArtist
                ? "Quick note on when you'll actually see the money."
                : "Quick note on when your revenue share lands."}
            </p>
          </div>
        </div>

        <ul className="space-y-4 mb-6 text-sm text-foreground">
          <li className="flex gap-3">
            <span className="mt-1 w-1.5 h-1.5 rounded-full bg-accent shrink-0" aria-hidden />
            <div>
              <p className="font-medium">
                {isArtist
                  ? "Shipped orders, 14 days from purchase"
                  : "Placement orders shipped to the customer, 14 days from purchase"}
              </p>
              <p className="text-muted mt-0.5 leading-relaxed">
                {isArtist
                  ? "Buyer has a 14-day window to flag a problem. Mark an order as Delivered earlier and Wallplace releases your payout right away, you don't have to wait the full window."
                  : "Same 14-day buyer-protection window as the artist's share. Once the artist marks the order as delivered, your cut releases the same day."}
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="mt-1 w-1.5 h-1.5 rounded-full bg-accent shrink-0" aria-hidden />
            <div>
              <p className="font-medium">
                In-store sales at the venue, paid immediately
              </p>
              <p className="text-muted mt-0.5 leading-relaxed">
                {isArtist
                  ? "When a customer scans a QR at a venue and collects the work on the spot, you get paid at checkout. No hold."
                  : "When a customer collects the work from your venue counter at the point of purchase, your share lands in your Stripe balance the same day."}
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="mt-1 w-1.5 h-1.5 rounded-full bg-accent shrink-0" aria-hidden />
            <div>
              <p className="font-medium">Refunds reverse the payout</p>
              <p className="text-muted mt-0.5 leading-relaxed">
                {isArtist
                  ? "Within the buyer's 14-day refund window, a refund pulls the transfer back. After payout, refunds come out of your future earnings."
                  : "If a refund happens after the customer's order, the venue cut is reversed alongside the artist's payout."}
              </p>
            </div>
          </li>
        </ul>

        <p className="text-xs text-muted mb-5">
          Wallplace takes its platform fee {isArtist ? "and any venue revenue share " : ""}
          before transferring. Stripe usually clears the payout into your bank within 1 to 2 business days. Full terms are in your{" "}
          {isArtist ? "artist" : "venue"} agreement.
        </p>

        {/* Two CTAs:
            - "I understand" acknowledges + dismisses. localStorage flag
              gets written so the modal doesn't surface again.
            - "View {x} agreement" opens the long-form contract in a
              new tab and deliberately does NOT dismiss, so the user
              can read the terms and then come back to acknowledge
              explicitly. Mirroring a real consent flow: read, then
              tick the box. */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-3">
          <a
            href={isArtist ? "/artist-agreement" : "/venue-agreement"}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center px-4 py-2.5 text-sm font-medium border border-border text-foreground rounded-sm hover:bg-foreground/5 transition-colors"
          >
            View {isArtist ? "Artist" : "Venue"} Agreement
          </a>
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex items-center justify-center px-5 py-2.5 text-sm font-semibold tracking-wide bg-accent text-white rounded-sm hover:bg-accent-hover transition-colors"
          >
            I understand
          </button>
        </div>
      </div>
    </div>
  );
}
