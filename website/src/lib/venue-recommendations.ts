import { recommendationTierWeight } from "./tier-features";

export const VENUE_DIGEST_SUGGESTIONS = 3;

export interface RecommendableArtist {
  slug: string;
  name: string;
  image: string | null;
  review_status: string | null;
  subscription_status: string | null;
  subscription_plan: string | null;
  created_at: string | null;
}

/**
 * Which artists a venue digest recommends: approved, on an active or
 * trialing subscription, Pro first, then Premium, then the rest, newest
 * first within a tier. Capped at VENUE_DIGEST_SUGGESTIONS.
 */
export function rankArtistsForVenueDigest<T extends RecommendableArtist>(artists: T[]): T[] {
  return artists
    .filter((a) => a.review_status === "approved" || a.review_status == null)
    .filter((a) => ["active", "trialing"].includes((a.subscription_status || "").toLowerCase()))
    .sort((a, b) => {
      const w = recommendationTierWeight(a.subscription_plan) - recommendationTierWeight(b.subscription_plan);
      if (w !== 0) return w;
      return (b.created_at || "").localeCompare(a.created_at || "");
    })
    .slice(0, VENUE_DIGEST_SUGGESTIONS);
}
