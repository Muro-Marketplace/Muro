// The artist's "Performance by Venue" table.
//
// QA 2026-08-30 bugs 13 and 14, which lived in the same block.
//
// 13: sales were counted only when a PLACEMENT's own status was "sold" and its
// `revenue` string was set. Placements stay "active" while the work hangs, and
// `placements.revenue` is NULL because nothing writes it back (bug 24), so
// every venue read "Sales 0 / Revenue £0" even where QR sales had happened.
//
// 14: one completed placement set the whole VENUE's status to "Completed", so
// a venue could read Completed here while the table above it listed its
// placements as active.
//
// Sales come from the orders, the same source the Orders pages agree on, and a
// venue counts as finished only when nothing of the artist's is still up.

export interface PerfPlacement {
  venue: string;
  venueSlug?: string | null;
  status?: string | null;
}

export interface PerfOrder {
  venue_slug?: string | null;
  status?: string | null;
}

export interface VenuePerformanceRow {
  venue: string;
  pieces: number;
  sales: number;
  revenue: number;
  status: "Active" | "Completed";
}

const VOIDED = new Set(["cancelled", "refunded"]);

/**
 * `payoutOf` is injected so this module never re-implements the payout rule;
 * callers pass the one owner, lib/finance/order-money.
 */
export function venuePerformance(
  placements: PerfPlacement[],
  orders: PerfOrder[],
  payoutOf: (o: PerfOrder) => number,
): VenuePerformanceRow[] {
  const salesBySlug: Record<string, { sales: number; revenue: number }> = {};
  for (const o of orders || []) {
    const slug = (o.venue_slug || "").toLowerCase();
    if (!slug) continue;
    if (VOIDED.has((o.status || "").toLowerCase())) continue;
    if (!salesBySlug[slug]) salesBySlug[slug] = { sales: 0, revenue: 0 };
    salesBySlug[slug].sales += 1;
    salesBySlug[slug].revenue += payoutOf(o) || 0;
  }

  const map = new Map<string, VenuePerformanceRow & { anyActive: boolean }>();
  for (const p of placements || []) {
    if (!map.has(p.venue)) {
      const agg = salesBySlug[(p.venueSlug || "").toLowerCase()] || { sales: 0, revenue: 0 };
      map.set(p.venue, {
        venue: p.venue,
        pieces: 0,
        sales: agg.sales,
        revenue: agg.revenue,
        status: "Completed",
        anyActive: false,
      });
    }
    const row = map.get(p.venue)!;
    row.pieces += 1;
    if ((p.status || "").toLowerCase() === "active") row.anyActive = true;
  }

  return [...map.values()].map(({ anyActive, ...row }) => ({
    ...row,
    status: anyActive ? "Active" : row.status,
  }));
}
