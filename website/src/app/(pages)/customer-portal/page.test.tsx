// @vitest-environment jsdom
// Tests for refund-history contract fix (findings 2.1, 6.1):
// Verifies the page reads `data.refundRequests` (not `data.requests`) from
// the GET /api/refunds response and renders the pending-refund badge when
// an order is selected and has a pending refund linked to it.
//
// C5/C6 (QA 2026-08-28): the refund request form migrated to mutate(). A
// partial refund with an invalid amount can no longer be submitted, and any
// failure (server non-2xx or network) surfaces to the customer instead of
// being silently swallowed.

import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor, screen, cleanup, fireEvent } from "@testing-library/react";

// ---------------------------------------------------------------------------
// All vi.mock calls are hoisted to the top of the module by Vitest.
// They cannot reference variables defined later in the file.
// We use factory functions that close over module-level mutable state instead.
// ---------------------------------------------------------------------------

// next/navigation — required by useUrlState (useSearchParams) and by the
// Suspense boundary wrapper in the page.
const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => ({ get: () => null, toString: () => "" }),
  usePathname: () => "/customer-portal",
}));

// useUrlState — controls which order is "selected" (detail panel open).
// We mock this so tests can pre-select the test order without needing to
// click a button that would call router.replace (which our mock can't reflect
// back into searchParams).
const urlStateValues: Record<string, string> = {};
vi.mock("@/lib/use-url-state", async () => {
  const { useState } = await import("react");
  return {
    useUrlState: (param: string, defaultValue: string) => {
      const initial = urlStateValues[param] !== undefined ? urlStateValues[param] : defaultValue;
      const [val, setVal] = useState(initial);
      return [val, setVal];
    },
  };
});

// AuthContext — logged-in customer passes PortalGuard.
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u-cust-1", email: "maya@example.com" },
    userType: "customer",
    loading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

// ToastContext — used by PortalGuard.
vi.mock("@/context/ToastContext", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

// Heavy UI components — stub so they don't pull in unrelated deps.
vi.mock("@/components/CustomerPortalLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="layout">{children}</div>
  ),
}));

vi.mock("@/components/EmptyState", () => ({
  default: ({ title }: { title: string }) => (
    <div data-testid="empty-state">{title}</div>
  ),
}));

vi.mock("@/components/OrderStatusTracker", () => ({
  default: ({
    currentStatus,
  }: {
    currentStatus?: string;
    compact?: boolean;
    statusHistory?: unknown[];
  }) => <span data-testid="order-status">{currentStatus}</span>,
}));

// api-client — authFetch for reads, mutate for the refund request (C5/C6).
// Spread the actual module so ApiError/NetworkError stay the real classes.
const { authFetchMock, mutateMock } = vi.hoisted(() => ({
  authFetchMock: vi.fn(),
  mutateMock: vi.fn(),
}));
vi.mock("@/lib/api-client", async (orig) => {
  const actual = await orig<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    authFetch: (...args: unknown[]) => authFetchMock(...args),
    mutate: (...args: unknown[]) => mutateMock(...args),
  };
});

// Supabase — pulled in transitively via authFetch / PortalGuard.
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: "tok" } } }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
}));

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const ORDER_ID = "ord-abc-123";

const now = new Date();
// 1 day ago — still within the 14-day post-delivery refund window.
const deliveredAt = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString();

const mockOrder = {
  id: ORDER_ID,
  order_number: "WP-001",
  items: [{ title: "Abstract Print", qty: 1, price: 50 }],
  subtotal: 50,
  shipping_cost: 5,
  tax_total: 0,
  total: 55,
  currency: "GBP",
  status: "delivered",
  status_history: [{ status: "delivered", timestamp: deliveredAt }],
  tracking_number: null,
  shipping: {
    fullName: "Maya Chen",
    addressLine1: "1 Test St",
    city: "London",
    postcode: "SW1A 1AA",
  },
  created_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  delivered_at: deliveredAt,
  artist_slug: "alice",
  venue_slug: null,
};

const pendingRefund = {
  id: "rr-001",
  order_id: ORDER_ID,
  status: "pending" as const,
  type: "full" as const,
  reason: "Item damaged on arrival",
  created_at: new Date().toISOString(),
};

function jsonResponse(data: unknown, ok = true): Response {
  return { ok, json: async () => data } as unknown as Response;
}

// ---------------------------------------------------------------------------

