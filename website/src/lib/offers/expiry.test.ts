// F41. `purchase_offers.expires_at` was stored, typed and rendered nowhere, and
// no handler read it. These pin the predicate the PATCH, the checkout and the
// offer cards all share.

import { describe, expect, it } from "vitest";
import {
  OFFER_WINDOW_DAYS,
  defaultOfferExpiry,
  formatOfferDeadline,
  isOfferLapsed,
  isOfferUnpayableAfterExpiry,
  isPastExpiry,
  offerExpiryDate,
} from "./expiry";

const PAST = "2026-01-01T00:00:00.000Z";
const FUTURE = "2099-01-01T00:00:00.000Z";
const NOW = Date.parse("2026-06-01T00:00:00.000Z");

describe("offerExpiryDate", () => {
  it("returns null for an offer with no deadline", () => {
    expect(offerExpiryDate({ expires_at: null })).toBeNull();
    expect(offerExpiryDate({})).toBeNull();
  });

  it("never reads an unparseable stamp as a deadline", () => {
    expect(offerExpiryDate({ expires_at: "not a date" })).toBeNull();
    expect(isPastExpiry({ expires_at: "not a date" }, NOW)).toBe(false);
  });
});

describe("isOfferLapsed", () => {
  it("is true for an open offer whose deadline has passed", () => {
    expect(isOfferLapsed({ expires_at: PAST, status: "pending" }, NOW)).toBe(true);
    expect(isOfferLapsed({ expires_at: PAST, status: "countered" }, NOW)).toBe(true);
  });

  it("is false while the deadline is still ahead", () => {
    expect(isOfferLapsed({ expires_at: FUTURE, status: "pending" }, NOW)).toBe(false);
  });

  it("is false for an open-ended offer", () => {
    expect(isOfferLapsed({ expires_at: null, status: "pending" }, NOW)).toBe(false);
  });

  it("is false once the offer has left the open states", () => {
    // Nothing is gained by calling a paid or declined offer "lapsed"; the
    // deadline governs the window to respond.
    for (const status of ["accepted", "declined", "withdrawn", "paid", "expired"]) {
      expect(isOfferLapsed({ expires_at: PAST, status }, NOW)).toBe(false);
    }
  });
});

describe("isOfferUnpayableAfterExpiry", () => {
  it("blocks an offer that ran past its deadline with no acceptance", () => {
    expect(isOfferUnpayableAfterExpiry({ expires_at: PAST, accepted_at: null }, NOW)).toBe(true);
  });

  it("blocks an offer accepted AFTER its deadline (the legacy rows)", () => {
    expect(
      isOfferUnpayableAfterExpiry(
        { expires_at: PAST, accepted_at: "2026-03-01T00:00:00.000Z" },
        NOW,
      ),
    ).toBe(true);
  });

  it("still lets a deal accepted in time be paid for afterwards", () => {
    expect(
      isOfferUnpayableAfterExpiry(
        { expires_at: PAST, accepted_at: "2025-12-25T00:00:00.000Z" },
        NOW,
      ),
    ).toBe(false);
  });

  it("never blocks an open-ended offer", () => {
    expect(isOfferUnpayableAfterExpiry({ expires_at: null, accepted_at: null }, NOW)).toBe(false);
  });
});

describe("formatOfferDeadline", () => {
  it("renders a readable British date", () => {
    expect(formatOfferDeadline({ expires_at: "2026-05-03T12:00:00.000Z" })).toBe("3 May 2026");
  });

  it("renders nothing when there is no deadline", () => {
    expect(formatOfferDeadline({ expires_at: null })).toBeNull();
  });
});

// Row 2244. Enforcement (F41) landed without anything ever setting a deadline:
// `purchase_offers.expires_at` was NULL on every row in production, so an offer
// made today was still bindingly open next year. The default is what closes
// that, and it belongs beside the predicates that read it.
describe("defaultOfferExpiry", () => {
  const NOW = Date.parse("2026-08-31T12:00:00.000Z");

  it("is OFFER_WINDOW_DAYS from now", () => {
    expect(defaultOfferExpiry(NOW)).toBe(
      new Date(NOW + OFFER_WINDOW_DAYS * 86_400_000).toISOString(),
    );
  });

  it("produces a deadline that has not already lapsed", () => {
    expect(isPastExpiry({ expires_at: defaultOfferExpiry(NOW) }, NOW)).toBe(false);
  });

  it("produces a deadline that DOES lapse once the window passes", () => {
    const at = defaultOfferExpiry(NOW);
    expect(isPastExpiry({ expires_at: at }, NOW + (OFFER_WINDOW_DAYS + 1) * 86_400_000)).toBe(true);
  });
});
