"use client";

/**
 * Logged-in-only upsell banner pointing to /pricing.
 *
 * Surfaces on the marketplace + spaces pages so artists who haven't
 * subscribed yet still see a clear "join Wallplace" CTA without us
 * needing to redesign individual pages around the gate.
 *
 * Conditions for rendering:
 *   - User is signed in.
 *   - User isn't already on an active / trialing subscription.
 *   - User type is artist (subscriptions apply to artists today).
 *
 * Returns null otherwise so dropping the banner into a page is safe.
 */

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

interface Props {
  /** When true, render the banner with a sticky/floating treatment for
   *  pages where the inline banner would push content too far down. */
  variant?: "inline" | "compact";
  className?: string;
}

export default function SubscriptionUpsellBanner({ variant = "inline", className }: Props) {
  const { user, userType, subscriptionStatus, loading } = useAuth();
  if (loading || !user) return null;
  if (userType !== "artist") return null;
  const isSubscribed = subscriptionStatus === "active" || subscriptionStatus === "trialing";
  if (isSubscribed) return null;

  if (variant === "compact") {
    return (
      <div className={`bg-accent/5 border border-accent/20 rounded-sm px-4 py-2.5 flex items-center justify-between gap-3 ${className ?? ""}`}>
        <p className="text-xs text-foreground">
          <span className="font-medium">Join Wallplace.</span> Reach venues, list works, message directly.
        </p>
        <Link
          href="/pricing"
          className="shrink-0 inline-flex items-center justify-center px-3 py-1.5 bg-accent text-white text-[11px] font-medium rounded-sm hover:bg-accent-hover transition-colors whitespace-nowrap"
        >
          See plans
        </Link>
      </div>
    );
  }

  return (
    <div className={`bg-accent/5 border border-accent/20 rounded-sm p-5 sm:p-6 text-center ${className ?? ""}`}>
      <p className="text-sm font-medium text-foreground mb-1">Join Wallplace to get your work on walls</p>
      <p className="text-xs text-muted mb-4">List works, reach venues directly, and earn from placements. Plans from £9.99/month.</p>
      <Link
        href="/pricing"
        className="inline-flex items-center justify-center px-5 py-2 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent-hover transition-colors"
      >
        View plans
      </Link>
    </div>
  );
}
