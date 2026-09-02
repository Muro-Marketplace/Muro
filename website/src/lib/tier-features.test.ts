import { describe, expect, it } from "vitest";
import {
  ARTWORK_OF_THE_WEEK_DAYS,
  canFeatureArtwork,
  featuredUntilFrom,
  hasVenueRecommendationPriority,
  isArtworkOfTheWeek,
  isFeaturedArtistPlan,
  recommendationTierWeight,
} from "./tier-features";

// Owner decision 2026-09-02: Pro is the Featured artist tier; Premium and
// Pro can boost one artwork for a week; Core gets neither.
describe("tier features", () => {
  it("only Pro is a Featured artist", () => {
    expect(isFeaturedArtistPlan("pro")).toBe(true);
    expect(isFeaturedArtistPlan("PRO")).toBe(true);
    expect(isFeaturedArtistPlan("premium")).toBe(false);
    expect(isFeaturedArtistPlan("core")).toBe(false);
    expect(isFeaturedArtistPlan(null)).toBe(false);
  });

  it("Premium and Pro can feature an artwork, Core cannot", () => {
    expect(canFeatureArtwork("premium")).toBe(true);
    expect(canFeatureArtwork("pro")).toBe(true);
    expect(canFeatureArtwork("core")).toBe(false);
    expect(canFeatureArtwork(undefined)).toBe(false);
  });

  it("a work is of the week only while featured_until is in the future", () => {
    const now = new Date("2026-09-02T12:00:00Z");
    expect(isArtworkOfTheWeek("2026-09-09T12:00:00Z", now)).toBe(true);
    expect(isArtworkOfTheWeek("2026-09-02T11:59:59Z", now)).toBe(false);
    expect(isArtworkOfTheWeek(null, now)).toBe(false);
    expect(isArtworkOfTheWeek("not a date", now)).toBe(false);
  });

  it("a boost lasts seven days from now", () => {
    expect(ARTWORK_OF_THE_WEEK_DAYS).toBe(7);
    const now = new Date("2026-09-02T12:00:00Z");
    expect(featuredUntilFrom(now).toISOString()).toBe("2026-09-09T12:00:00.000Z");
  });
});

// Owner decision 2026-09-02: Premium and Pro artists get priority visibility
// in the weekly venue digest, Pro ahead of Premium (consistent with the
// Featured tier ordering above).
describe("venue recommendation priority", () => {
  it("Premium and Pro have venue recommendation priority, Core and null do not", () => {
    expect(hasVenueRecommendationPriority("premium")).toBe(true);
    expect(hasVenueRecommendationPriority("pro")).toBe(true);
    expect(hasVenueRecommendationPriority("core")).toBe(false);
    expect(hasVenueRecommendationPriority(null)).toBe(false);
  });

  it("weighs Pro first, Premium second, everyone else last, case-insensitively", () => {
    expect(recommendationTierWeight("pro")).toBe(0);
    expect(recommendationTierWeight("PRO")).toBe(0);
    expect(recommendationTierWeight("premium")).toBe(1);
    expect(recommendationTierWeight("PREMIUM")).toBe(1);
    expect(recommendationTierWeight("core")).toBe(2);
    expect(recommendationTierWeight(null)).toBe(2);
    expect(recommendationTierWeight(undefined)).toBe(2);
  });
});
