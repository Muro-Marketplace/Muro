// Phase 1 chunk 1h. Single entry point for "is this user subscribed?"
// Phase 2 paywalls (the first protected-action gate) read from here.
//
// Source of truth:
//   - artist_profiles.subscription_status + .subscription_plan
//   - venue_profiles.subscription_status  + .subscription_plan      [future]
//     The venue subscription columns may not exist yet. We tolerate the
//     "column does not exist" error and fall back to a column-less lookup
//     so we can still tell whether the user IS a venue (returns
//     {active:false, plan:null, user_type:'venue'}).
//
// 'active' means subscription_status IS one of {'active','trialing'}.
// Anything else ('none','cancelled','past_due','incomplete', NULL) is
// inactive.
//
// Per-request memoisation: when called from an RSC / route handler this
// is wrapped with React's `cache()` so repeated calls in the same render
// hit the DB once. Outside React (e.g. webhook handlers, tests) we fall
// back to a direct uncached lookup.

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
 * (treated as a customer-without-subscription i.e. the user_type below
 * is 'customer'). Never throws — DB errors fall through to inactive.
 */
async function resolveSubscription(userId: string): Promise<SubscriptionState> {
  const id = userId.trim();
  if (!id) return { active: false, plan: null, user_type: null };

  const db = getSupabaseAdmin();

  // Artist first: most paid surface today.
  const artist = await readArtistSubscription(db, id);
  if (artist) return artist;

  // Then venue.
  const venue = await readVenueSubscription(db, id);
  if (venue) return venue;

  // Otherwise the user is a customer (or a legacy unmapped account).
  return { active: false, plan: null, user_type: "customer" };
}

async function readArtistSubscription(
  db: SupabaseClient,
  userId: string,
): Promise<SubscriptionState | null> {
  try {
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
      console.warn("[subscriptions] artist_profiles lookup failed:", error.message);
      return null;
    }
    if (!data) return null;
    return {
      active: ACTIVE_STATUSES.has(normaliseStatus(data.subscription_status)),
      plan: normalisePlan(data.subscription_plan),
      user_type: "artist",
    };
  } catch (err) {
    console.warn("[subscriptions] artist_profiles lookup threw:", err);
    return null;
  }
}

async function readVenueSubscription(
  db: SupabaseClient,
  userId: string,
): Promise<SubscriptionState | null> {
  try {
    const { data, error } = await db
      .from("venue_profiles")
      .select("user_id, subscription_status, subscription_plan")
      .eq("user_id", userId)
      .maybeSingle<{
        user_id: string;
        subscription_status?: string | null;
        subscription_plan?: string | null;
      }>();
    if (error) {
      // The venue subscription columns aren't required yet — fall back
      // to a column-less lookup so we can still report user_type='venue'.
      const lacksColumn = /column.*subscription_(status|plan).*does not exist/i.test(
        error.message,
      );
      if (!lacksColumn) {
        console.warn("[subscriptions] venue_profiles lookup failed:", error.message);
        return null;
      }
      const { data: bare } = await db
        .from("venue_profiles")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle<{ user_id: string }>();
      if (!bare) return null;
      return { active: false, plan: null, user_type: "venue" };
    }
    if (!data) return null;
    return {
      active: ACTIVE_STATUSES.has(normaliseStatus(data.subscription_status)),
      plan: normalisePlan(data.subscription_plan),
      user_type: "venue",
    };
  } catch (err) {
    console.warn("[subscriptions] venue_profiles lookup threw:", err);
    return null;
  }
}

/**
 * Public entry point. Memoised per request via React.cache, so multiple
 * call sites in a single render dedupe to one DB round-trip.
 *
 * Outside the React render tree (webhook handlers, tests, scripts) the
 * cache wrapper falls back to the underlying function with no warning,
 * which is intentional.
 */
export const isSubscribed = cache(
  (userId: string): Promise<SubscriptionState> => resolveSubscription(userId),
);
