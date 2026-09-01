// Does the money add up?
//
// 04 §9.3. "A script that sums `orders.total` against `stripe_transfers` +
// `orders.platform_fee` for a date range and fails on any penny of drift."
//
// Pure functions here, the I/O in `scripts/audit/reconcile-money.ts`, so the
// arithmetic is testable without a database and the script is a thin shell.
//
// WHAT THIS CAN AND CANNOT SEE. It reconciles what the repository RECORDED
// against itself: an order's total should equal the artist legs plus the venue's
// share plus the platform fee, and each order's scheduled transfers should equal
// its artist revenue. It does NOT talk to Stripe, so it cannot tell you that a
// transfer marked `paid` actually settled. It answers "are our own books
// internally consistent", which is the question that catches D4's silent
// zero-payout, E9's pooled remainder and D16's wrong denominator. Reconciling
// against Stripe's balance is a different job and needs a key.

import {
  isRevenueBearing,
  poundsToPence,
  type OrderMoneyRow,
} from "./order-money";

/** An order, with the columns reconciliation needs. */
export interface ReconcilableOrder extends OrderMoneyRow {
  id: string;
  created_at?: string | null;
  venue_revenue?: number | null;
  platform_fee?: number | null;
  shipping_cost?: number | null;
  artist_user_id?: string | null;
}

/** A `stripe_transfers` row. Amounts are already in pence. */
export interface TransferRow {
  order_id: string | null;
  amount_cents?: number | null;
  status?: string | null;
}

export type DriftKind =
  | "split_does_not_sum"
  | "transfers_do_not_match_artist_revenue"
  | "transfer_without_order"
  | "revenue_with_no_transfer";

export interface Drift {
  kind: DriftKind;
  orderId: string;
  /** Pence. Positive means the order says MORE than the parts account for. */
  differencePence: number;
  detail: string;
}

export interface ReconcileReport {
  ordersChecked: number;
  transfersChecked: number;
  grossPence: number;
  artistPence: number;
  venuePence: number;
  platformFeePence: number;
  transferredPence: number;
  drifts: Drift[];
}

/**
 * Transfer statuses that represent money committed to an artist.
 *
 * `blocked` counts: the charge happened and the money is owed, it simply has
 * not moved (open question 4). Excluding it would make a blocked payout look
 * like a reconciled order, which is the opposite of what this is for.
 */
const COMMITTED = new Set(["pending", "paid", "blocked", "failed"]);

/** Rounding slack, in pence. Shipping and fees are floats in the DB. */
const TOLERANCE_PENCE = 1;

/**
 * Order-id prefixes that mark a `stripe_transfers` row as money that was
 * never charged through an `orders` row at all, so it is outside what this
 * function can check by definition (module header: "what this can and
 * cannot see") — there is no `orders.total` to split against and no
 * `artist_revenue` figure to match a transfer to.
 *
 *   placement:<placementId>:<invoiceId>            paid-loan recurring
 *     billing (src/lib/placements/paid-loan-billing.ts, handleInvoicePaid)
 *   programme-settlement:<quarterKey>:<artistUserId>  Wallplace Programmes
 *     quarterly rent settlement (src/lib/curation/programme-rent.ts,
 *     settleProgrammeRent)
 *
 * Task 7 Step 1 finding: as actually run today, BOTH prefixes already avoid
 * tripping `transfer_without_order` — but not because this function knows
 * about them. `scripts/audit/reconcile-money.ts` fetches `stripe_transfers`
 * scoped to `.in("order_id", <real order ids pulled from orders>)`, so a
 * synthetic, non-UUID order_id is never even fetched into the array this
 * function sees; it is invisible before `reconcile()` runs at all. That is a
 * property of one script's query shape, not a guarantee this function made.
 *
 * Recognising the prefixes HERE, explicitly, turns the same exemption into a
 * property of `reconcile()` itself: it now holds even for a future caller
 * that scans stripe_transfers unscoped, and it is directly testable against
 * the pure function (reconcile.test.ts) rather than only provable by reading
 * the shell script's SQL. It changes no current output — these rows were
 * already excluded from every real run — it only makes the contract robust
 * and explicit instead of incidental.
 */
const SYNTHETIC_ORDER_ID_PREFIXES = ["placement:", "programme-settlement:"];

function isSyntheticOrderId(orderId: string | null | undefined): boolean {
  if (!orderId) return false;
  return SYNTHETIC_ORDER_ID_PREFIXES.some((prefix) => orderId.startsWith(prefix));
}

