// @vitest-environment jsdom
//
// G2/G28 (WS8 item 9). Artist-initiated refund requests can only be actioned
// by an admin (/api/refunds/process 403s the artist on their own request), and
// until this page existed the queue had no surface at all. These drive the
// list + approve/reject wiring against the real API shapes.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { authFetchMock, mutateMock } = vi.hoisted(() => ({
  authFetchMock: vi.fn(),
  mutateMock: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  authFetch: authFetchMock,
  mutate: mutateMock,
  ApiError: class ApiError extends Error {
    code?: string;
  },
}));
// The layout runs its own whoami gate and auth context; this test is about the
// refunds page, so the shell is inert.
vi.mock("@/components/AdminPortalLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import AdminRefundsPage from "./page";

const ROWS = [
  {
    id: "rr-1",
    order_id: "ord-9",
    status: "pending",
    type: "full",
    amount: 42.5,
    reason: "Arrived damaged",
    requester_type: "artist",
    requester_email: "artist@example.com",
    rejection_reason: null,
    processed_at: null,
    stripe_refund_id: null,
    created_at: "2026-08-01T10:00:00.000Z",
    orders: {
      id: "ord-9",
      buyer_email: "buyer@example.com",
      total: 42.5,
      status: "paid",
      artist_slug: "maya-chen",
      venue_slug: null,
    },
  },
  {
    id: "rr-2",
    order_id: "ord-3",
    status: "approved",
    type: "partial",
    amount: 10,
    reason: "Partial damage",
    requester_type: "customer",
    requester_email: "buyer@example.com",
    rejection_reason: null,
    processed_at: "2026-07-01T10:00:00.000Z",
    stripe_refund_id: "re_1",
    created_at: "2026-07-01T09:00:00.000Z",
    orders: null,
  },
];

function listReply(rows: unknown[] = ROWS) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ refundRequests: rows, userType: "admin" }),
  } as unknown as Response;
}

beforeEach(() => {
  authFetchMock.mockReset();
  mutateMock.mockReset();
  authFetchMock.mockResolvedValue(listReply());
  mutateMock.mockResolvedValue({ success: true });
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("<AdminRefundsPage />", () => {
  it("lists every request from the admin branch of GET /api/refunds", async () => {
    render(<AdminRefundsPage />);
    expect(await screen.findByText("Order ord-9")).toBeTruthy();
    expect(screen.getByText("Order ord-3")).toBeTruthy();
    expect(screen.getByText("Raised by artist")).toBeTruthy();
    expect(authFetchMock).toHaveBeenCalledWith("/api/refunds");
  });

  it("approves through POST /api/refunds/process after an explicit confirm", async () => {
    render(<AdminRefundsPage />);
    fireEvent.click(await screen.findByText("Order ord-9"));
    fireEvent.click(await screen.findByText("Approve and refund £42.50"));

    await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(1));
    const [url, init] = mutateMock.mock.calls[0];
    expect(url).toBe("/api/refunds/process");
    expect(JSON.parse((init as { body: string }).body)).toEqual({
      refundRequestId: "rr-1",
      action: "approve",
    });
    expect(window.confirm).toHaveBeenCalled();
  });

  it("does not touch the money path when the confirm is declined", async () => {
    (window.confirm as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);
    render(<AdminRefundsPage />);
    fireEvent.click(await screen.findByText("Order ord-9"));
    fireEvent.click(await screen.findByText("Approve and refund £42.50"));
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("rejects with the typed reason", async () => {
    render(<AdminRefundsPage />);
    fireEvent.click(await screen.findByText("Order ord-9"));
    fireEvent.change(
      await screen.findByPlaceholderText(/reason for rejecting/i),
      { target: { value: "Outside the returns window" } },
    );
    fireEvent.click(screen.getByText("Reject request"));

    await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(1));
    const [, init] = mutateMock.mock.calls[0];
    expect(JSON.parse((init as { body: string }).body)).toEqual({
      refundRequestId: "rr-1",
      action: "reject",
      reason: "Outside the returns window",
    });
  });

  it("offers no controls on an already-processed request", async () => {
    render(<AdminRefundsPage />);
    fireEvent.click(await screen.findByText("Order ord-3"));
    expect(await screen.findByText(/already been approved/i)).toBeTruthy();
    expect(screen.queryByText(/^Approve and refund/)).toBeNull();
    expect(screen.queryByText("Reject request")).toBeNull();
  });

  it("shows the empty state when there is nothing to review", async () => {
    authFetchMock.mockResolvedValue(listReply([]));
    render(<AdminRefundsPage />);
    expect(await screen.findByText("No refund requests yet.")).toBeTruthy();
  });
});
