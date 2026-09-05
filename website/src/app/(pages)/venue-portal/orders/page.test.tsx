// @vitest-environment jsdom
// LA-C036 (launch audit 2026-09-05). The orders request ended in
// .catch(() => {}) and the page rendered "No placement sales yet" whenever the
// list was empty, so a failed request read as a venue with no sales.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

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
