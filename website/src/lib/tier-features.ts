/**
 * Tier perks, owner decision 2026-09-02.
 *
 *   Pro:      Featured artist (chip, first in the marketplace sort, the only
 *             tier ?featured=1 returns) AND Artwork of the Week.
 *   Premium:  Artwork of the Week only.
 *   Core:     neither.
 *
 * The API, the marketplace sort and the portal all read these so they cannot
 * drift. Pure: `now` is passed in.
 */
export const ARTWORK_OF_THE_WEEK_DAYS = 7;

function norm(plan?: string | null): string {
  return (plan || "").toLowerCase();
}

export function isFeaturedArtistPlan(plan?: string | null): boolean {
  return norm(plan) === "pro";
}

export function canFeatureArtwork(plan?: string | null): boolean {
  const p = norm(plan);
  return p === "pro" || p === "premium";
}

export function isArtworkOfTheWeek(featuredUntil: string | null | undefined, now: Date): boolean {
  if (!featuredUntil) return false;
  const t = Date.parse(featuredUntil);
  return Number.isFinite(t) && t > now.getTime();
}

export function featuredUntilFrom(now: Date): Date {
  return new Date(now.getTime() + ARTWORK_OF_THE_WEEK_DAYS * 24 * 60 * 60 * 1000);
}

/** Premium and Pro are recommended to venues ahead of Core (owner decision 2026-09-02). */
export function hasVenueRecommendationPriority(plan?: string | null): boolean {
  return canFeatureArtwork(plan);
}

/** Pro first, then Premium, then everyone else, for the weekly venue digest. */
export function recommendationTierWeight(plan?: string | null): 0 | 1 | 2 {
  const p = norm(plan);
  if (p === "pro") return 0;
  if (p === "premium") return 1;
  return 2;
}
