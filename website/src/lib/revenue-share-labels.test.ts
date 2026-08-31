import { describe, expect, it } from "vitest";
import {
  VENUE_SHARE_CAPTION,
  VENUE_SHARE_SCOPE,
  artistKeepsLabel,
  artistKeepsPercent,
  venueShareLabel,
  venueShareOnSalesLabel,
  venueSharePercent,
} from "./revenue-share-labels";

describe("revenue-share-labels", () => {
  // The direction is set by lib/payouts/legs.ts:
  //   venueCut = linePence * (revenue_share_percent / 100)
  // Two portals rendered this as "24% to artist", which is the artist's
  // giveaway shown as their earnings.
  it("treats the stored percentage as the venue's share", () => {
    expect(venueSharePercent(24)).toBe(24);
    expect(venueShareLabel(24)).toBe("24% to the venue");
  });

  it("gives the artist the complement, never the raw number", () => {
    expect(artistKeepsPercent(24)).toBe(76);
    expect(artistKeepsLabel(24)).toBe("You keep 76%");
  });

  it("the two shares always add to the whole", () => {
    for (const pct of [0, 1, 24, 50, 76, 99, 100]) {
      expect(venueSharePercent(pct)! + artistKeepsPercent(pct)!).toBe(100);
    }
  });

  it("handles the boundaries without inverting", () => {
    expect(artistKeepsLabel(0)).toBe("You keep 100%");
    expect(venueShareLabel(0)).toBe("0% to the venue");
    expect(artistKeepsLabel(100)).toBe("You keep 0%");
    expect(venueShareLabel(100)).toBe("100% to the venue");
  });

  it("says 'Not set' rather than guessing when there is no share", () => {
    for (const bad of [null, undefined, NaN]) {
      expect(venueShareLabel(bad as never)).toBe("Not set");
      expect(artistKeepsLabel(bad as never)).toBe("Not set");
    }
  });

  it("refuses an out-of-range share instead of rendering nonsense", () => {
    // A negative venue share would otherwise print "You keep 103%".
    expect(venueSharePercent(-3)).toBeNull();
    expect(artistKeepsLabel(-3)).toBe("Not set");
    expect(venueShareLabel(140)).toBe("Not set");
  });

  it("names the party in the caption", () => {
    expect(VENUE_SHARE_CAPTION).toContain("Venue");
    expect(VENUE_SHARE_CAPTION).not.toContain("Artist");
  });
});

// Row 727 settled what the share is earned ON, which every surface called "QR
// sales". A customer who walks into the venue and buys the piece off the wall
// scans nothing, and an offer on a placed work is not a QR sale either. Both
// pay the venue now, so the copy names the wall rather than the QR code.
describe("what the share is earned on", () => {
  it("does not call it a QR sale", () => {
    expect(VENUE_SHARE_CAPTION).not.toMatch(/QR/i);
    expect(venueShareOnSalesLabel(24)).not.toMatch(/QR/i);
  });

  it("names the venue and the scope in one sentence", () => {
    expect(venueShareOnSalesLabel(24)).toBe("24% to the venue on sales from the wall");
  });

  it("says Not set rather than inventing a scope for a missing share", () => {
    expect(venueShareOnSalesLabel(null)).toBe("Not set");
    expect(venueShareOnSalesLabel(undefined)).toBe("Not set");
    expect(venueShareOnSalesLabel(-3)).toBe("Not set");
  });

  it("keeps the caption and the sentence saying the same thing", () => {
    expect(VENUE_SHARE_CAPTION).toContain(VENUE_SHARE_SCOPE);
    expect(venueShareOnSalesLabel(10)).toContain(VENUE_SHARE_SCOPE);
  });
});
