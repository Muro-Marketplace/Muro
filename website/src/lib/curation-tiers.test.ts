import { describe, expect, it } from "vitest";
import {
  CURATION_TIERS,
  PROGRAMME_LADDER,
  PROGRAMME_PIECE_RENT_MIN_GBP,
  PROGRAMME_PIECE_RENT_TARGET_GBP,
  PROGRAMME_RENT_SHARE_MAX,
} from "./curation-tiers";

// Wallplace Programmes plan, Task 1. Supersedes the T10-era version of this
// file: managed_monthly and managed_quarterly never sold a unit (their Stripe
// price IDs were never configured, so the route 503'd), and are retired here
// in favour of one quoted `programme` tier. Every programme deal is quoted by
// an admin, so there is no fixed price ID and nothing to keep in step with a
// Stripe price. The old DB-CHECK/code sync tests this file used to carry
// (T10's actual regression guard) move with the tier CHECK migration to
// Task 2, which is the task that teaches curation_requests.tier about
// `programme`.
describe("programme tier", () => {
  it("is quote-first, from £79.99, on a 12 month term", () => {
    expect(CURATION_TIERS.programme.priceGbp).toBe(79.99);
    expect(CURATION_TIERS.programme.payFirst).toBe(false);
    expect(CURATION_TIERS.programme.termMonths).toBe(12);
  });

  it("retires the fixed-price managed tiers", () => {
    expect("managed_monthly" in CURATION_TIERS).toBe(false);
    expect("managed_quarterly" in CURATION_TIERS).toBe(false);
  });

  it("prices the ladder at about £25 per piece per month", () => {
    expect(PROGRAMME_LADDER).toHaveLength(4);
    for (const rung of PROGRAMME_LADDER) {
      const perPiece = rung.monthlyGbp / rung.pieces;
      expect(perPiece).toBeGreaterThanOrEqual(24);
      expect(perPiece).toBeLessThanOrEqual(27);
    }
  });

  it("keeps the artist rent guardrails", () => {
    expect(PROGRAMME_PIECE_RENT_MIN_GBP).toBe(5);
    expect(PROGRAMME_PIECE_RENT_TARGET_GBP).toBe(10);
    expect(PROGRAMME_RENT_SHARE_MAX).toBe(0.7);
  });

  it("keeps the artist share near 40% at every rung when rent is on target", () => {
    for (const rung of PROGRAMME_LADDER) {
      const share = (rung.pieces * PROGRAMME_PIECE_RENT_TARGET_GBP) / rung.monthlyGbp;
      expect(share).toBeGreaterThan(0.35);
      expect(share).toBeLessThan(PROGRAMME_RENT_SHARE_MAX);
    }
  });
});
