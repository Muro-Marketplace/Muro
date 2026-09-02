import { describe, expect, it } from "vitest";
import { artistTierWeight, workFeaturedWeight } from "./marketplace-featured-sort";

const now = new Date("2026-09-02T12:00:00Z");

describe("marketplace Featured ordering (owner decision 2026-09-02)", () => {
  it("only Pro artists are weighted first; Premium is no longer second", () => {
    expect(artistTierWeight("pro")).toBe(0);
    expect(artistTierWeight("premium")).toBe(1);
    expect(artistTierWeight("core")).toBe(1);
  });

  it("a live Artwork of the Week beats everything, then Pro works, then the rest", () => {
    expect(workFeaturedWeight({ featuredUntil: "2026-09-09T00:00:00Z", artistSubscriptionPlan: "core" }, now)).toBe(0);
    expect(workFeaturedWeight({ featuredUntil: "2026-09-01T00:00:00Z", artistSubscriptionPlan: "pro" }, now)).toBe(1);
    expect(workFeaturedWeight({ artistSubscriptionPlan: "premium" }, now)).toBe(2);
  });
});
