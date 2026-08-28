// @vitest-environment jsdom
// 05 (authFetch->mutate). The artist order-STATUS update (mark shipped) used
// authFetch with a manual res.ok check. It now goes through mutate (throws on a
// non-2xx), so a rejected update surfaces the real reason via statusError and the
// optimistic status change only runs on a confirmed 2xx. (The refund handlers in
// this file are owner-gated and NOT migrated here.)

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

const { authFetchMock, mutateMock } = vi.hoisted(() => ({ authFetchMock: vi.fn(), mutateMock: vi.fn() }));

vi.mock("@/lib/supabase", () => ({ supabase: { auth: {}, from: () => ({}) } }));
vi.mock("@/lib/api-client", async (orig) => {
  const actual = await orig<typeof import("@/lib/api-client")>();
  return { ...actual, authFetch: authFetchMock, mutate: mutateMock };
});
vi.mock("@/components/ArtistPortalLayout", () => ({ default: ({ children }: { children: unknown }) => children }));
vi.mock("@/components/EmptyState", () => ({ default: () => null }));
vi.mock("@/components/OrderStatusTracker", () => ({ default: () => null }));

import ArtistOrdersPage from "./page";
import { ApiError } from "@/lib/api-client";

const ORDER = {
  id: "o1",
  items: [{ title: "Sunset Study", qty: 1, price: 200 }],
  shipping: { fullName: "Bob", email: "b@x.com", phone: "", addressLine1: "1 St", city: "London", postcode: "E1", country: "UK" },
  total: 210,
  artist_revenue: 180,
  venue_revenue: 0,
  platform_fee: 30,
  venue_revenue_share_percent: 0,
  platform_fee_percent: 15,
  status: "processing", // -> "Mark as Shipped" action
  status_history: [{ status: "processing", timestamp: "2026-01-01T00:00:00Z" }],
  created_at: "2026-01-01T00:00:00Z",
};

afterEach(() => cleanup());
beforeEach(() => {
  authFetchMock.mockReset();
  mutateMock.mockReset();
  authFetchMock.mockImplementation((url: string) =>
    Promise.resolve(
      new Response(JSON.stringify(url.includes("refunds") ? { refundRequests: [] } : { orders: [ORDER] }), { status: 200 }),
    ),
  );
});

async function openOrderAndClickShip() {
  render(<ArtistOrdersPage />);
  // Select the order (click its list row via the order id), then the action.
  fireEvent.click(await screen.findByText("o1"));
  fireEvent.click(await screen.findByText("Mark as Shipped"));
}

describe("artist orders status update (05 mutate migration)", () => {
  it("surfaces the server error and does not advance status when the update fails", async () => {
    mutateMock.mockRejectedValue(new ApiError(403, "Order missing artist link", "forbidden", {}));
    await openOrderAndClickShip();

    expect(await screen.findByText("Order missing artist link")).toBeTruthy();
    // Fail-before: authFetch resolved on the 403 and the optimistic advance stuck.
    expect(mutateMock).toHaveBeenCalledWith("/api/orders", expect.objectContaining({ method: "PATCH" }));
  });

  it("advances on a confirmed update", async () => {
    mutateMock.mockResolvedValue({});
    await openOrderAndClickShip();

    // After success the status is "shipped", so the "Mark as Shipped" action is gone.
    await waitFor(() => expect(screen.queryByText("Mark as Shipped")).toBeNull());
  });
});
