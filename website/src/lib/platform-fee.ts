/**
 * Platform fee rates by artist subscription tier. Shared between the
 * Stripe webhook (for sale splits) and the paid-loan subscription setup
 * route (for application_fee_percent).
 *
 * Trialling artists pay 0% while trial_end is in the future: they keep the full
 * artist share and Wallplace forgoes the fee for the trial window.
 *
 * History, because this file has been burned twice in opposite directions:
 * it keyed on `free_until` until 2026-07-30 when that column DID NOT EXIST, so
 * every caller's select was rejected whole and every artist paid the 15%
 * default (D17.1). Migration 115 (owner decision 10) then created `free_until`
 * for real as the platform-owned referral window, so it is back below — but as
 * an EXISTING column this time, snapshot-checked by the phantom guards, and
 * subordinate to the status gate. Founding artists have their own
 * `is_founding_artist` flag and are NOT given a zero fee here, because that was
 * never live behaviour and switching it on would change what artists are
 * charged.
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
  free_until?: string | null;
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
  // Owner decision 10 / D17.2 (2026-08-28). `free_until` is the PLATFORM-owned
  // fee-free window — today, the referral reward: 30 days at 0% for the
  // referrer when someone they referred first pays. It sits AFTER the status
  // gate on purpose, so the D40/E52 invariant holds: a cancelled artist gets no
  // discount of any kind, reward or not. Distinct from `trial_end`, which
  // Stripe owns and overwrites on every subscription update — writing a reward
  // there is how it would silently evaporate.
  if (profile.free_until && new Date(profile.free_until) > new Date()) return 0;
  const plan = (profile.subscription_plan || "core").toLowerCase();
  return PLAN_FEE_PERCENT[plan] ?? DEFAULT_PLAN_FEE_PERCENT;
}
