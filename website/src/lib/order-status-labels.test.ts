import { describe, expect, it } from "vitest";
import { ORDER_STEPS, labelForStatus, isTerminalStatus } from "./order-status-labels";

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
