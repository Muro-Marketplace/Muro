import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { ORDER_STATUS_TO_EVENT, eventForStatus } from "./event-vocabulary";

describe("ORDER_STATUS_TO_EVENT", () => {
  it("locks the spec mapping", () => {
    expect(ORDER_STATUS_TO_EVENT).toEqual({
      confirmed: "order.placed",
      processing: "order.processing",
      shipped: "order.out_for_delivery",
      delivered: "order.delivered",
      cancelled: "order.cancelled",
      refunded: "order.refunded",
      // 09 item 3.7. `disputed` was null here for as long as there was no way
      // to open a dispute, so it never came up. POST /api/disputes exists now
      // and the order's own lifecycle log has to show the case, or the stepper
      // and any payout reconciler cannot see it (mig 105 widened the CHECK).
      disputed: "order.disputed",
      artist_notified: null,
      awaiting_dispatch: null,
    });
  });
});

describe("eventForStatus()", () => {
  it("returns the mapped event for each known status", () => {
    expect(eventForStatus("confirmed")).toBe("order.placed");
    expect(eventForStatus("processing")).toBe("order.processing");
    expect(eventForStatus("shipped")).toBe("order.out_for_delivery");
    expect(eventForStatus("delivered")).toBe("order.delivered");
    expect(eventForStatus("cancelled")).toBe("order.cancelled");
  });

  it("returns null for the genuinely internal statuses (artist_notified, awaiting_dispatch)", () => {
    expect(eventForStatus("artist_notified")).toBeNull();
    expect(eventForStatus("awaiting_dispatch")).toBeNull();
  });

  it("maps disputed to order.disputed", () => {
    expect(eventForStatus("disputed")).toBe("order.disputed");
  });

  it("keeps every mapped event inside the values the live CHECK constraint allows", () => {
    // `order_events.event_type` is CHECK-constrained, so a value added to the
    // map and not to the constraint does not fail a test, it fails an INSERT in
    // production, on a path nobody exercises until a real order reaches that
    // status. Read the constraint out of the migration rather than restating
    // it: a hand-copied list is one more thing that can drift.
    const sql = readFileSync(
      join(__dirname, "../../../supabase/migrations/105_order_events_disputed.sql"),
      "utf8",
    );
    const body = sql.slice(sql.lastIndexOf("CHECK (event_type IN ("));
    const allowed = new Set([...body.matchAll(/'([a-z_.]+)'/g)].map((m) => m[1]));

    expect(allowed.size).toBeGreaterThan(5); // the parse actually found something
    for (const event of Object.values(ORDER_STATUS_TO_EVENT)) {
      if (event) expect([...allowed], event).toContain(event);
    }
  });

  it("maps refunded to order.refunded", () => {
    expect(eventForStatus("refunded")).toBe("order.refunded");
  });

  it("returns null for unknown / nullish input", () => {
    expect(eventForStatus(null)).toBeNull();
    expect(eventForStatus(undefined)).toBeNull();
    expect(eventForStatus("")).toBeNull();
    expect(eventForStatus("not_a_status")).toBeNull();
  });

  it("normalises case and whitespace", () => {
    expect(eventForStatus("  Confirmed  ")).toBe("order.placed");
    expect(eventForStatus("DELIVERED")).toBe("order.delivered");
  });
});
