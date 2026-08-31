"use client";

/**
 * The artist's remaining venue approaches for the rolling week, in the places
 * they actually look: the Spaces header, the request form on each venue card,
 * the portal dashboard and the billing page.
 *
 * The cap (Core 3 / Premium 6 / Pro 15 per rolling 7 days, shared across
 * placement requests, first messages and artwork request responses) was
 * enforced from the day it shipped and stated nowhere. The pricing table said
 * "Message venues: Yes", the portal showed no number, and the first an artist
 * heard of it was a 429 in the middle of writing a request. One hook, one
 * badge, one endpoint, so the number cannot drift between surfaces.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/api-client";

export interface OutreachAllowance {
  limit: number | null;
  used: number;
  remaining: number | null;
  unlimited: boolean;
  planName: string;
  nextSlotAt: string | null;
  windowDays: number;
}

/**
 * Null while loading, and null for anyone without an artist profile (venues
 * aren't capped). A failed lookup also yields null: the server enforces the cap
 * either way, so a broken read must never block or mislead.
 */
export function useOutreachAllowance(): OutreachAllowance | null {
  const [allowance, setAllowance] = useState<OutreachAllowance | null>(null);

  useEffect(() => {
    let cancelled = false;
    authFetch("/api/outreach/allowance")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d || !d.applicable) return;
        setAllowance({
          limit: d.limit ?? null,
          used: d.used ?? 0,
          remaining: d.remaining ?? null,
          unlimited: !!d.unlimited,
          planName: d.planName || "Core",
          nextSlotAt: d.nextSlotAt || null,
          windowDays: d.windowDays ?? 7,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return allowance;
}

/** "Thursday 4 September", or null when there is no usable date. */
export function formatNextSlot(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

interface BadgeProps {
  allowance: OutreachAllowance | null;
  /**
   * "inline" is one muted line for a form or a page header. "card" is the
   * bordered block for the portal dashboard and billing page, where it has to
   * hold its own against the tiles around it.
   */
  variant?: "inline" | "card";
  className?: string;
}

/**
 * Renders nothing when there is no allowance to show (loading, not an artist,
 * or an unlimited plan), so every caller can drop it in unguarded.
 */
export default function OutreachAllowanceBadge({
  allowance,
  variant = "inline",
  className = "",
}: BadgeProps) {
  if (!allowance || allowance.unlimited || allowance.remaining === null || allowance.limit === null) {
    return null;
  }

  const { remaining, limit, planName, nextSlotAt } = allowance;
  const spent = remaining === 0;
  const when = formatNextSlot(nextSlotAt);
  const noun = limit === 1 ? "approach" : "approaches";

  if (variant === "card") {
    return (
      <div
        className={`border rounded-sm p-4 ${spent ? "border-amber-200 bg-amber-50" : "border-border bg-background"} ${className}`}
      >
        <p className="text-xs text-muted mb-1">Venue approaches this week</p>
        <p className="font-serif text-2xl text-foreground">
          {remaining} <span className="text-base text-muted">of {limit} left</span>
        </p>
        <p className="text-[11px] text-muted mt-1.5 leading-relaxed">
          {spent
            ? `You have used your ${planName} allowance. ${when ? `Your next approach frees up on ${when}. ` : ""}`
            : `Placement requests, first messages and artwork request responses all draw on your ${planName} allowance. It runs on a rolling 7 days, so each approach comes back a week after you use it. `}
          <Link href="/pricing" className="underline hover:text-accent">
            {spent ? "Upgrade to reach more venues" : "See plan limits"}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <p className={`text-xs ${spent ? "text-amber-900" : "text-muted"} ${className}`}>
      {spent ? (
        <>
          You have used all {limit} venue {noun} on your {planName} plan this week.
          {when ? ` Your next one frees up on ${when}. ` : " "}
          <Link href="/pricing" className="underline hover:text-accent">
            Upgrade your plan
          </Link>{" "}
          to reach more venues now.
        </>
      ) : (
        <>
          {remaining} of {limit} venue {noun} left this week on {planName}. Placement
          requests, first messages and artwork request responses all draw on the same
          allowance.
        </>
      )}
    </p>
  );
}
