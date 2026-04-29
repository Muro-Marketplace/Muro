"use client";

/**
 * QuotaChip, the always-visible "X of Y daily renders" pill in the
 * editor's top-right corner.
 *
 * Self-contained: fetches /api/walls/quota on mount + when refreshed via
 * the `nonce` prop, so the parent editor can force a refresh after a
 * render completes.
 *
 * Visual states:
 *   - Loading    pulsing skeleton
 *   - OK         neutral chip with `5 of 10`
 *   - Amber      ≥ 80% used (warning colour)
 *   - Red        100% used + small upgrade nudge
 *   - Guest      "Sign in to render" (no numbers)
 *   - Error      silent fallback to neutral skeleton (don't block editor)
 */

import { useEffect, useState } from "react";
import type { QuotaStatus, WallOwnerType } from "@/lib/visualizer/types";

interface Props {
  /** Hint for which portal the user is on. Forwarded to ?as=... */
  ownerTypeHint?: WallOwnerType;
  /** Bump this number to force a refetch (e.g. after a render). */
  refreshNonce?: number;
  /** Authorization bearer token (Supabase session JWT). Omit for guest. */
  authToken?: string | null;
  /** Click target for the upgrade CTA. */
  onUpgradeClick?: () => void;
}

export default function QuotaChip({
  ownerTypeHint,
  refreshNonce,
  authToken,
  onUpgradeClick,
}: Props) {
  const [status, setStatus] = useState<QuotaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const url = new URL("/api/walls/quota", window.location.origin);
    if (ownerTypeHint) url.searchParams.set("as", ownerTypeHint);

    fetch(url.toString(), {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      cache: "no-store",
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: QuotaStatus) => {
        if (cancelled) return;
        setStatus(data);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ownerTypeHint, refreshNonce, authToken]);

  if (loading) {
    return (
      <div
        aria-label="Loading quota"
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/80 backdrop-blur border border-black/5 text-xs"
      >
        <span className="h-2 w-2 rounded-full bg-stone-300 animate-pulse" />
        <span className="text-stone-400">Checking…</span>
      </div>
    );
  }

  if (error || !status) {
    // Don't block the editor on a flaky quota fetch, render a muted chip.
    return (
      <div
        aria-label="Quota unavailable"
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/80 backdrop-blur border border-black/5 text-xs text-stone-400"
      >
        <span className="h-2 w-2 rounded-full bg-stone-300" />
        Quota unavailable
      </div>
    );
  }

  if (status.tier === "guest") {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/80 backdrop-blur border border-black/5 text-xs text-stone-600">
        <span className="h-2 w-2 rounded-full bg-stone-400" />
        Sign in to generate renders
      </div>
    );
  }

  const used = status.daily_used;
  const limit = status.limits.daily;
  const unlimited = limit === -1;

  // Unlimited tier (artist_pro / venue_premium), no count, just a
  // calm "Unlimited" badge so the chip doesn't shout numbers that
  // don't matter.
  if (unlimited) {
    return (
      <div
        aria-live="polite"
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/85 backdrop-blur border border-black/5 text-xs shadow-sm"
      >
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        <span className="text-stone-700">
          Unlimited <span className="text-stone-500">artworks today</span>
        </span>
      </div>
    );
  }

  const remaining = status.daily_remaining;
  const ratio = limit > 0 ? used / limit : 1;

  const variant: "ok" | "warn" | "out" =
    remaining <= 0 ? "out" : ratio >= 0.8 ? "warn" : "ok";

  const dotClass =
    variant === "out"
      ? "bg-red-500"
      : variant === "warn"
        ? "bg-amber-500"
        : "bg-emerald-500";

  const textClass =
    variant === "out"
      ? "text-red-700"
      : variant === "warn"
        ? "text-amber-700"
        : "text-stone-700";

  return (
    <div
      aria-live="polite"
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/85 backdrop-blur border border-black/5 text-xs shadow-sm"
    >
      <span className={`h-2 w-2 rounded-full ${dotClass}`} />
      <span className={`tabular-nums ${textClass}`}>
        {used} <span className="text-stone-400">of</span> {limit}{" "}
        <span className="text-stone-500">artworks today</span>
      </span>
      {variant === "out" && onUpgradeClick && (
        <button
          type="button"
          onClick={onUpgradeClick}
          className="ml-1 px-2 py-0.5 rounded-full bg-stone-900 text-white text-[10px] uppercase tracking-wider hover:bg-stone-800"
        >
          Upgrade
        </button>
      )}
    </div>
  );
}
