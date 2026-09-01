// 04 §9.3. The books must agree with themselves.
//
// Each drift kind here corresponds to a defect this plan documents:
// `revenue_with_no_transfer` is D4's silent zero-payout, `split_does_not_sum` is
// E9's pooled remainder and D16's wrong denominator, and
// `transfer_without_order` is an orphaned leg.

import { describe, it, expect } from "vitest";
import { reconcile, formatReport, type ReconcilableOrder, type TransferRow } from "./reconcile";

/** A clean order: £100 total, £80 artist, £5 venue, £15 fee. */
function order(over: Partial<ReconcilableOrder> = {}): ReconcilableOrder {
  return {
    id: "ord_1",
    status: "delivered",
    total: 100,
    artist_revenue: 80,
    venue_revenue: 5,
    platform_fee: 15,
    ...over,
  };
}

function transfer(over: Partial<TransferRow> = {}): TransferRow {
  return { order_id: "ord_1", amount_cents: 8000, status: "pending", ...over };
}

describe("reconcile", () => {
  it("reports no drift when the books agree", () => {
    const r = reconcile([order()], [transfer()]);
    expect(r.drifts).toEqual([]);
    expect(r.ordersChecked).toBe(1);
    expect(r.grossPence).toBe(10000);
    expect(r.transferredPence).toBe(8000);
  });

  it("catches an order whose parts do not add up to its total", () => {
    // E9's pooled remainder: the legs summed to less than the order.
    const r = reconcile([order({ artist_revenue: 70 })], [transfer({ amount_cents: 7000 })]);

    expect(r.drifts).toHaveLength(1);
    expect(r.drifts[0].kind).toBe("split_does_not_sum");
    expect(r.drifts[0].differencePence).toBe(1000);
  });

  it("catches an over-allocated order", () => {
    const r = reconcile([order({ platform_fee: 25 })], [transfer()]);
    expect(r.drifts[0].kind).toBe("split_does_not_sum");
    expect(r.drifts[0].differencePence).toBe(-1000);
  });

  it("catches money owed to an artist with NO transfer row at all", () => {
    // D4: the artist lookup failed, the order booked, nobody was paid, and
    // nothing anywhere said so.
    const r = reconcile([order()], []);

    expect(r.drifts).toHaveLength(1);
    expect(r.drifts[0].kind).toBe("revenue_with_no_transfer");
    expect(r.drifts[0].differencePence).toBe(8000);
  });

  it("catches a transfer that does not match what the order says is owed", () => {
    const r = reconcile([order()], [transfer({ amount_cents: 7500 })]);
    expect(r.drifts[0].kind).toBe("transfers_do_not_match_artist_revenue");
    expect(r.drifts[0].differencePence).toBe(500);
  });

  it("sums several transfers against one order, for a multi-artist cart", () => {
    const r = reconcile(
      [order()],
      [transfer({ amount_cents: 5000 }), transfer({ amount_cents: 3000 })],
    );
    expect(r.drifts).toEqual([]);
    expect(r.transferredPence).toBe(8000);
  });

  it("catches a transfer naming an order that is not there", () => {
    const r = reconcile([order()], [transfer(), transfer({ order_id: "ord_ghost" })]);

    const orphan = r.drifts.find((d) => d.kind === "transfer_without_order");
    expect(orphan?.orderId).toBe("ord_ghost");
  });

  it("counts a BLOCKED transfer as committed", () => {
    // The charge happened and the money is owed; it just has not moved.
    // Treating blocked as absent would make a stuck payout look reconciled,
    // which is the opposite of the point.
    const r = reconcile([order()], [transfer({ status: "blocked" })]);
    expect(r.drifts).toEqual([]);
  });

  it("ignores a transfer that was never committed", () => {
    const r = reconcile([order()], [transfer({ status: "cancelled" })]);
    expect(r.drifts[0].kind).toBe("revenue_with_no_transfer");
    expect(r.transfersChecked).toBe(0);
  });

  it("skips a refunded order entirely, rather than reporting drift on every refund", () => {
    // The money went back. There is no split left to reconcile.
    const r = reconcile([order({ status: "refunded" })], []);
    expect(r.drifts).toEqual([]);
    expect(r.ordersChecked).toBe(0);
  });

  it("skips cancelled, failed and void orders too", () => {
    const orders = ["cancelled", "failed", "void", "partially_refunded"].map((status, i) =>
      order({ id: `ord_${i}`, status }),
    );
    expect(reconcile(orders, []).drifts).toEqual([]);
  });

  it("tolerates a single penny of float rounding, and no more", () => {
    // Pounds are floats in the DB, so an exact-equality check would cry wolf.
    expect(reconcile([order({ platform_fee: 15.01 })], [transfer()]).drifts).toEqual([]);
    expect(reconcile([order({ platform_fee: 15.03 })], [transfer()]).drifts).toHaveLength(1);
  });

  it("does not demand a transfer for an order where the artist earns nothing", () => {
    const r = reconcile(
      [order({ artist_revenue: 0, venue_revenue: 0, platform_fee: 100 })],
      [],
    );
    expect(r.drifts).toEqual([]);
  });

  it("handles an empty range without dividing by anything", () => {
    const r = reconcile([], []);
    expect(r).toMatchObject({ ordersChecked: 0, grossPence: 0, drifts: [] });
  });

  it("reports every drifting order, not just the first", () => {
    const r = reconcile(
      [order({ id: "a", artist_revenue: 70 }), order({ id: "b", artist_revenue: 60 })],
      [],
    );
    expect(new Set(r.drifts.map((d) => d.orderId))).toEqual(new Set(["a", "b"]));
  });
});

