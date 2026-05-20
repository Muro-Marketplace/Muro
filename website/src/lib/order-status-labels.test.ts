import { describe, expect, it } from "vitest";
import {
  ORDER_STEPS,
  isRefundEligible,
  isTerminalStatus,
  labelForStatus,
} from "./order-status-labels";

describe("order-status-labels", () => {
  it("includes all six progressive states in the order they happen", () => {
    expect(ORDER_STEPS.map((s) => s.key)).toEqual([
      "confirmed",
      "artist_notified",
      "awaiting_dispatch",
      "processing",
      "shipped",
      "delivered",
    ]);
  });

  it("labels each progressive state with human copy", () => {
    expect(labelForStatus("artist_notified")).toBe("Artist notified");
    expect(labelForStatus("awaiting_dispatch")).toBe("Awaiting dispatch");
    expect(labelForStatus("delivered")).toBe("Delivered");
  });

  it("falls back to a sensible label for unknown statuses (never raw machine string)", () => {
    expect(labelForStatus("aliens")).not.toBe("aliens");
    expect(labelForStatus("aliens")).toBe("In progress");
  });

  it("treats cancelled / refunded / disputed / delivered as terminal", () => {
    expect(isTerminalStatus("cancelled")).toBe(true);
    expect(isTerminalStatus("refunded")).toBe(true);
    expect(isTerminalStatus("disputed")).toBe(true);
    expect(isTerminalStatus("delivered")).toBe(true);
    expect(isTerminalStatus("shipped")).toBe(false);
    expect(isTerminalStatus("aliens")).toBe(false);
  });

  it("labels the off-pipeline terminal states with capitalised words", () => {
    expect(labelForStatus("cancelled")).toBe("Cancelled");
    expect(labelForStatus("refunded")).toBe("Refunded");
    expect(labelForStatus("disputed")).toBe("Disputed");
  });
});

describe("isRefundEligible", () => {
  const now = new Date("2026-05-06T12:00:00Z");

  it.each([
    ["confirmed"],
    ["artist_notified"],
    ["awaiting_dispatch"],
    ["processing"],
  ])("allows refund for pre-dispatch state %s", (status) => {
    expect(isRefundEligible({ status }, now)).toBe(true);
  });

  it("blocks refund once the order is shipped (use the dispute flow)", () => {
    expect(isRefundEligible({ status: "shipped" }, now)).toBe(false);
  });

  it("allows refund for a delivered order within 14 days of delivery", () => {
    expect(
      isRefundEligible({ status: "delivered", delivered_at: "2026-05-01T12:00:00Z" }, now),
    ).toBe(true);
  });

  it("blocks refund 14 days after delivery", () => {
    expect(
      isRefundEligible({ status: "delivered", delivered_at: "2026-04-22T11:59:59Z" }, now),
    ).toBe(false);
  });

  it("blocks refund for delivered orders missing delivered_at (defensive — no clock to compare)", () => {
    expect(isRefundEligible({ status: "delivered" }, now)).toBe(false);
    expect(isRefundEligible({ status: "delivered", delivered_at: null }, now)).toBe(false);
  });

  it("blocks refund for terminal off-pipeline states", () => {
    expect(isRefundEligible({ status: "cancelled" }, now)).toBe(false);
    expect(isRefundEligible({ status: "refunded" }, now)).toBe(false);
    expect(isRefundEligible({ status: "disputed" }, now)).toBe(false);
  });

  it("blocks refund for unknown statuses", () => {
    expect(isRefundEligible({ status: "aliens" }, now)).toBe(false);
  });
});
