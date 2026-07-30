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

  // D17.1. This block used to key on `free_until`, a column that exists in no
  // migration and not in the live table. These tests passed the whole time,
  // because they exercise the pure function and never touch the schema, while
  // every caller's `.select("... free_until")` was rejected whole by PostgREST and
  // handed this function a null profile. That is why a premium artist was charged
  // 15% instead of 8% on all twelve live orders with a green test suite. Renamed,
  // not duplicated: there is no free_until window to keep testing.
  describe("trial_end window", () => {
    it("returns 0% when trial_end is in the future", () => {
      const future = new Date(Date.now() + 86_400_000).toISOString(); // +1 day
      expect(platformFeePercentForArtist({ subscription_plan: "core", trial_end: future })).toBe(0);
    });

    it("returns the plan rate when trial_end has expired", () => {
      const past = new Date(Date.now() - 86_400_000).toISOString();
      expect(platformFeePercentForArtist({ subscription_plan: "core", trial_end: past })).toBe(15);
    });

    it("ignores null trial_end", () => {
      expect(platformFeePercentForArtist({ subscription_plan: "pro", trial_end: null })).toBe(5);
    });

    it("charges premium 8% on a profile shaped like the live one, which is the bug", () => {
      // fin-coles as prod actually holds them: premium, active, trial_end null.
      // Ten of the twelve live orders are theirs, all recorded at 15%.
      expect(platformFeePercentForArtist({ subscription_plan: "premium", trial_end: null })).toBe(8);
    });
  });
});
