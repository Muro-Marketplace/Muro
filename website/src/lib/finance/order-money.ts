// Per-order money derivations. Pure, so a client component can import them.
//
// K6 (07 §6). "Platform revenue" had several definitions and nobody owned any of
// them. The per-order artist payout alone had four copies: api/dashboard,
// artist-portal/analytics (whose comment says it "mirrors the dashboard's
// calculation ... so Analytics and Dashboard show the same number", which is the
// tell), artist-portal/page, and artist-portal/orders. Four copies of one rule
// is four chances to drift, and they had already drifted: three guard with
// Number.isFinite and the fourth does not.
//
// UNITS. `orders` stores money in POUNDS as floats (total, artist_revenue,
// venue_revenue, platform_fee). `stripe_transfers.amount_cents` and
// `placement_recurring_billings.monthly_amount_pence` store PENCE as integers.
// Aggregate in pence; convert once, at the boundary, with poundsToPence.
//
// A note on 07 §6.2, which says to pick `orders.amount_cents`, backfill it from
// `total` and add a CHECK: that column does not exist. Bug 15 established it
// exists in no migration and not in the live table, and that selecting it made
// PostgREST reject the whole statement so the admin dashboard reported £0
// against 12 real paid orders. `total` is the only column, so there is one
// branch here, not two, and no migration is needed.

/** Order fields these derivations read. Deliberately minimal. */
export interface OrderMoneyRow {
  total?: number | null;
  artist_revenue?: number | null;
  status?: string | null;
}

/**
 * Statuses that do not count as revenue.
 *
 * This set was the disagreement. `/api/admin/stats` excluded refunded,
 * cancelled, failed and void; `/api/admin/financials` excluded only cancelled,
 * so it counted refunded orders as revenue and the two endpoints reported
 * different numbers under the same word. `stats` is right: money returned to a
 * buyer is not revenue.
 */
export const NON_REVENUE_STATUSES: ReadonlySet<string> = new Set([
  "refunded",
  "partially_refunded",
  "cancelled",
  "failed",
  "void",
]);

/** True when this order's money counts towards revenue. */
export function isRevenueBearing(order: OrderMoneyRow): boolean {
  return !NON_REVENUE_STATUSES.has((order.status ?? "").toLowerCase());
}

/** Pounds (float) to pence (integer). The one place rounding happens. */
export function poundsToPence(pounds: number | null | undefined): number {
  const n = Number(pounds ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** What the buyer paid, in pence, before any split. */
export function orderGrossPence(order: OrderMoneyRow): number {
  return poundsToPence(order.total);
}

/**
 * What the artist earns on this order, in POUNDS, for display.
 *
 * `artist_revenue` is authoritative. Falling back to `total` is for legacy rows
 * that pre-date the column: on those the artist did receive the whole amount,
 * because no split was recorded. A row with `artist_revenue: 0` is NOT legacy —
 * it is a real zero (a fully-discounted or attribution-failed order, see D4) and
 * must stay zero, which is why this tests the type rather than truthiness.
 */
export function artistPayoutPounds(order: OrderMoneyRow): number {
  if (typeof order.artist_revenue === "number" && Number.isFinite(order.artist_revenue)) {
    return order.artist_revenue;
  }
  if (typeof order.total === "number" && Number.isFinite(order.total)) {
    return order.total;
  }
  return 0;
}

/** What the artist earns on this order, in pence, for aggregation. */
export function artistPayoutPence(order: OrderMoneyRow): number {
  return poundsToPence(artistPayoutPounds(order));
}

/** Formatted for display, e.g. "12.50". Never "NaN". */
export function formatPounds(pounds: number): string {
  return (Number.isFinite(pounds) ? pounds : 0).toFixed(2);
}
