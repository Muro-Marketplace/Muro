// @vitest-environment jsdom
// Tests for refund-history contract fix (findings 2.1, 6.1):
// Verifies the page reads `data.refundRequests` (not `data.requests`) from
// the GET /api/refunds response and renders the pending-refund badge when
// an order is selected and has a pending refund linked to it.

import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor, screen, cleanup } from "@testing-library/react";

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

// authFetch — the page's only network layer.
const authFetchMock = vi.fn();
vi.mock("@/lib/api-client", () => ({
  authFetch: (...args: unknown[]) => authFetchMock(...args),
}));

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
