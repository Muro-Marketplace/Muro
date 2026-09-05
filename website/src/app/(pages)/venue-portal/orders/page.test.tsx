// @vitest-environment jsdom
// LA-C036 (launch audit 2026-09-05). The orders request ended in
// .catch(() => {}) and the page rendered "No placement sales yet" whenever the
// list was empty, so a failed request read as a venue with no sales.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const { authFetchMock } = vi.hoisted(() => ({ authFetchMock: vi.fn() }));

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("next/link", () => ({ default: ({ children }: { children: unknown }) => children }));
vi.mock("@/components/VenuePortalLayout", () => ({ default: ({ children }: { children: unknown }) => children }));
vi.mock("@/components/EmptyState", () => ({ default: ({ title }: { title: string }) => <div>{title}</div> }));
vi.mock("@/components/OrderStatusTracker", () => ({ default: () => null }));
vi.mock("@/lib/api-client", () => ({ authFetch: authFetchMock }));

import VenueOrdersPage from "./page";

const ORDER = {
  id: "WS-TEST1",
  items: [{ title: "Harbour at Dusk", qty: 1, price: 120 }],
  shipping: { fullName: "A Buyer", addressLine1: "1 Quay", city: "London", postcode: "E1 6AN" },
  total: 120,
  venue_revenue: 12,
  venue_revenue_share_percent: 10,
  venue_slug: "the-gallery",
  status: "paid",
  status_history: [],
  created_at: "2026-08-01T00:00:00.000Z",
};

afterEach(() => cleanup());
beforeEach(() => {
  authFetchMock.mockReset();
});

describe("venue orders when the request fails (LA-C036)", () => {
  it("shows an error with a retry instead of the empty state, and recovers on retry", async () => {
    authFetchMock.mockImplementationOnce(() =>
      Promise.resolve(new Response(JSON.stringify({ error: "boom" }), { status: 500 })),
    );
    render(<VenueOrdersPage />);
    expect(await screen.findByText(/could not load your orders/i)).toBeTruthy();
    expect(screen.queryByText("No placement sales yet")).toBeNull();

    authFetchMock.mockImplementationOnce(() =>
      Promise.resolve(new Response(JSON.stringify({ orders: [ORDER], venueSlug: "the-gallery" }), { status: 200 })),
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(/WS-TEST1/)).toBeTruthy();
  });
});

// The venue portal computed line totals as `item.price * item.qty`, the exact
// pattern lib/order-items.ts exists to replace. The Stripe webhook overwrites
// `orders.items` with an enriched shape carrying `quantity` and
// `lineTotal: {amount}` in pence and NEITHER `qty` NOR `price`
// (api/webhooks/stripe/route.ts L1246), so every enriched row rendered £0.00
// to a venue looking at its own revenue share. The customer portal and the
// tracking page were fixed for this; the venue page was missed.
const ENRICHED_ITEM = {
  size: '16×24" (41×61 cm)',
  image: "https://example.test/a.png",
  title: "Streets of St. Tropez",
  quantity: 1,
  lineTotal: { amount: 6999, currency: "GBP" },
  artistName: "Finlay Coles",
};

const ENRICHED_ORDER = {
  id: "WS-ENRICHED",
  items: [ENRICHED_ITEM],
  shipping: { fullName: "A Buyer", addressLine1: "1 Quay", city: "London", postcode: "E1 6AN" },
  total: 79.94,
  shipping_cost: 9.95,
  venue_revenue: 8,
  venue_revenue_share_percent: 10,
  venue_slug: "the-gallery",
  status: "paid",
  status_history: [],
  created_at: "2026-08-30T00:00:00.000Z",
};

function respondWith(orders: unknown[]) {
  authFetchMock.mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify({ orders, venueSlug: "the-gallery" }), { status: 200 }),
    ),
  );
}

/** Open one order and return just its items-and-breakdown block, so an
 *  assertion cannot accidentally match a stat tile or the revenue panel. */
