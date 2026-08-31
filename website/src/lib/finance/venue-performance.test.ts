import { describe, expect, it } from "vitest";
import { venuePerformance } from "./venue-performance";

const payout = (o: { artist_revenue?: number }) => o.artist_revenue ?? 0;

describe("venuePerformance", () => {
  it("counts QR sales against an ACTIVE placement (bug 13)", () => {
    // The live shape: placements stay active, placements.revenue is NULL, and
    // the sales are only visible in the orders.
    const rows = venuePerformance(
      [{ venue: "Testing Venue", venueSlug: "testing-venue", status: "active" }],
      [
        { venue_slug: "testing-venue", status: "confirmed", artist_revenue: 42.5 } as never,
        { venue_slug: "testing-venue", status: "delivered", artist_revenue: 7.5 } as never,
      ],
      payout as never,
    );
    expect(rows[0].sales).toBe(2);
    expect(rows[0].revenue).toBe(50);
  });

  it("keeps a venue Active while any placement is still up (bug 14)", () => {
    const rows = venuePerformance(
      [
        { venue: "Testing Venue", venueSlug: "testing-venue", status: "completed" },
        { venue: "Testing Venue", venueSlug: "testing-venue", status: "active" },
      ],
      [],
      payout as never,
    );
    expect(rows[0].status).toBe("Active");
    expect(rows[0].pieces).toBe(2);
  });

  it("marks a venue Completed only when nothing is still up", () => {
    const rows = venuePerformance(
      [{ venue: "Old Venue", venueSlug: "old-venue", status: "completed" }],
      [],
      payout as never,
    );
    expect(rows[0].status).toBe("Completed");
  });

  it("ignores cancelled and refunded orders", () => {
    const rows = venuePerformance(
      [{ venue: "V", venueSlug: "v", status: "active" }],
      [
        { venue_slug: "v", status: "confirmed", artist_revenue: 10 } as never,
        { venue_slug: "v", status: "refunded", artist_revenue: 99 } as never,
        { venue_slug: "v", status: "cancelled", artist_revenue: 99 } as never,
      ],
      payout as never,
    );
    expect(rows[0].sales).toBe(1);
    expect(rows[0].revenue).toBe(10);
  });

  it("does not attribute an order with no venue to anyone", () => {
    const rows = venuePerformance(
      [{ venue: "V", venueSlug: "v", status: "active" }],
      [{ venue_slug: null, status: "confirmed", artist_revenue: 500 } as never],
      payout as never,
    );
    expect(rows[0].sales).toBe(0);
    expect(rows[0].revenue).toBe(0);
  });
});
