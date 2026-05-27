// Phase 1 chunk 1h. Single entry point for "is this user subscribed?"
// Phase 2 paywalls (the first protected-action gate) read from here.
//
// Source of truth:
//   - artist_profiles.subscription_status + .subscription_plan
//   - venue_profiles.subscription_status  + .subscription_plan
//     Both column sets exist as of migration 064 (Phase 2 chunk 2.0a).
//     If a venue row has no subscription_status, the column default
//     'none' resolves to inactive.
//
// 'active' means subscription_status IS one of {'active','trialing'}.
// Anything else ('none','cancelled','past_due','incomplete', NULL) is
// inactive.
//
// Per-request memoisation: when called from an RSC / route handler this
// is wrapped with React's `cache()` so repeated calls in the same render
// hit the DB once. Outside RSC the dedup window collapses to module
// lifetime — fine for short-lived handlers, not a per-request guarantee.

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export type SubscriptionPlan = "core" | "premium" | "pro";
export type UserType = "artist" | "venue" | "customer";

export interface SubscriptionState {
  active: boolean;
  plan: SubscriptionPlan | null;
  user_type: UserType | null;
}

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

function normaliseStatus(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().trim();
}

function normalisePlan(p: string | null | undefined): SubscriptionPlan | null {
  const v = (p ?? "").toLowerCase().trim();
  if (v === "core" || v === "premium" || v === "pro") return v;
  return null;
}

/**
 * Resolve the subscription state for a Supabase auth user.
 *
 * Returns user_type=null when the user has no artist or venue profile
 * (mid-signup race, unmapped account, etc.). Never throws — DB errors
 * fall through to inactive.
 *
 * Artist and venue lookups run in parallel because the paywall hot path
 * doesn't want to pay two sequential round-trips for venue users. Artist
 * still wins if both exist (a single auth user being both is the legacy
 * dual-identity case from the visualizer tier-resolver).
 */
export async function resolveSubscription(
  userId: string,
  client?: SupabaseClient,
): Promise<SubscriptionState> {
  const id = userId.trim();
  if (!id) return { active: false, plan: null, user_type: null };

  const db = client ?? getSupabaseAdmin();

  const [artist, venue] = await Promise.all([
    readArtistSubscription(db, id),
    readVenueSubscription(db, id),
  ]);
  if (artist) return artist;
  if (venue) return venue;
  return { active: false, plan: null, user_type: null };
}

async function readArtistSubscription(
  db: SupabaseClient,
  userId: string,
): Promise<SubscriptionState | null> {
  // Phase 2.0 spec line 89: stop tolerating missing columns. Both
  // artist_profiles and venue_profiles now carry subscription_status
  // and subscription_plan (mig 003 + mig 064). Any non-recoverable
  // error here is a real bug we want to surface, not swallow.
  const { data, error } = await db
    .from("artist_profiles")
    .select("user_id, subscription_status, subscription_plan")
    .eq("user_id", userId)
    .maybeSingle<{
      user_id: string;
      subscription_status: string | null;
      subscription_plan: string | null;
    }>();
  if (error) {
    // PostgrestError comes through here for genuine DB problems
    // (connection failures, RLS denials). Log + return null so the
    // resolver can fall through to the venue path; the dispatcher
    // higher up returns inactive when neither side resolves.
    console.warn("[subscriptions] artist_profiles lookup failed:", error.message);
    return null;
  }
  if (!data) return null;
  return {
    active: ACTIVE_STATUSES.has(normaliseStatus(data.subscription_status)),
    plan: normalisePlan(data.subscription_plan),
    user_type: "artist",
  };
}

async function readVenueSubscription(
  db: SupabaseClient,
  userId: string,
): Promise<SubscriptionState | null> {
  const { data, error } = await db
    .from("venue_profiles")
    .select("user_id, subscription_status, subscription_plan")
    .eq("user_id", userId)
    .maybeSingle<{
      user_id: string;
      subscription_status: string | null;
      subscription_plan: string | null;
    }>();
  if (error) {
    console.warn("[subscriptions] venue_profiles lookup failed:", error.message);
    return null;
  }
  if (!data) return null;
  return {
    active: ACTIVE_STATUSES.has(normaliseStatus(data.subscription_status)),
    plan: normalisePlan(data.subscription_plan),
    user_type: "venue",
  };
}

/**
 * Public entry point. Memoised per request via React.cache, so multiple
 * call sites in a single render dedupe to one DB round-trip.
 *
 * The cached binding only accepts a userId — the optional client
 * parameter on `resolveSubscription` exists for tests and is bypassed
 * by the cache wrapper here. Callers outside the React render tree
 * (webhooks, scripts) can call `resolveSubscription` directly with a
 * custom client if needed.
 */
export const isSubscribed = cache(
  (userId: string): Promise<SubscriptionState> => resolveSubscription(userId),
);
