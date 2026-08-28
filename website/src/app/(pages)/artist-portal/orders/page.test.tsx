// @vitest-environment jsdom
// 05 (authFetch->mutate). The artist order-STATUS update (mark shipped) used
// authFetch with a manual res.ok check. It now goes through mutate (throws on a
// non-2xx), so a rejected update surfaces the real reason via statusError and the
// optimistic status change only runs on a confirmed 2xx.
//
// D18/D19 (QA 2026-08-28): the refund handlers followed in the launch fix round.
// Approve/Reject surfaces every failure instead of closing silently, and "Issue
// Refund" treats the deliberate 403 from /api/refunds/process (artist-initiated
// refunds are admin-approved) as an honest "sent to Wallplace" confirmation with
// the request shown as pending, rather than pretending the refund happened.

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

const PENDING_REFUND = {
  id: "rr-1",
  order_id: "o1",
  status: "pending" as const,
  type: "full" as const,
  amount: 210,
  reason: "Arrived damaged",
  created_at: "2026-01-02T00:00:00Z",
  requester_type: "buyer",
};

/** Point the read-side mock at a given set of refund requests. */
function mockReads(refundRequests: unknown[]) {
  authFetchMock.mockImplementation((url: string) =>
    Promise.resolve(
      new Response(JSON.stringify(url.includes("refunds") ? { refundRequests } : { orders: [ORDER] }), { status: 200 }),
    ),
  );
}

describe("artist orders refund actions (D18: approve/reject feedback)", () => {
  it("surfaces the server error and keeps the request pending when approve fails", async () => {
    mockReads([PENDING_REFUND]);
    mutateMock.mockRejectedValue(new ApiError(500, "Failed to process refund", null, {}));

    render(<ArtistOrdersPage />);
    fireEvent.click(await screen.findByText("o1"));
    fireEvent.click(await screen.findByText("Approve Refund"));

    // Fail-before: authFetch resolved on the non-2xx and the handler closed silently.
    expect(await screen.findByText("Failed to process refund")).toBeTruthy();
    expect(screen.getByText("Pending")).toBeTruthy();
    expect(screen.queryByText("Approved")).toBeNull();
  });

  it("flips the request to approved on a confirmed 2xx", async () => {
    mockReads([PENDING_REFUND]);
    mutateMock.mockResolvedValue({ success: true, status: "approved" });

    render(<ArtistOrdersPage />);
    fireEvent.click(await screen.findByText("o1"));
    fireEvent.click(await screen.findByText("Approve Refund"));

    expect(await screen.findByText("Approved")).toBeTruthy();
  });
});

describe("artist orders Issue Refund (D19: honest 403 handling)", () => {
  async function openIssueRefundAndSubmit() {
    render(<ArtistOrdersPage />);
    fireEvent.click(await screen.findByText("o1"));
    // First "Issue Refund" opens the form (the open button is replaced by it),
    // so the second matching click is the submit.
    fireEvent.click(await screen.findByText("Issue Refund"));
    fireEvent.change(await screen.findByPlaceholderText("Reason for issuing this refund"), {
      target: { value: "Buyer unhappy with framing" },
    });
    fireEvent.click(screen.getByText("Issue Refund"));
  }

  it("shows a sent-to-Wallplace confirmation on the deliberate 403 and leaves the request pending", async () => {
    mockReads([]);
    mutateMock.mockImplementation((url: string) => {
      if (url.includes("/request")) {
        return Promise.resolve({ success: true, refundRequest: PENDING_REFUND });
      }
      // The money boundary: artists may not approve their own refund request.
      return Promise.reject(new ApiError(403, "Artist-initiated refunds require admin approval", null, {}));
    });

    await openIssueRefundAndSubmit();

    // Fail-before: the UI closed silently as if the money had moved.
    expect(await screen.findByText(/sent to Wallplace for approval/)).toBeTruthy();
    expect(screen.getByText("Pending")).toBeTruthy();
    expect(screen.queryByText("Approved")).toBeNull();
  });

  it("surfaces a request-creation failure and keeps the form open for a retry", async () => {
    mockReads([]);
    mutateMock.mockRejectedValue(
      new ApiError(409, "A pending refund request already exists for this order.", null, {}),
    );

    await openIssueRefundAndSubmit();

    expect(await screen.findByText("A pending refund request already exists for this order.")).toBeTruthy();
    // Form still open: nothing was created, so the artist can correct and retry.
    expect(screen.getByPlaceholderText("Reason for issuing this refund")).toBeTruthy();
    expect(screen.queryByText(/sent to Wallplace for approval/)).toBeNull();
  });
});

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
