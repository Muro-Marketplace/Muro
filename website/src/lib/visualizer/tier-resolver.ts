/**
 * Wall Visualizer, tier resolver.
 *
 * Maps a Supabase auth user (and a hint about which portal they're acting
 * in) to the `VisualizerTier` we use throughout the visualizer code.
 *
 * Source of truth:
 *   - artist_profiles.subscription_plan ('core' | 'premium' | 'pro')
 *   - venue_profiles.subscription_plan  ('standard' | 'premium')   [future]
 *
 *   The venue subscription system isn't built yet, so the resolver tolerates
 *   the column being absent and defaults all venues to 'venue_standard'.
 *   Adding 'premium' later is a no-code change, just populate the column.
 *
 * Owner-type hint:
 *   A single auth user can be both an artist and a venue contact. We need
 *   to know which surface they're acting on so we don't accidentally hand
 *   an artist's 25/day limit to the same person hitting the venue portal.
 *   The hint comes from URL/route context (e.g. /venue-portal/* → 'venue').
 *
 *   When the hint is omitted (e.g. an unauthenticated artwork-page render),
 *   we fall through artist → venue → customer in that order.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { VisualizerTier, WallOwnerType } from "./types";

export interface ResolveTierInput {
  /** Supabase auth user id. Null/empty → 'guest'. */
  userId: string | null | undefined;
  /** Which portal the user is acting on, if known. */
  ownerTypeHint?: WallOwnerType;
}

interface ArtistProfileRow {
  user_id: string;
  subscription_plan: string | null;
  free_until: string | null;
}

interface VenueProfileRow {
  user_id: string;
  /** Future column, graceful fallback if absent. */
  subscription_plan?: string | null;
}

/**
 * Resolve the visualizer tier for the given user.
 *
 * Returns 'guest' when userId is null. Never throws, DB errors fall
 * through to the safest tier ('customer' or 'guest') and log a warning.
 */
export async function resolveTier(
  input: ResolveTierInput,
  client?: SupabaseClient,
): Promise<VisualizerTier> {
  const userId = (input.userId ?? "").trim();
  if (!userId) return "guest";

  const db = client ?? getSupabaseAdmin();

  // ── Hinted resolution ────────────────────────────────────────────────
  if (input.ownerTypeHint === "customer") {
    return "customer";
  }

  if (input.ownerTypeHint === "artist") {
    return (await readArtistTier(db, userId)) ?? "artist_core";
  }

  if (input.ownerTypeHint === "venue") {
    return (await readVenueTier(db, userId)) ?? "venue_standard";
  }

  // ── Unhinted: try artist → venue → customer ──────────────────────────
  const artistTier = await readArtistTier(db, userId);
  if (artistTier) return artistTier;

  const venueTier = await readVenueTier(db, userId);
  if (venueTier) return venueTier;

  return "customer";
}

// ── Internal lookups ────────────────────────────────────────────────────

async function readArtistTier(
  db: SupabaseClient,
  userId: string,
): Promise<VisualizerTier | null> {
  try {
    const { data, error } = await db
      .from("artist_profiles")
      .select("user_id, subscription_plan, free_until")
      .eq("user_id", userId)
      .maybeSingle<ArtistProfileRow>();
    if (error) {
      console.warn("[visualizer] artist_profiles lookup failed:", error.message);
      return null;
    }
    if (!data) return null;
    return artistPlanToTier(data.subscription_plan);
  } catch (err) {
    console.warn("[visualizer] artist_profiles lookup threw:", err);
    return null;
  }
}

async function readVenueTier(
  db: SupabaseClient,
  userId: string,
): Promise<VisualizerTier | null> {
  try {
    const { data, error } = await db
      .from("venue_profiles")
      .select("user_id, subscription_plan")
      .eq("user_id", userId)
      .maybeSingle<VenueProfileRow>();
    if (error) {
      // The venue subscription column doesn't exist yet, Postgres returns
      // a column-not-found error. Fall back to a column-less lookup so we
      // can still tell whether the user IS a venue.
      const lacksColumn = /column.*subscription_plan.*does not exist/i.test(
        error.message,
      );
      if (!lacksColumn) {
        console.warn("[visualizer] venue_profiles lookup failed:", error.message);
        return null;
      }
      const { data: bareData } = await db
        .from("venue_profiles")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle<{ user_id: string }>();
      if (!bareData) return null;
      return "venue_standard";
    }
    if (!data) return null;
    return venuePlanToTier(data.subscription_plan ?? null);
  } catch (err) {
    console.warn("[visualizer] venue_profiles lookup threw:", err);
    return null;
  }
}

// ── Plan → tier mapping ─────────────────────────────────────────────────

/**
 * Map artist subscription_plan to a VisualizerTier. Mirrors the
 * platform-fee mapping (core/premium/pro). Note we don't downgrade based
 * on free_until, a Premium artist on a founding-artist 0% period still
 * gets Premium visualizer access, which matches the user's expectation.
 */
export function artistPlanToTier(plan: string | null | undefined): VisualizerTier {
  const p = (plan || "").toLowerCase().trim();
  if (p === "pro") return "artist_pro";
  if (p === "premium") return "artist_premium";
  // core, empty, unknown → core (the cheapest paid tier)
  return "artist_core";
}

/**
 * Map venue subscription_plan to a VisualizerTier. Today only 'premium'
 * is recognised; everything else (including null) is venue_standard.
 */
export function venuePlanToTier(plan: string | null | undefined): VisualizerTier {
  const p = (plan || "").toLowerCase().trim();
  if (p === "premium") return "venue_premium";
  return "venue_standard";
}