import CustomerPortalPage from "./page";
import { ApiError } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Pre-select the order so the detail panel renders without needing a click.
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  replaceMock.mockReset();
  urlStateValues["order"] = ORDER_ID;
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CustomerPortalPage — refund-history field contract (2.1, 6.1)", () => {
  it("reads data.refundRequests and renders pending-refund badge", async () => {
    authFetchMock.mockImplementation((url: string) => {
      if (url === "/api/orders") {
        return Promise.resolve(jsonResponse({ orders: [mockOrder] }));
      }
      if (url === "/api/refunds") {
        // Contract: API returns `refundRequests` (not `requests`).
        // After the fix the page reads this field — if it still read `data.requests`
        // the badge would never appear.
        return Promise.resolve(
          jsonResponse({ refundRequests: [pendingRefund], userType: "customer" }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });

    render(<CustomerPortalPage />);

    await waitFor(() => {
      expect(screen.queryByText("Loading orders...")).toBeNull();
    });

    // Order row visible (use getAllByText — Strict Mode may render it twice).
    await waitFor(() => {
      expect(screen.getAllByText("WP-001").length).toBeGreaterThan(0);
    });

    // Detail panel shows the pending-refund badge.
    await waitFor(() => {
      expect(screen.getByText(/Refund requested: pending review/i)).toBeTruthy();
    });
  });

  it("renders in-progress badge when refund status is processing", async () => {
    const processingRefund = { ...pendingRefund, id: "rr-002", status: "processing" as const };

    authFetchMock.mockImplementation((url: string) => {
      if (url === "/api/orders") {
        return Promise.resolve(jsonResponse({ orders: [mockOrder] }));
      }
      if (url === "/api/refunds") {
        return Promise.resolve(
          jsonResponse({ refundRequests: [processingRefund], userType: "customer" }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });

    render(<CustomerPortalPage />);

    await waitFor(() => {
      expect(screen.queryByText("Loading orders...")).toBeNull();
    });

    await waitFor(() => {
      expect(screen.getAllByText("WP-001").length).toBeGreaterThan(0);
    });

    // processing status must also trigger the in-progress badge
    await waitFor(() => {
      expect(screen.getByText(/Refund requested: pending review/i)).toBeTruthy();
    });
  });

  it("does NOT render refund badge when the response uses the old wrong key", async () => {
    authFetchMock.mockImplementation((url: string) => {
      if (url === "/api/orders") {
        return Promise.resolve(jsonResponse({ orders: [mockOrder] }));
      }
      if (url === "/api/refunds") {
        // Simulate old broken shape — wrong field name.
        // The page must not pick this up; the badge must not appear.
        return Promise.resolve(
          jsonResponse({ requests: [pendingRefund], userType: "customer" }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });

    render(<CustomerPortalPage />);

    await waitFor(() => {
      expect(screen.queryByText("Loading orders...")).toBeNull();
    });

    // Use getAllByText to tolerate React Strict Mode double-render
    // (order number appears in both the list row and the detail heading).
    await waitFor(() => {
      expect(screen.getAllByText("WP-001").length).toBeGreaterThan(0);
    });

    // No badge — the wrong key is silently ignored.
    expect(screen.queryByText(/Refund requested: pending review/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// C5/C6 — refund request form: submit gating and failure surfacing
// ---------------------------------------------------------------------------

describe("CustomerPortalPage — refund request form (C5/C6)", () => {
  beforeEach(() => {
    // Eligible delivered order, no existing refund request, so the form is offered.
    authFetchMock.mockImplementation((url: string) => {
      if (url === "/api/orders") {
        return Promise.resolve(jsonResponse({ orders: [mockOrder] }));
      }
      if (url === "/api/refunds") {
        return Promise.resolve(jsonResponse({ refundRequests: [], userType: "customer" }));
      }
      return Promise.resolve(jsonResponse({}));
    });
  });

  function submitButton(): HTMLButtonElement {
    return screen.getByText("Submit Refund Request") as HTMLButtonElement;
  }

  async function openRefundForm() {
    render(<CustomerPortalPage />);
    fireEvent.click(await screen.findByText("Request Refund"));
    fireEvent.change(
      screen.getByPlaceholderText("Please describe why you'd like a refund"),
      { target: { value: "Damaged in transit" } },
    );
  }

  it("C5: disables submit for a partial refund until the amount is valid", async () => {
    await openRefundForm();

    // Full refund with a reason: submittable.
    expect(submitButton().disabled).toBe(false);

    // Partial with a blank amount: fail-before this submitted and died as a
    // silent server 400.
    fireEvent.click(screen.getByLabelText("Partial refund"));
    expect(submitButton().disabled).toBe(true);

    // Zero and over-total are equally invalid.
    const amountInput = screen.getByPlaceholderText("0.00");
    fireEvent.change(amountInput, { target: { value: "0" } });
    expect(submitButton().disabled).toBe(true);
    fireEvent.change(amountInput, { target: { value: "999" } });
    expect(submitButton().disabled).toBe(true);

    // A sane amount unlocks it.
    fireEvent.change(amountInput, { target: { value: "20" } });
    expect(submitButton().disabled).toBe(false);
  });

  it("C6: surfaces a server rejection and keeps the form open", async () => {
    mutateMock.mockRejectedValue(
      new ApiError(409, "A pending refund request already exists for this order.", null, {}),
    );
    await openRefundForm();
    fireEvent.click(submitButton());

    // Fail-before: the non-2xx was swallowed and the customer saw nothing.
    expect(
      await screen.findByText("A pending refund request already exists for this order."),
    ).toBeTruthy();
    expect(screen.getByText("Submit Refund Request")).toBeTruthy();
    expect(screen.queryByText(/Refund request submitted/)).toBeNull();
  });

  it("C6: surfaces a network failure", async () => {
    mutateMock.mockRejectedValue(new Error("connection reset"));
    await openRefundForm();
    fireEvent.click(submitButton());

    expect(
      await screen.findByText("Network error. Please check your connection and try again."),
    ).toBeTruthy();
    expect(screen.queryByText(/Refund request submitted/)).toBeNull();
  });

  it("shows the confirmation only on a confirmed 2xx", async () => {
    mutateMock.mockResolvedValue({ success: true, refundRequest: { ...pendingRefund } });
    await openRefundForm();
    fireEvent.click(submitButton());

    expect(await screen.findByText(/Refund request submitted/)).toBeTruthy();
    expect(mutateMock).toHaveBeenCalledWith(
      "/api/refunds/request",
      expect.objectContaining({ method: "POST" }),
    );
    // Form is gone.
    expect(screen.queryByText("Submit Refund Request")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// C2 — a failed /api/orders fetch must not read as "you have never ordered"
// ---------------------------------------------------------------------------

describe("CustomerPortalPage — failed orders fetch (C2)", () => {
  const ERROR_COPY = "We could not load your orders. Please try again.";

  it("renders an error with a retry instead of the empty state when the fetch throws", async () => {
    authFetchMock.mockImplementation((url: string) => {
      if (url === "/api/orders") return Promise.reject(new Error("offline"));
      if (url === "/api/refunds") return Promise.resolve(jsonResponse({ refundRequests: [] }));
      return Promise.resolve(jsonResponse({}));
    });

    render(<CustomerPortalPage />);

    // Fail-before: the empty catch let loading finish with an empty list, so
    // a customer with a full order history was told they had never ordered.
    expect(await screen.findByText(ERROR_COPY)).toBeTruthy();
    expect(screen.queryByTestId("empty-state")).toBeNull();
    expect(screen.getByText("Try again")).toBeTruthy();
  });

  it("renders the error when the server answers a non-2xx", async () => {
    authFetchMock.mockImplementation((url: string) => {
      if (url === "/api/orders") return Promise.resolve(jsonResponse({ error: "boom" }, false));
      if (url === "/api/refunds") return Promise.resolve(jsonResponse({ refundRequests: [] }));
      return Promise.resolve(jsonResponse({}));
    });

    render(<CustomerPortalPage />);

    expect(await screen.findByText(ERROR_COPY)).toBeTruthy();
    expect(screen.queryByTestId("empty-state")).toBeNull();
  });

  it("recovers when the retry succeeds", async () => {
    let attempt = 0;
    authFetchMock.mockImplementation((url: string) => {
      if (url === "/api/orders") {
        attempt += 1;
        return attempt === 1
          ? Promise.reject(new Error("offline"))
          : Promise.resolve(jsonResponse({ orders: [mockOrder] }));
      }
      if (url === "/api/refunds") return Promise.resolve(jsonResponse({ refundRequests: [] }));
      return Promise.resolve(jsonResponse({}));
    });

    render(<CustomerPortalPage />);
    fireEvent.click(await screen.findByText("Try again"));

    await waitFor(() => {
      expect(screen.getAllByText("WP-001").length).toBeGreaterThan(0);
    });
    expect(screen.queryByText(ERROR_COPY)).toBeNull();
  });

  it("still shows the empty state on a genuine empty success", async () => {
    authFetchMock.mockImplementation((url: string) => {
      if (url === "/api/orders") return Promise.resolve(jsonResponse({ orders: [] }));
      if (url === "/api/refunds") return Promise.resolve(jsonResponse({ refundRequests: [] }));
      return Promise.resolve(jsonResponse({}));
    });

    render(<CustomerPortalPage />);

    expect(await screen.findByTestId("empty-state")).toBeTruthy();
    expect(screen.queryByText(ERROR_COPY)).toBeNull();
  });
});
