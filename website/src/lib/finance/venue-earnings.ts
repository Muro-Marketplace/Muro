// What a venue has actually earned from sales on its walls.
//
// QA 2026-08-30 bug 24: the venue dashboard summed `placements.revenue`, a
// cached column the order pipeline only writes back when an order reaches
// `delivered`. QR sales never do, so it is NULL on every row: the landing
// screen said "Revenue Share Earned £0.00" while the Orders page, one click
// away, said £10.00. The same NULL drove the £0.00 "Earned" column on
// /venue-portal/placements and the zeroes in the artist's Performance by
// Venue table.
//
// This is the one place the figure is derived, per the repo's data invariant:
// a column that mirrors a computed value must be written by a trigger or a
// scheduled job, and `placements.revenue` is neither, so nothing should read
// it as truth.

export interface VenueRevenueOrder {
  venue_revenue?: number | null;
  buyer_email?: string | null;
  status?: string | null;
}

/** Orders that no longer represent money kept. */
const VOIDED = new Set(["cancelled", "refunded"]);

/**
 * Sum the venue's share across sales at this venue.
 *
 * `venueEmail` identifies the venue's OWN purchases, which are excluded: the
 * dashboard's order feed matches on venue_slug OR buyer_email, so a venue that
 * buys art would otherwise count its own spending as revenue share.
 */
export function venueRevenueEarned(
  orders: VenueRevenueOrder[],
  venueEmail: string | null | undefined,
): number {
  const own = (venueEmail || "").toLowerCase();
  return (orders || []).reduce((sum, o) => {
    if (VOIDED.has((o.status || "").toLowerCase())) return sum;
    if (own && (o.buyer_email || "").toLowerCase() === own) return sum;
    const share = Number(o.venue_revenue ?? 0);
    return Number.isFinite(share) ? sum + share : sum;
  }, 0);
}