async function openBreakdown(order: Record<string, unknown>) {
  respondWith([order]);
  render(<VenueOrdersPage />);
  fireEvent.click(await screen.findByRole("button", { name: new RegExp(String(order.id)) }));
  const block = screen.getByText("Items").parentElement;
  if (!block) throw new Error("items block not found");
  return within(block);
}

describe("venue orders line totals across both item shapes", () => {
  it("shows the real money for an enriched order rather than £0.00", async () => {
    const b = await openBreakdown(ENRICHED_ORDER);

    expect(b.getByText("Streets of St. Tropez × 1")).toBeTruthy();
    // The item line and the subtotal row. Both read £0.00 before the fix.
    expect(b.getAllByText("£69.99").length).toBe(2);
    expect(b.queryByText("£0.00")).toBeNull();
  });

  it("still reads the legacy cart shape, quantity applied to the per-unit price", async () => {
    const b = await openBreakdown({
      ...ENRICHED_ORDER,
      id: "WS-CART",
      items: [{ title: "Mt. Fitz Roy", qty: 2, price: 49.99 }],
      total: 109.93,
    });

    expect(b.getByText("Mt. Fitz Roy × 2")).toBeTruthy();
    expect(b.getAllByText("£99.98").length).toBe(2);
  });

  it("does not flatten an enriched quantity to 1", async () => {
    const b = await openBreakdown({
      ...ENRICHED_ORDER,
      id: "WS-QTY",
      items: [{ title: "Three Prints", quantity: 3, lineTotal: { amount: 9000, currency: "GBP" } }],
      total: 99.95,
    });

    expect(b.getByText("Three Prints × 3")).toBeTruthy();
    // lineTotal.amount is the whole line already; multiplying would double-count.
    expect(b.getAllByText("£90.00").length).toBe(2);
  });

  it("sums a mixed-shape order into one honest subtotal", async () => {
    const b = await openBreakdown({
      ...ENRICHED_ORDER,
      id: "WS-MIXED",
      items: [ENRICHED_ITEM, { title: "Mt. Fitz Roy", qty: 2, price: 49.99 }],
      total: 179.92,
    });

    expect(b.getByText("£69.99")).toBeTruthy();
    expect(b.getByText("£99.98")).toBeTruthy();
    expect(b.getByText("£169.97")).toBeTruthy();
  });

  it("derives shipping from a correct subtotal, not from a zeroed one", async () => {
    // With the subtotal reading 0 the residual made the whole order look like
    // postage: "Subtotal £0.00, Shipping £79.94 (derived)".
    // JSON.stringify drops the undefined key, so the payload models a row
    // that never carried the column at all.
    const b = await openBreakdown({
      ...ENRICHED_ORDER,
      id: "WS-DERIVED",
      shipping_cost: undefined,
    });

    expect(b.getByText("Subtotal").parentElement?.textContent).toContain("£69.99");
    expect(b.getByText(/^Shipping/).parentElement?.textContent).toContain("£9.95");
    expect(b.getByText("Total").parentElement?.textContent).toContain("£79.94");
    // The residual is postage, not the entire sale.
    expect(b.getByText(/^Shipping/).parentElement?.textContent).not.toContain("£79.94");
  });

  it("names an untitled line rather than rendering a bare multiplier", async () => {
    const b = await openBreakdown({
      ...ENRICHED_ORDER,
      id: "WS-UNTITLED",
      items: [{ quantity: 1, lineTotal: { amount: 6999, currency: "GBP" } }],
    });

    expect(b.getByText("Artwork × 1")).toBeTruthy();
  });

  it("names an untitled line in the collapsed list summary too", async () => {
    respondWith([
      { ...ENRICHED_ORDER, id: "WS-LIST", items: [{ quantity: 1, lineTotal: { amount: 6999 } }] },
    ]);
    render(<VenueOrdersPage />);

    expect(await screen.findByText(/· Artwork$/)).toBeTruthy();
  });
});
