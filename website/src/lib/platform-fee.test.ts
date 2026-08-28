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
  it("Premium charges 15% (flat, owner decision 2026-08-28)", () => expect(PLAN_FEE_PERCENT.premium).toBe(15));
  it("Pro charges 15% (flat, owner decision 2026-08-28)", () => expect(PLAN_FEE_PERCENT.pro).toBe(15));
  it("default falls to 15% (Core)", () => expect(DEFAULT_PLAN_FEE_PERCENT).toBe(15));
});

describe("platformFeePercentForArtist()", () => {
  it("returns default (15%) for null/undefined profile", () => {
    expect(platformFeePercentForArtist(null)).toBe(15);
    expect(platformFeePercentForArtist(undefined)).toBe(15);
  });

  // Requires an ACTIVE subscription (D40/E52) to reach the plan map at all;
  // an inactive profile falls to the default further down regardless of plan.
  // These pass subscription_status: "active" so they exercise the mapping.
  it("maps each plan to the right percent for an active subscription", () => {
    expect(platformFeePercentForArtist({ subscription_plan: "core", subscription_status: "active" })).toBe(15);
    expect(platformFeePercentForArtist({ subscription_plan: "premium", subscription_status: "active" })).toBe(15);
    expect(platformFeePercentForArtist({ subscription_plan: "pro", subscription_status: "active" })).toBe(15);
  });

  it("charges the flat 15% on every live plan (owner decision 2026-08-28)", () => {
    for (const plan of ["core", "premium", "pro"]) {
      expect(
        platformFeePercentForArtist({ subscription_plan: plan, subscription_status: "active" }),
      ).toBe(15);
    }
  });

  it("unknown plan falls back to 15% (even when active)", () => {
    expect(platformFeePercentForArtist({ subscription_plan: "platinum", subscription_status: "active" })).toBe(15);
  });

  it("is case-insensitive on the plan", () => {
    expect(platformFeePercentForArtist({ subscription_plan: "PREMIUM", subscription_status: "active" })).toBe(15);
    expect(platformFeePercentForArtist({ subscription_plan: "Pro", subscription_status: "active" })).toBe(15);
  });

  // D40 / E52: the discount is only granted while the subscription is live. A
  // cancelled Pro artist kept 5% for ever because customer.subscription.deleted
  // writes subscription_status='canceled' but never resets subscription_plan.
  describe("subscription_status gate (D40/E52)", () => {
    it("drops a cancelled Pro artist to the 15% default (the bug)", () => {
      expect(platformFeePercentForArtist({ subscription_plan: "pro", subscription_status: "canceled" })).toBe(15);
    });

    it("gives the default to a plan with status 'none' (the maya-chen-demo shape)", () => {
      expect(platformFeePercentForArtist({ subscription_plan: "pro", subscription_status: "none" })).toBe(15);
    });

    it("gives the default when subscription_status is missing entirely", () => {
      // A caller whose .select() omits subscription_status hands us undefined; fail
      // safe to the default rather than granting an unverified discount.
      expect(platformFeePercentForArtist({ subscription_plan: "premium" })).toBe(15);
    });

    it("honours the flat 15% for an active premium artist (fin-coles' live shape)", () => {
      expect(platformFeePercentForArtist({ subscription_plan: "premium", subscription_status: "active", trial_end: null })).toBe(15);
    });

    it("honours a trialing subscription", () => {
      expect(platformFeePercentForArtist({ subscription_plan: "pro", subscription_status: "trialing", trial_end: null })).toBe(15);
    });
  });

  // D17.1. This block used to key on `free_until`, a column that exists in no
  // migration and not in the live table, so every caller's `.select("... free_until")`
  // was rejected whole by PostgREST and this function got a null profile. `trial_end`
  // is the real column, and it only zeroes the fee for an active/trialing artist.
  describe("trial_end window", () => {
    it("returns 0% when trial_end is in the future for a trialing artist", () => {
      const future = new Date(Date.now() + 86_400_000).toISOString(); // +1 day
      expect(platformFeePercentForArtist({ subscription_plan: "core", subscription_status: "trialing", trial_end: future })).toBe(0);
    });

    it("returns the plan rate when trial_end has expired", () => {
      const past = new Date(Date.now() - 86_400_000).toISOString();
      expect(platformFeePercentForArtist({ subscription_plan: "core", subscription_status: "active", trial_end: past })).toBe(15);
    });

    it("ignores null trial_end", () => {
      expect(platformFeePercentForArtist({ subscription_plan: "pro", subscription_status: "active", trial_end: null })).toBe(15);
    });

    it("does not grant the trial 0% to a cancelled artist even if trial_end is future", () => {
      const future = new Date(Date.now() + 86_400_000).toISOString();
      expect(platformFeePercentForArtist({ subscription_plan: "pro", subscription_status: "canceled", trial_end: future })).toBe(15);
    });
  });
});


// Owner decision 10 / D17.2. `free_until` is the platform-owned fee-free window
// (the referral reward: 30 days at 0% when someone you referred first pays).
// Migration 115 made it a real column; this pins the semantics.
describe("platformFeePercentForArtist honours free_until", () => {
  const future = new Date(Date.now() + 10 * 86_400_000).toISOString();
  const past = new Date(Date.now() - 10 * 86_400_000).toISOString();

  it("charges 0% while the window is open, on an active subscription", () => {
    expect(
      platformFeePercentForArtist({
        subscription_plan: "core",
        subscription_status: "active",
        free_until: future,
      }),
    ).toBe(0);
  });

  it("reverts to the plan rate once the window has passed", () => {
    expect(
      platformFeePercentForArtist({
        subscription_plan: "premium",
        subscription_status: "active",
        free_until: past,
      }),
    ).toBe(15);
  });

  it("gives a CANCELLED artist no reward: the status gate comes first", () => {
    // The D40/E52 invariant. A reward must not resurrect discounts for an
    // artist whose subscription has lapsed.
    expect(
      platformFeePercentForArtist({
        subscription_plan: "pro",
        subscription_status: "canceled",
        free_until: future,
      }),
    ).toBe(15);
  });

  it("treats an absent free_until as no window, not as an error", () => {
    // The inverse-phantom case: a caller that forgets to select the column
    // hands undefined here, and the artist pays their normal rate rather than
    // anything surprising. The select-side guard is what catches the forget.
    expect(
      platformFeePercentForArtist({
        subscription_plan: "pro",
        subscription_status: "active",
      }),
    ).toBe(15);
  });
});
