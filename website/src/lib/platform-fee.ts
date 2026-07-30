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
  trial_end?: string | null;
}

/**
 * Return the platform fee percent we should charge for a given artist.
 * Respects trial_end, returning 0 while an artist's trial window is still live.
 */
export function platformFeePercentForArtist(profile: ArtistPlanState | null | undefined): number {
  if (!profile) return DEFAULT_PLAN_FEE_PERCENT;
  if (profile.trial_end && new Date(profile.trial_end) > new Date()) return 0;
  const plan = (profile.subscription_plan || "core").toLowerCase();
  return PLAN_FEE_PERCENT[plan] ?? DEFAULT_PLAN_FEE_PERCENT;
}
