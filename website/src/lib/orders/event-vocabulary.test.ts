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
      artist_notified: null,
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

  it("returns null for the internal artist_notified status", () => {
    expect(eventForStatus("artist_notified")).toBeNull();
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
