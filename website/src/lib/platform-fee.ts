/**
 * Platform fee rates by artist subscription tier. Shared between the
 * Stripe webhook (for sale splits) and the paid-loan subscription setup
 * route (for application_fee_percent).
 *
 * Trialling artists pay 0% while trial_end is in the future: they keep the full
 * artist share and Wallplace forgoes the fee for the trial window.
 *
 * This keyed on `free_until` until 2026-07-30. That column exists in no migration
 * and not in the live table, so every caller's `.select()` naming it was rejected
 * whole by PostgREST, the profile came back null, and the null branch below
 * returned the 15% default for EVERY artist regardless of plan. A premium artist
 * was charged 15% instead of 8% on every sale. `trial_end` is the real column
 * (D17.1). Founding artists have their own `is_founding_artist` flag and are NOT
 * given a zero fee here, because that was never live behaviour and switching it on
 * would change what artists are charged.
 */

export const PLAN_FEE_PERCENT: Record<string, number> = {
  core: 15,
  premium: 8,
  pro: 5,
};

export const DEFAULT_PLAN_FEE_PERCENT = 15;

interface ArtistPlanState {
  subscription_plan?: string | null;
  subscription_status?: string | null;
  trial_end?: string | null;
}

/**
 * Return the platform fee percent we should charge for a given artist.
 *
 * The discounted rate is only granted while the subscription is actually live:
 * `subscription_status` must be `active` or `trialing` (D40/E52). Otherwise the
 * default (Core) rate applies. Without this, a cancelled Pro artist kept their 5%
 * for ever, because `customer.subscription.deleted` writes only
 * `subscription_status: 'canceled'` and never resets `subscription_plan`.
 *
 * Stripe semantics make this simple: `cancel_at_period_end` leaves the status
 * `active` until the period actually ends, and only then does Stripe send
 * `customer.subscription.deleted` with status `canceled`. So keying on
 * `active`/`trialing` already gives paid-through-period-end behaviour; no
 * proration question arises.
 *
 * Every caller's `.select()` must therefore fetch `subscription_status` too, or
 * the field is undefined here and an active artist is over-charged the default
 * rate (the inverse of the `free_until` phantom-column failure this file's history
 * documents).
 */
export function platformFeePercentForArtist(profile: ArtistPlanState | null | undefined): number {
  if (!profile) return DEFAULT_PLAN_FEE_PERCENT;
  const status = (profile.subscription_status || "").toLowerCase();
  if (status !== "active" && status !== "trialing") return DEFAULT_PLAN_FEE_PERCENT;
  if (profile.trial_end && new Date(profile.trial_end) > new Date()) return 0;
  const plan = (profile.subscription_plan || "core").toLowerCase();
  return PLAN_FEE_PERCENT[plan] ?? DEFAULT_PLAN_FEE_PERCENT;
}
