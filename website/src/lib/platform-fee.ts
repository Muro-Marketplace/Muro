/**
 * Platform fee rates by artist subscription tier. Shared between the
 * Stripe webhook (for sale splits) and the paid-loan subscription setup
 * route (for application_fee_percent).
 *
 * Founding artists and trialling artists pay 0% while free_until is in
 * the future, they still keep the full artist share, Wallplace forgoes
 * the fee for the free window.
 */

export const PLAN_FEE_PERCENT: Record<string, number> = {
  core: 15,
  premium: 8,
  pro: 5,
};

export const DEFAULT_PLAN_FEE_PERCENT = 15;

interface ArtistPlanState {
  subscription_plan?: string | null;
  free_until?: string | null;
}

/**
 * Return the platform fee percent we should charge for a given artist.
 * Respects free_until, returns 0 for founding / trial artists while the
 * free window is still live.
 */
export function platformFeePercentForArtist(profile: ArtistPlanState | null | undefined): number {
  if (!profile) return DEFAULT_PLAN_FEE_PERCENT;
  if (profile.free_until && new Date(profile.free_until) > new Date()) return 0;
  const plan = (profile.subscription_plan || "core").toLowerCase();
  return PLAN_FEE_PERCENT[plan] ?? DEFAULT_PLAN_FEE_PERCENT;
}
