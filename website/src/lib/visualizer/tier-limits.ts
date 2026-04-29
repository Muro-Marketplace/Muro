/**
 * Wall Visualizer, entitlement table.
 *
 * This file is the single source of truth for "what can a tier do". The
 * quota service (PR #2) reads these limits to allow / deny render calls;
 * the editor reads them to render the quota chip and upgrade prompts.
 *
 * Approved values (see WALL_VISUALIZER.md §F1):
 *
 *   Tier              Daily  Monthly  Uploads/d  Saved walls  Layouts/wall  Showroom
 *   ──────────────────────────────────────────────────────────────────────────────
 *   guest               0       0        0           0             0           no
 *   customer            2      30        1           1             0           no
 *   artist_core         3      50        1           2             0           no
 *   artist_premium     10     200        3           5            10           no
 *   artist_pro         25     500        5         ∞ (-1)        ∞ (-1)        yes
 *   venue_standard      5     100        2           3            10           no
 *   venue_premium      20     400        5         ∞ (-1)        ∞ (-1)        no
 *
 * Environment overrides:
 *   These limits can be overridden by env vars without a redeploy of code,
 *   so we can tune in production without a release. The override format is:
 *     VISUALIZER_LIMIT_<TIER>_DAILY=<int>
 *     VISUALIZER_LIMIT_<TIER>_MONTHLY=<int>
 *   (TIER uppercased, dots/underscores preserved).
 *
 * Per-user overrides:
 *   Stored in the `visualizer_quota_overrides` table. Applied additively
 *   on top of tier limits by the quota service.
 */

import type { TierLimits, VisualizerTier } from "./types";

// ── Defaults (the table above) ──────────────────────────────────────────

const DEFAULTS: Record<VisualizerTier, TierLimits> = {
  guest: {
    daily: 0,
    monthly: 0,
    wall_uploads_daily: 0,
    saved_walls: 0,
    saved_layouts_per_wall: 0,
    can_publish_showroom: false,
  },
  customer: {
    daily: 2,
    monthly: 30,
    wall_uploads_daily: 1,
    saved_walls: 1,
    saved_layouts_per_wall: 0,
    can_publish_showroom: false,
  },
  artist_core: {
    daily: 3,
    monthly: 50,
    wall_uploads_daily: 1,
    saved_walls: 2,
    // Bumped 0 → 1 so the showroom is actually usable on the free
    // tier, saving the layout is a basic expectation when you've
    // composed a scene. Multiple competing layouts per wall is the
    // upsell that pushes artists to artist_premium (10) / pro (∞).
    saved_layouts_per_wall: 1,
    can_publish_showroom: false,
  },
  artist_premium: {
    daily: 10,
    monthly: 200,
    wall_uploads_daily: 3,
    saved_walls: 5,
    saved_layouts_per_wall: 10,
    can_publish_showroom: false,
  },
  artist_pro: {
    // Pro tier, unlimited artworks rendered per day. -1 here is the
    // sentinel quota.ts uses to skip the cap check entirely.
    daily: -1,
    monthly: -1,
    wall_uploads_daily: 5,
    saved_walls: -1,
    saved_layouts_per_wall: -1,
    can_publish_showroom: true,
  },
  venue_standard: {
    daily: 5,
    monthly: 100,
    wall_uploads_daily: 2,
    saved_walls: 3,
    saved_layouts_per_wall: 10,
    can_publish_showroom: false,
  },
  venue_premium: {
    // Venue Premium, unlimited artworks rendered per day.
    daily: -1,
    monthly: -1,
    wall_uploads_daily: 5,
    saved_walls: -1,
    saved_layouts_per_wall: -1,
    can_publish_showroom: false,
  },
};

// ── Env override parsing ────────────────────────────────────────────────

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

function applyEnvOverrides(
  tier: VisualizerTier,
  base: TierLimits,
): TierLimits {
  const upper = tier.toUpperCase();
  return {
    ...base,
    daily: intFromEnv(`VISUALIZER_LIMIT_${upper}_DAILY`, base.daily),
    monthly: intFromEnv(`VISUALIZER_LIMIT_${upper}_MONTHLY`, base.monthly),
    wall_uploads_daily: intFromEnv(
      `VISUALIZER_LIMIT_${upper}_UPLOADS_DAILY`,
      base.wall_uploads_daily,
    ),
  };
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Resolve the limits for a given tier. Reads env overrides on every call
 * (cheap, no I/O) so we can update limits without a server restart by
 * just changing env vars (and reloading any process where applicable).
 */
export function getTierLimits(tier: VisualizerTier): TierLimits {
  const base = DEFAULTS[tier];
  if (!base) {
    // Unknown tier, fail closed (zero limits). Logged so we notice.
    console.warn(`[visualizer] Unknown tier "${tier}", applying guest limits`);
    return DEFAULTS.guest;
  }
  return applyEnvOverrides(tier, base);
}

/**
 * Returns the static, environment-free defaults. Useful for tests and
 * for displaying "this is what you'd get" upgrade comparison cards.
 */
export function getDefaultTierLimits(tier: VisualizerTier): TierLimits {
  return DEFAULTS[tier] ?? DEFAULTS.guest;
}

/** All tiers, in display order, used by upgrade UX. */
export const TIER_DISPLAY_ORDER: readonly VisualizerTier[] = [
  "guest",
  "customer",
  "artist_core",
  "artist_premium",
  "artist_pro",
  "venue_standard",
  "venue_premium",
] as const;

/** Human label for upgrade copy. */
export const TIER_LABELS: Record<VisualizerTier, string> = {
  guest: "Guest",
  customer: "Customer",
  artist_core: "Artist Core",
  artist_premium: "Artist Premium",
  artist_pro: "Artist Pro",
  venue_standard: "Venue Standard",
  venue_premium: "Venue Premium",
};

// ── Cost table ──────────────────────────────────────────────────────────

/**
 * How many quota units each action costs. Reads as a const so we can
 * adjust without spreading magic numbers.
 */
export const ACTION_COSTS = {
  render_standard: 1,
  render_hd: 2,
  wall_upload: 1,
  showroom_publish: 1,
  /** Refund is the inverse, set per-call by the consumer. */
  refund: 0,
} as const;

export type ActionCost = (typeof ACTION_COSTS)[keyof typeof ACTION_COSTS];
