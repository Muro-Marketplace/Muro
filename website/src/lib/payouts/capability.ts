// One answer to "can we send this person money right now, and if not, why not".
// Used by every route that is about to take money on someone else's behalf, and
// by every path that is about to schedule a transfer (C1, 04 §C1).
//
// charges_enabled is NOT sufficient. A Connect account can accept charges while
// payouts are disabled (mid-KYC, failed verification, restricted for review).
// Transfers to such an account succeed and then sit in an unpayable balance. We
// gate on payouts_enabled.
//
// Supersedes lib/stripe-connect-status.ts (which checked only charges_enabled,
// for artists only, and returned a bare boolean with no reason).

import type { SupabaseClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe";

const CACHE_TTL_MS = 60_000;

export type PayoutBlockReason =
  | "no_account"
  | "charges_disabled"
  | "payouts_disabled"
  | "requirements_due"
  | "stripe_unavailable";

export interface PayoutCapability {
  ok: boolean;
  accountId: string | null;
  reason: PayoutBlockReason | null;
  /** Populated when reason === "requirements_due". */
  currentlyDue?: string[];
}

export interface PayoutTarget {
  kind: "artist" | "venue";
  /** Either identifier works; userId is preferred. */
  userId?: string;
  slug?: string;
}

const TABLE = { artist: "artist_profiles", venue: "venue_profiles" } as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = Pick<SupabaseClient<any, any, any>, "from">;

export async function canReceivePayout(
  db: AnyClient,
  target: PayoutTarget,
): Promise<PayoutCapability> {
  const table = TABLE[target.kind];
  let q = db
    .from(table)
    .select(
      "stripe_connect_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_charges_checked_at",
    );
  q = target.userId ? q.eq("user_id", target.userId) : q.eq("slug", target.slug ?? "");

  const { data: profile, error } = await q.maybeSingle();
  if (error) {
    console.error("[payouts] profile lookup failed", { target, error });
    return { ok: false, accountId: null, reason: "stripe_unavailable" };
  }
  const accountId = profile?.stripe_connect_account_id || null;
  // The column defaults to '' (mig 004), so a falsy check is required;
  // `!= null` would pass an empty string straight through to Stripe.
  if (!accountId) return { ok: false, accountId: null, reason: "no_account" };

  const checkedAt = profile?.stripe_charges_checked_at
    ? new Date(profile.stripe_charges_checked_at).getTime()
    : 0;
  const fresh =
    profile?.stripe_charges_enabled !== null &&
    profile?.stripe_payouts_enabled !== null &&
    Date.now() - checkedAt < CACHE_TTL_MS;

  if (fresh) {
    return decide(accountId, !!profile!.stripe_charges_enabled, !!profile!.stripe_payouts_enabled, []);
  }

  try {
    const account = await stripe.accounts.retrieve(accountId);
    const charges = account.charges_enabled ?? false;
    const payouts = account.payouts_enabled ?? false;
    const due = account.requirements?.currently_due ?? [];
    await db
      .from(table)
      .update({
        stripe_charges_enabled: charges,
        stripe_payouts_enabled: payouts,
        stripe_charges_checked_at: new Date().toISOString(),
      })
      .eq(target.userId ? "user_id" : "slug", target.userId ?? target.slug ?? "");
    return decide(accountId, charges, payouts, due);
  } catch (err) {
    console.error("[payouts] stripe accounts.retrieve failed", { accountId, err });
    // Fail closed. Never take money we might not be able to forward.
    return { ok: false, accountId, reason: "stripe_unavailable" };
  }
}

function decide(
  accountId: string,
  charges: boolean,
  payouts: boolean,
  currentlyDue: string[],
): PayoutCapability {
  if (!charges) return { ok: false, accountId, reason: "charges_disabled", currentlyDue };
  if (!payouts) return { ok: false, accountId, reason: "payouts_disabled", currentlyDue };
  return { ok: true, accountId, reason: null };
}

/** Buyer-facing copy for a block. Never leaks Stripe internals. */
export function payoutBlockMessage(name: string, reason: PayoutBlockReason): string {
  switch (reason) {
    case "no_account":
    case "charges_disabled":
    case "requirements_due":
      return `${name} hasn't finished setting up payouts yet, so we can't take this order.`;
    case "payouts_disabled":
      return `${name}'s payout account is on hold with Stripe. We've let them know.`;
    case "stripe_unavailable":
      return "We couldn't verify the payout account just now. Please try again in a minute.";
  }
}
