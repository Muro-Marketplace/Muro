// Commission calculations touch every sale. Getting these wrong either
// over-charges the artist or under-charges the platform, both are bad.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLAN_FEE_PERCENT,
  PLAN_FEE_PERCENT,
  platformFeePercentForArtist,
} from "./platform-fee";

describe("PLAN_FEE_PERCENT", () => {
  it("Core charges 15%", () => expect(PLAN_FEE_PERCENT.core).toBe(15));
  it("Premium charges 8%", () => expect(PLAN_FEE_PERCENT.premium).toBe(8));
  it("Pro charges 5%", () => expect(PLAN_FEE_PERCENT.pro).toBe(5));
  it("default falls to 15% (Core)", () => expect(DEFAULT_PLAN_FEE_PERCENT).toBe(15));
});

describe("platformFeePercentForArtist()", () => {
  it("returns default (15%) for null/undefined profile", () => {
    expect(platformFeePercentForArtist(null)).toBe(15);
    expect(platformFeePercentForArtist(undefined)).toBe(15);
  });

  it("maps each plan to the right percent", () => {
    expect(platformFeePercentForArtist({ subscription_plan: "core" })).toBe(15);
    expect(platformFeePercentForArtist({ subscription_plan: "premium" })).toBe(8);
    expect(platformFeePercentForArtist({ subscription_plan: "pro" })).toBe(5);
  });

  it("unknown plan falls back to 15%", () => {
    expect(platformFeePercentForArtist({ subscription_plan: "platinum" })).toBe(15);
  });

  it("is case-insensitive", () => {
    expect(platformFeePercentForArtist({ subscription_plan: "PREMIUM" })).toBe(8);
    expect(platformFeePercentForArtist({ subscription_plan: "Pro" })).toBe(5);
  });

  describe("free_until window", () => {
    it("returns 0% when free_until is in the future", () => {
      const future = new Date(Date.now() + 86_400_000).toISOString(); // +1 day
      expect(platformFeePercentForArtist({ subscription_plan: "core", free_until: future })).toBe(0);
    });

    it("returns the plan rate when free_until has expired", () => {
      const past = new Date(Date.now() - 86_400_000).toISOString();
      expect(platformFeePercentForArtist({ subscription_plan: "core", free_until: past })).toBe(15);
    });

    it("ignores null free_until", () => {
      expect(platformFeePercentForArtist({ subscription_plan: "pro", free_until: null })).toBe(5);
    });
  });
});