describe("synthetic order ids (placement:, programme-settlement: are outside the orders domain)", () => {
  // Task 7 Step 1 finding: `scripts/audit/reconcile-money.ts` only ever
  // fetches stripe_transfers scoped to `.in("order_id", <real order ids
  // from the orders table>)`, so a `placement:<id>:<invoiceId>` or
  // `programme-settlement:<quarterKey>:<artistUserId>` row is never even
  // pulled into the array this function sees when run for real — that is
  // what currently keeps paid-loan and programme-settlement transfers off
  // the drift report. These tests pin the SAME guarantee directly on the
  // pure function, so it holds even if a future caller widens its query
  // (e.g. an unscoped scan of stripe_transfers), rather than being an
  // accident of one script's SQL shape.
  it("does not flag a placement: transfer as an orphan, and excludes it from transfersChecked/transferredPence", () => {
    const r = reconcile(
      [order()],
      [transfer(), transfer({ order_id: "placement:pl_1:in_1", amount_cents: 5000 })],
    );
    expect(r.drifts).toEqual([]);
    expect(r.transfersChecked).toBe(1);
    expect(r.transferredPence).toBe(8000);
  });

  it("does not flag a programme-settlement: transfer as an orphan, and excludes it from transfersChecked/transferredPence", () => {
    const r = reconcile(
      [order()],
      [transfer(), transfer({ order_id: "programme-settlement:2026Q3:artist_1", amount_cents: 3000 })],
    );
    expect(r.drifts).toEqual([]);
    expect(r.transfersChecked).toBe(1);
    expect(r.transferredPence).toBe(8000);
  });

  it("a programme-settlement: transfer with no orders in the batch at all still reports no drift", () => {
    const r = reconcile(
      [],
      [transfer({ order_id: "programme-settlement:2026Q3:artist_1", amount_cents: 3000 })],
    );
    expect(r.drifts).toEqual([]);
    expect(r.ordersChecked).toBe(0);
    expect(r.transfersChecked).toBe(0);
  });

  it("a BLOCKED programme-settlement: transfer is exempt the same way a committed one is", () => {
    // recordBlockedLeg writes status "blocked", which COMMITTED treats as
    // committed money (line 73) — the exemption must hold for that status
    // too, not just "pending"/"paid".
    const r = reconcile(
      [],
      [transfer({ order_id: "programme-settlement:2026Q3:artist_2", status: "blocked", amount_cents: 1200 })],
    );
    expect(r.drifts).toEqual([]);
  });

  it("still flags a transfer whose order_id merely CONTAINS the word placement, not starting with the exact prefix", () => {
    // Regression guard: the new skip must be a startsWith match on the exact
    // synthetic prefixes, not a loose substring test that could swallow a
    // real orphaned order id that happens to mention "placement".
    const r = reconcile([order()], [transfer(), transfer({ order_id: "ord_placement_typo" })]);
    const orphan = r.drifts.find((d) => d.kind === "transfer_without_order");
    expect(orphan?.orderId).toBe("ord_placement_typo");
  });
});

describe("formatReport", () => {
  it("says plainly when nothing is wrong", () => {
    expect(formatReport(reconcile([order()], [transfer()]))).toContain("No drift");
  });

  it("names each drift and the order it is on", () => {
    const out = formatReport(reconcile([order()], []));
    expect(out).toContain("1 drift(s)");
    expect(out).toContain("revenue_with_no_transfer");
    expect(out).toContain("ord_1");
  });

  it("renders pence as pounds, so nobody reads 8000 as £8,000", () => {
    expect(formatReport(reconcile([order()], [transfer()]))).toContain("£100.00");
  });
});

// ─── WS2.5: blocked rows surface as an actionable queue ───
describe("blocked transfers surface (WS2.5)", () => {
  it("counts blocked rows and pence, and formatReport shouts about them", () => {
    const orders = [order({ id: "o1", total: 100, artist_revenue: 85, platform_fee: 15 })];
    const report = reconcile(orders, [
      { order_id: "o1", amount_cents: 4000, status: "pending" },
      { order_id: "o1", amount_cents: 4500, status: "blocked" },
    ]);
    expect(report.blockedCount).toBe(1);
    expect(report.blockedPence).toBe(4500);
    expect(formatReport(report)).toMatch(/BLOCKED: 1 transfer/);
  });

  it("no blocked rows, no noise", () => {
    const orders = [order({ id: "o1", total: 100, artist_revenue: 85, platform_fee: 15 })];
    const report = reconcile(orders, [{ order_id: "o1", amount_cents: 8500, status: "pending" }]);
    expect(report.blockedCount).toBe(0);
    expect(formatReport(report)).not.toMatch(/BLOCKED/);
  });
});