export function reconcile(
  orders: ReconcilableOrder[],
  transfers: TransferRow[],
): ReconcileReport {
  const byOrder = new Map<string, number>();
  let transfersChecked = 0;
  const orphans: TransferRow[] = [];
  const orderIds = new Set(orders.map((o) => o.id));

  for (const t of transfers) {
    if (!COMMITTED.has((t.status ?? "").toLowerCase())) continue;
    // Out of the orders domain entirely — see SYNTHETIC_ORDER_ID_PREFIXES.
    // Skipped before transfersChecked increments, so that count reflects
    // transfers actually checked against an order, not the wider universe
    // of every stripe_transfers row this call happened to be given.
    if (isSyntheticOrderId(t.order_id)) continue;
    transfersChecked++;
    if (!t.order_id || !orderIds.has(t.order_id)) {
      orphans.push(t);
      continue;
    }
    byOrder.set(t.order_id, (byOrder.get(t.order_id) ?? 0) + Number(t.amount_cents ?? 0));
  }

  const report: ReconcileReport = {
    ordersChecked: 0,
    transfersChecked,
    grossPence: 0,
    artistPence: 0,
    venuePence: 0,
    platformFeePence: 0,
    transferredPence: 0,
    drifts: [],
  };

  for (const t of orphans) {
    report.drifts.push({
      kind: "transfer_without_order",
      orderId: t.order_id ?? "(none)",
      differencePence: -Number(t.amount_cents ?? 0),
      detail: `a transfer of ${Number(t.amount_cents ?? 0)}p names an order not in this range`,
    });
  }

  for (const order of orders) {
    // A refunded or cancelled order has no split to reconcile: the money went
    // back. Counting it would report drift on every refund.
    if (!isRevenueBearing(order)) continue;

    report.ordersChecked++;
    const gross = poundsToPence(order.total);
    const artist = poundsToPence(order.artist_revenue);
    const venue = poundsToPence(order.venue_revenue);
    const fee = poundsToPence(order.platform_fee);
    const transferred = byOrder.get(order.id) ?? 0;

    report.grossPence += gross;
    report.artistPence += artist;
    report.venuePence += venue;
    report.platformFeePence += fee;
    report.transferredPence += transferred;

    // 1. The three parts must reconstitute the whole.
    const partsDiff = gross - (artist + venue + fee);
    if (Math.abs(partsDiff) > TOLERANCE_PENCE) {
      report.drifts.push({
        kind: "split_does_not_sum",
        orderId: order.id,
        differencePence: partsDiff,
        detail:
          `total ${gross}p vs artist ${artist}p + venue ${venue}p + fee ${fee}p ` +
          `(${partsDiff > 0 ? "unaccounted for" : "over-allocated"})`,
      });
    }

    // 2. Every penny owed to an artist must have a transfer row. This is the
    //    one that catches D4: an order whose artist lookup failed books with
    //    artist_revenue set and no transfer scheduled, and nothing else notices.
    if (artist > 0) {
      const transferDiff = artist - transferred;
      if (transferred === 0) {
        report.drifts.push({
          kind: "revenue_with_no_transfer",
          orderId: order.id,
          differencePence: artist,
          detail: `${artist}p owed to the artist and no transfer row exists`,
        });
      } else if (Math.abs(transferDiff) > TOLERANCE_PENCE) {
        report.drifts.push({
          kind: "transfers_do_not_match_artist_revenue",
          orderId: order.id,
          differencePence: transferDiff,
          detail: `artist_revenue ${artist}p vs transfers ${transferred}p`,
        });
      }
    }
  }

  return report;
}

/** Human-readable, for a terminal or an alert body. */
export function formatReport(report: ReconcileReport): string {
  const p = (n: number) => `£${(n / 100).toFixed(2)}`;
  const lines = [
    `Orders checked:       ${report.ordersChecked}`,
    `Transfers checked:    ${report.transfersChecked}`,
    `Gross:                ${p(report.grossPence)}`,
    `  to artists:         ${p(report.artistPence)}`,
    `  to venues:          ${p(report.venuePence)}`,
    `  platform fee:       ${p(report.platformFeePence)}`,
    `Transfers scheduled:  ${p(report.transferredPence)}`,
    "",
  ];
  if (report.drifts.length === 0) {
    lines.push("No drift. Every order's split sums, and every penny owed has a transfer row.");
    return lines.join("\n");
  }
  lines.push(`${report.drifts.length} drift(s):`);
  for (const d of report.drifts) {
    lines.push(`  [${d.kind}] ${d.orderId}: ${d.detail}`);
  }
  return lines.join("\n");
}
