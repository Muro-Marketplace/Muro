import { describe, expect, it } from "vitest";
import {
  PLAN_PRICES,
  PLATFORM_FEE_PERCENT,
  WORKS_CAP,
  ACTIVE_PLACEMENT_CAP,
  activePlacementCapForProfile,
  PAID_LOAN_MIN_GBP,
  FOUNDING_ARTIST_LIMIT,
} from "./pricing";

describe("pricing source of truth", () => {
  it("carries the launch plan prices", () => {
    expect(PLAN_PRICES.core).toEqual({ monthlyGbp: 9.99, annualGbp: 99.99, monthlyPence: 999 });
    expect(PLAN_PRICES.premium).toEqual({ monthlyGbp: 24.99, annualGbp: 249.99, monthlyPence: 2499 });
    expect(PLAN_PRICES.pro).toEqual({ monthlyGbp: 49.99, annualGbp: 499.99, monthlyPence: 4999 });
  });

  it("charges a flat 15% platform fee", () => {
    expect(PLATFORM_FEE_PERCENT).toBe(15);
  });

  it("caps works at 8/20/50", () => {
    expect(WORKS_CAP).toEqual({ core: 8, premium: 20, pro: 50 });
  });

  it("caps concurrent placements at 2/5/unlimited", () => {
    expect(ACTIVE_PLACEMENT_CAP).toEqual({ core: 2, premium: 5, pro: null });
  });

  it("resolves the placement cap from a live subscription only", () => {
    expect(activePlacementCapForProfile({ subscription_plan: "pro", subscription_status: "active" })).toBeNull();
    expect(activePlacementCapForProfile({ subscription_plan: "premium", subscription_status: "trialing" })).toBe(5);
    // A cancelled Pro falls back to the Core cap, mirroring platform-fee.ts D40/E52.
    expect(activePlacementCapForProfile({ subscription_plan: "pro", subscription_status: "canceled" })).toBe(2);
    expect(activePlacementCapForProfile(null)).toBe(2);
    expect(activePlacementCapForProfile({ subscription_plan: "unknown", subscription_status: "active" })).toBe(2);
    // Guard against prototype-chain injection (toString, hasOwnProperty, etc).
    expect(activePlacementCapForProfile({ subscription_plan: "toString", subscription_status: "active" })).toBe(2);
  });

  it("floors paid loans at £15 and caps founding artists at 20", () => {
    expect(PAID_LOAN_MIN_GBP).toBe(15);
    expect(FOUNDING_ARTIST_LIMIT).toBe(20);
  });
});
