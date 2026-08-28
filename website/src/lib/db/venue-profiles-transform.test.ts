// Row 23a / migration 103. The "interested in local artists" checkbox.
//
// It shipped on venue-portal/profile long before its column existed, and looked
// like it worked: bound to state, hydrated on load. It did not. The save dropped
// the value (the writable-fields allowlist correctly refuses a column that is
// not there), and this transform hardcoded `interestedInLocalArtists: true` on
// the way back. So a venue could untick the box, save, reload, and see it ticked
// again, with no error anywhere.

import { describe, it, expect } from "vitest";
import { dbVenueToVenue } from "./venue-profiles-transform";

type Row = Parameters<typeof dbVenueToVenue>[0];

function row(over: Partial<Row> = {}): Row {
  return {
    id: "v1",
    user_id: "u1",
    slug: "the-copper-kettle",
    name: "The Copper Kettle",
    type: "cafe",
    location: "Hampton",
    interested_in_free_loan: true,
    interested_in_revenue_share: false,
    interested_in_direct_purchase: false,
    interested_in_collections: false,
    ...over,
  } as Row;
}

describe("interestedInLocalArtists (row 23a)", () => {
  it("reads what the venue actually answered", () => {
    expect(dbVenueToVenue(row({ interested_in_local_artists: true })).interestedInLocalArtists)
      .toBe(true);
    expect(dbVenueToVenue(row({ interested_in_local_artists: false })).interestedInLocalArtists)
      .toBe(false);
  });

  it("no longer hardcodes true, which told every venue they had said yes", () => {
    // THE regression. Before migration 103 this returned `true` for every row,
    // including one that had explicitly unticked the box.
    expect(dbVenueToVenue(row({ interested_in_local_artists: false })).interestedInLocalArtists)
      .not.toBe(true);
  });

  it("reads a venue that has never answered as not stated", () => {
    // NULL is deliberately distinct from false in the column: 9 of 9 live venue
    // rows are in that state, and defaulting them either way would be inventing
    // an answer. For display it reads as unticked.
    expect(dbVenueToVenue(row({ interested_in_local_artists: null })).interestedInLocalArtists)
      .toBe(false);
    expect(dbVenueToVenue(row()).interestedInLocalArtists).toBe(false);
  });
});
