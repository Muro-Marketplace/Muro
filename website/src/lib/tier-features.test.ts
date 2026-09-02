import { describe, expect, it } from "vitest";
import {
  ARTWORK_OF_THE_WEEK_DAYS,
  canFeatureArtwork,
  featuredUntilFrom,
  isArtworkOfTheWeek,
  isFeaturedArtistPlan,
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
