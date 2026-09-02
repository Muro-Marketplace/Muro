import { isArtworkOfTheWeek, isFeaturedArtistPlan } from "./tier-features";

/** Pro first, everyone else after (owner decision 2026-09-02: Premium is no longer second). */
export function artistTierWeight(plan?: string | null): 0 | 1 {
  return isFeaturedArtistPlan(plan) ? 0 : 1;
}

/** Live Artwork of the Week first, then a Pro artist's work, then the rest. */
export function workFeaturedWeight(
  work: { featuredUntil?: string | null; artistSubscriptionPlan?: string | null },
  now: Date,
): 0 | 1 | 2 {
  if (isArtworkOfTheWeek(work.featuredUntil, now)) return 0;
  return isFeaturedArtistPlan(work.artistSubscriptionPlan) ? 1 : 2;
}
