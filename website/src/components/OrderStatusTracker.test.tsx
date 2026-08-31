// @vitest-environment jsdom
//
// Production pass 2, P4. "the stage tracker vanishes entirely on a refunded
// order, so the buyer loses the delivery history for the order they are
// disputing." An off-pipeline status returned a single pill and nothing else,
// which throws away exactly the record a buyer needs while arguing about the
// order: when it was placed, when it shipped, whether it ever arrived.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import OrderStatusTracker from "./OrderStatusTracker";

afterEach(() => cleanup());

const HISTORY = [
  { status: "confirmed", timestamp: "2026-08-20T10:00:00.000Z" },
  { status: "processing", timestamp: "2026-08-21T10:00:00.000Z" },
  { status: "shipped", timestamp: "2026-08-22T10:00:00.000Z" },
  { status: "delivered", timestamp: "2026-08-25T10:00:00.000Z" },
];

describe("OrderStatusTracker on an off-pipeline order", () => {
  it("still says the order was refunded", () => {
    render(<OrderStatusTracker currentStatus="refunded" statusHistory={HISTORY} />);

    expect(screen.getByText(/Refunded/i)).toBeTruthy();
  });

  it("keeps the delivery history the buyer is arguing about", () => {
    render(<OrderStatusTracker currentStatus="refunded" statusHistory={HISTORY} />);

    expect(screen.getByText("Order placed")).toBeTruthy();
    expect(screen.getByText("Delivered")).toBeTruthy();
  });

  it("keeps it for a disputed order too, which is when it matters most", () => {
    render(<OrderStatusTracker currentStatus="disputed" statusHistory={HISTORY} />);

    expect(screen.getByText(/Disputed/i)).toBeTruthy();
    expect(screen.getByText("Order placed")).toBeTruthy();
  });

  it("shows only the badge when there is no history to show", () => {
    // A cancellation before anything happened has nothing to draw, and an empty
    // row of grey pips would imply steps that were never reached.
    render(<OrderStatusTracker currentStatus="cancelled" statusHistory={[]} />);

    expect(screen.getByText(/Cancelled/i)).toBeTruthy();
    expect(screen.queryByText("Delivered")).toBeNull();
  });

  it("leaves a live order rendering its pipeline as before", () => {
    render(<OrderStatusTracker currentStatus="shipped" statusHistory={HISTORY.slice(0, 3)} />);

    expect(screen.getByText("Order placed")).toBeTruthy();
    expect(screen.getByText("Shipped")).toBeTruthy();
  });
});
