// @vitest-environment jsdom
//
// B26 (WS8 item 7). The Updates timeline read h.at, but the writers (the
// orders PATCH and the Stripe webhook) store { status, timestamp }, and
// /api/orders/track passes status_history through raw — so no date ever
// rendered on the timeline. The page now reads timestamp with at as the
// legacy fallback.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import OrderTrackPage from "./page";

const ORDER = {
  id: "ord-1",
  status: "shipped",
  placedAt: "2026-08-01T09:00:00.000Z",
  artistSlug: "maya-chen",
  total: 120,
  shipping: 10,
  currency: "GBP",
  items: [{ title: "Sand Dunes", qty: 1, price: 110 }],
  history: [
    // What the writers actually store.
    { status: "paid", timestamp: "2026-08-01T09:00:00.000Z" },
    // The legacy shape must keep rendering too.
    { status: "shipped", at: "2026-08-04T09:00:00.000Z", note: "Royal Mail" },
  ],
  tracking: null,
};

function mockFetchWith(order: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ order }),
    })) as unknown as typeof fetch,
  );
}

async function lookUpOrder() {
  render(<OrderTrackPage />);
  fireEvent.change(screen.getByLabelText("Order ID"), { target: { value: "ord-1" } });
  fireEvent.change(screen.getByLabelText("Email used at checkout"), {
    target: { value: "buyer@example.com" },
  });
  fireEvent.click(screen.getByText("Track order"));
  await screen.findByText("Updates");
}

beforeEach(() => {
  mockFetchWith(ORDER);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("order tracking Updates timeline (B26)", () => {
  it("renders the date from the timestamp field the writers store", async () => {
    await lookUpOrder();
    expect(screen.getByText("1 August 2026")).toBeTruthy();
  });

  it("still renders legacy entries that used the at field", async () => {
    await lookUpOrder();
    expect(screen.getByText("4 August 2026")).toBeTruthy();
    expect(screen.getByText("Royal Mail")).toBeTruthy();
  });
});
