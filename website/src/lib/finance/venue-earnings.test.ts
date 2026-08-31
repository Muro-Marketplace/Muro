import { describe, expect, it } from "vitest";
import { venueRevenueEarned } from "./venue-earnings";

const VENUE = "test@testingvenue.com";

describe("venueRevenueEarned", () => {
  it("matches what the Orders page shows for the live account (2.50 + 7.50)", () => {
    // The exact rows behind the £0.00-vs-£10.00 contradiction.
    const orders = [
      { venue_revenue: 2.5, buyer_email: "buyer@x.com", status: "confirmed" },
      { venue_revenue: 7.5, buyer_email: "someone@y.com", status: "confirmed" },
    ];
    expect(venueRevenueEarned(orders, VENUE)).toBe(10);
  });

  it("excludes the venue's own purchases, which the order feed also returns", () => {
    const orders = [
      { venue_revenue: 2.5, buyer_email: "buyer@x.com", status: "confirmed" },
      { venue_revenue: 99, buyer_email: VENUE, status: "confirmed" },
    ];
    expect(venueRevenueEarned(orders, VENUE)).toBe(2.5);
  });

  it("excludes cancelled and refunded orders", () => {
    const orders = [
      { venue_revenue: 2.5, buyer_email: "b@x.com", status: "confirmed" },
      { venue_revenue: 5, buyer_email: "b@x.com", status: "cancelled" },
      { venue_revenue: 5, buyer_email: "b@x.com", status: "refunded" },
    ];
    expect(venueRevenueEarned(orders, VENUE)).toBe(2.5);
  });

  it("treats a missing or unparseable share as zero rather than NaN", () => {
    const orders = [
      { buyer_email: "b@x.com", status: "confirmed" },
      { venue_revenue: null, buyer_email: "b@x.com", status: "confirmed" },
      { venue_revenue: 4, buyer_email: "b@x.com", status: "confirmed" },
    ];
    expect(venueRevenueEarned(orders, VENUE)).toBe(4);
  });

  it("is zero, not an error, with no orders at all", () => {
    expect(venueRevenueEarned([], VENUE)).toBe(0);
  });
});
