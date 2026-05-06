import { describe, expect, it } from "vitest";
import {
  ORDER_STATUSES,
  canTransition,
  type OrderStatus,
} from "./order-state-machine";

describe("ORDER_STATUSES", () => {
  it("contains the canonical lifecycle plus off-pipeline terminal states", () => {
    expect(ORDER_STATUSES).toEqual([
      "confirmed",
      "artist_notified",
      "awaiting_dispatch",
      "processing",
      "shipped",
      "delivered",
      "cancelled",
      "refunded",
      "disputed",
    ]);
  });
});

describe("canTransition()", () => {
  // Forward path through the linear pipeline.
  it.each([
    ["confirmed", "artist_notified"],
    ["artist_notified", "awaiting_dispatch"],
    ["awaiting_dispatch", "processing"],
    ["processing", "shipped"],
    ["shipped", "delivered"],
  ] as const)("allows %s → %s", (from, to) => {
    expect(canTransition(from, to)).toEqual({ ok: true });
  });

  // Useful skip-ahead: artist_notified can dispatch direct to processing,
  // and awaiting_dispatch can ship directly when the artwork is ready.
  it.each([
    ["artist_notified", "processing"],
    ["awaiting_dispatch", "shipped"],
  ] as const)("allows %s → %s (skip-ahead in early pipeline)", (from, to) => {
    expect(canTransition(from, to)).toEqual({ ok: true });
  });

  // Cancellation: any state up through processing.
  it.each([
    ["confirmed", "cancelled"],
    ["artist_notified", "cancelled"],
    ["awaiting_dispatch", "cancelled"],
    ["processing", "cancelled"],
  ] as const)("allows %s → cancelled", (from, to) => {
    expect(canTransition(from, to)).toEqual({ ok: true });
  });

  // Post-shipment problems: dispute is reachable from shipped/delivered,
  // refund is reachable from delivered (post-arrival) and from disputed.
  it("allows shipped → disputed", () => {
    expect(canTransition("shipped", "disputed")).toEqual({ ok: true });
  });
  it("allows delivered → refunded", () => {
    expect(canTransition("delivered", "refunded")).toEqual({ ok: true });
  });
  it("allows delivered → disputed", () => {
    expect(canTransition("delivered", "disputed")).toEqual({ ok: true });
  });
  it("allows disputed → refunded", () => {
    expect(canTransition("disputed", "refunded")).toEqual({ ok: true });
  });
  it("allows disputed → delivered (dispute resolved in seller's favour)", () => {
    expect(canTransition("disputed", "delivered")).toEqual({ ok: true });
  });

  // Cancel is no longer reachable after shipping — the buyer's remedies
  // are dispute or refund.
  it("blocks shipped → cancelled (use disputed/refunded instead)", () => {
    expect(canTransition("shipped", "cancelled")).toEqual({
      ok: false,
      reason: expect.stringContaining("shipped"),
    });
  });

  // Terminal states: cancelled and refunded are hard stops.
  it("blocks anything out of cancelled (terminal)", () => {
    for (const to of ORDER_STATUSES) {
      const result = canTransition("cancelled", to);
      expect(result.ok).toBe(false);
    }
  });

  it("blocks anything out of refunded (terminal)", () => {
    for (const to of ORDER_STATUSES) {
      const result = canTransition("refunded", to);
      expect(result.ok).toBe(false);
    }
  });

  // Backward / skipping
  it("blocks shipped → processing (backward)", () => {
    expect(canTransition("shipped", "processing")).toEqual({
      ok: false,
      reason: expect.stringContaining("shipped"),
    });
  });

  it("blocks confirmed → delivered (skip past dispatch)", () => {
    expect(canTransition("confirmed", "delivered")).toEqual({
      ok: false,
      reason: expect.any(String),
    });
  });

  it("blocks confirmed → shipped (skip past artist_notified)", () => {
    expect(canTransition("confirmed", "shipped")).toEqual({
      ok: false,
      reason: expect.any(String),
    });
  });

  // Unknown values
  it("rejects unknown status values", () => {
    expect(canTransition("confirmed", "in_orbit" as OrderStatus)).toEqual({
      ok: false,
      reason: expect.any(String),
    });
    expect(canTransition("alien" as OrderStatus, "shipped")).toEqual({
      ok: false,
      reason: expect.any(String),
    });
  });
});
