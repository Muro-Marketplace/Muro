"use client";

/**
 * UpgradeModal, shown when:
 *   - the user clicks "Upgrade" on a depleted QuotaChip
 *   - a render request returns 429 (quota exceeded)
 *
 * Static, link-out-to-/pricing for now. The MVP doesn't need an in-modal
 * Stripe upgrade flow, the existing /pricing page is the canonical
 * conversion surface, and this modal is the bridge.
 *
 * Two variants based on `reason`:
 *   - "daily"     → "back tomorrow OR upgrade for more headroom"
 *   - "monthly"   → harder push: "you've hit your monthly cap"
 *   - "burst"     → softest: "slow down, try again in a minute"
 *   - undefined   → generic
 */

import Link from "next/link";
import { TIER_LABELS } from "@/lib/visualizer/tier-limits";
import type { VisualizerTier } from "@/lib/visualizer/types";

/**
 * Mirrors the `reason` discriminator on
 * `Extract<QuotaConsumeResult, { ok: false }>`. Kept as a free string
 * union here because conditional-extract over a union of `ok: true`/
 * `ok: false` shapes resolves to `never` (no distribution on a concrete
 * union type).
 */
export type UpgradeReason = "daily" | "monthly" | "burst";

interface Props {
  open: boolean;
  onClose: () => void;
  /** The reason returned by the API or chip-derived "out". */
  reason?: UpgradeReason;
  /** Current tier so we can suggest the next step up. */
  currentTier?: VisualizerTier | null;
  /** When daily quota will reset. ISO string. */
  resetsAt?: string | null;
}

/**
 * Suggest the natural next-tier-up. Customers and core get pushed to
 * Premium; everyone else gets Pro. Venues get a venue-friendly nudge.
 */
function suggestUpgrade(tier: VisualizerTier | null | undefined): {
  label: string;
  href: string;
} {
  if (!tier || tier === "guest") {
    return { label: "See plans", href: "/pricing" };
  }
  if (tier === "customer") {
    return { label: "Become an artist", href: "/apply" };
  }
  if (tier === "artist_core") {
    return { label: "Upgrade to Premium", href: "/pricing#artist" };
  }
  if (tier === "artist_premium") {
    return { label: "Upgrade to Pro", href: "/pricing#artist" };
  }
  if (tier === "venue_standard") {
    return { label: "Talk to us", href: "/contact" };
  }
  // artist_pro / venue_premium, already top of the stack
  return { label: "Contact support", href: "/contact" };
}

export default function UpgradeModal({
  open,
  onClose,
  reason,
  currentTier,
  resetsAt,
}: Props) {
  if (!open) return null;

  const tierLabel = currentTier ? TIER_LABELS[currentTier] : "Free";
  const upgrade = suggestUpgrade(currentTier);

  // Headline + body copy by reason
  const copy = (() => {
    if (reason === "burst") {
      return {
        title: "Slow down a little",
        body: "You've kicked off a lot of renders in the last minute. Wait 30 seconds and try again, no quota was used.",
        showUpgrade: false,
      };
    }
    if (reason === "monthly") {
      return {
        title: "Monthly render cap reached",
        body: `You're on the ${tierLabel} plan. To keep rendering this month, upgrade, your daily limits also go up.`,
        showUpgrade: true,
      };
    }
    // "daily" or generic
    const resetCopy = resetsAt
      ? ` Resets at ${formatReset(resetsAt)}.`
      : "";
    return {
      title: "Daily artwork limit hit",
      body: `You've placed your daily artwork count on the ${tierLabel} plan, re-renders of works you've already used today are still free.${resetCopy} Upgrade for more daily artworks (or unlimited on Pro / Venue Premium).`,
      showUpgrade: true,
    };
  })();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-modal-title"
      className="fixed inset-0 z-[60] grid place-items-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-black/5 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-3">
          <h2
            id="upgrade-modal-title"
            className="font-serif text-xl text-foreground"
          >
            {copy.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-stone-400 hover:text-stone-700 -mt-1 -mr-1 p-1"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="6" y1="18" x2="18" y2="6" />
            </svg>
          </button>
        </div>

        <p className="text-sm text-stone-600 leading-relaxed mb-5">
          {copy.body}
        </p>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900"
          >
            {copy.showUpgrade ? "Not now" : "Got it"}
          </button>
          {copy.showUpgrade && (
            <Link
              href={upgrade.href}
              onClick={onClose}
              className="px-4 py-2 rounded-full bg-stone-900 text-white text-sm hover:bg-stone-800"
            >
              {upgrade.label}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function formatReset(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "midnight UTC";
    // Show in the user's local time, e.g. "1:00 AM"
    return d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "midnight UTC";
  }
}
