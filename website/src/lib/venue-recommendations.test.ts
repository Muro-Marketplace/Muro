import { describe, expect, it } from "vitest";
import { rankArtistsForVenueDigest, VENUE_DIGEST_SUGGESTIONS, type RecommendableArtist } from "./venue-recommendations";

// Owner decision 2026-09-02: the weekly venue digest recommends approved,
// subscribed artists Pro first, then Premium, then everyone else, newest
// first within a tier, capped at VENUE_DIGEST_SUGGESTIONS.
function artist(overrides: Partial<RecommendableArtist> & { slug: string }): RecommendableArtist {
  return {
    name: overrides.slug,
    image: null,
    review_status: "approved",
    subscription_status: "active",
    subscription_plan: "core",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("rankArtistsForVenueDigest", () => {
  it("ranks Pro above Premium above Core", () => {
    const core = artist({ slug: "core-artist", subscription_plan: "core" });
    const premium = artist({ slug: "premium-artist", subscription_plan: "premium" });
    const pro = artist({ slug: "pro-artist", subscription_plan: "pro" });
    const ranked = rankArtistsForVenueDigest([core, premium, pro]);
    expect(ranked.map((a) => a.slug)).toEqual(["pro-artist", "premium-artist", "core-artist"]);
  });

  it("excludes a pending artist", () => {
    const pending = artist({ slug: "pending-artist", review_status: "pending" });
    const approved = artist({ slug: "approved-artist", review_status: "approved" });
    const ranked = rankArtistsForVenueDigest([pending, approved]);
    expect(ranked.map((a) => a.slug)).toEqual(["approved-artist"]);
  });

  it("treats a null review_status as approved, same as the public profile rule", () => {
    const legacy = artist({ slug: "legacy-artist", review_status: null });
    const ranked = rankArtistsForVenueDigest([legacy]);
    expect(ranked.map((a) => a.slug)).toEqual(["legacy-artist"]);
  });

  it("excludes an artist without an active or trialing subscription", () => {
    const cancelled = artist({ slug: "cancelled-artist", subscription_status: "cancelled" });
    const pastDue = artist({ slug: "past-due-artist", subscription_status: "past_due" });
    const active = artist({ slug: "active-artist", subscription_status: "active" });
    const trialing = artist({ slug: "trialing-artist", subscription_status: "trialing" });
    const ranked = rankArtistsForVenueDigest([cancelled, pastDue, active, trialing]);
    expect(ranked.map((a) => a.slug).sort()).toEqual(["active-artist", "trialing-artist"]);
  });

  it("orders newest first within a tier", () => {
    const older = artist({ slug: "older", subscription_plan: "pro", created_at: "2026-01-01T00:00:00Z" });
    const newer = artist({ slug: "newer", subscription_plan: "pro", created_at: "2026-06-01T00:00:00Z" });
    const ranked = rankArtistsForVenueDigest([older, newer]);
    expect(ranked.map((a) => a.slug)).toEqual(["newer", "older"]);
  });

  it(`caps at ${VENUE_DIGEST_SUGGESTIONS}`, () => {
    expect(VENUE_DIGEST_SUGGESTIONS).toBe(3);
    const artists = Array.from({ length: 5 }, (_, i) =>
      artist({ slug: `pro-${i}`, subscription_plan: "pro", created_at: `2026-01-0${i + 1}T00:00:00Z` }),
    );
    const ranked = rankArtistsForVenueDigest(artists);
    expect(ranked).toHaveLength(3);
    // newest three: pro-4, pro-3, pro-2
    expect(ranked.map((a) => a.slug)).toEqual(["pro-4", "pro-3", "pro-2"]);
  });

  it("is stable when there are fewer than three eligible artists", () => {
    const ranked = rankArtistsForVenueDigest([artist({ slug: "only-one", subscription_plan: "premium" })]);
    expect(ranked.map((a) => a.slug)).toEqual(["only-one"]);
  });

  it("returns an empty list when nothing is eligible", () => {
    expect(rankArtistsForVenueDigest([])).toEqual([]);
  });
});
