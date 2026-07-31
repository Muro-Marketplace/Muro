// @vitest-environment jsdom
// 05 (authFetch->mutate migration). The billing page opens Stripe checkout /
// Connect / billing-portal sessions by POSTing for a redirect URL. Those POSTs
// used authFetch (resolves on a non-2xx); a failed session-create fell through
// to the else/toast. They now go through mutate (throws), so a failure surfaces
// the server error instead of a generic one, and never silently no-ops.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

const { authFetchMock, mutateMock, showToastMock } = vi.hoisted(() => ({
  authFetchMock: vi.fn(),
  mutateMock: vi.fn(),
  showToastMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ supabase: { auth: {}, from: () => ({}) } }));
vi.mock("@/lib/api-client", async (orig) => {
  const actual = await orig<typeof import("@/lib/api-client")>();
  return { ...actual, authFetch: authFetchMock, mutate: mutateMock };
});
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" }, loading: false }) }));
vi.mock("@/context/ToastContext", () => ({ useToast: () => ({ showToast: showToastMock }) }));
vi.mock("@/components/ArtistPortalLayout", () => ({ default: ({ children }: { children: unknown }) => children }));
vi.mock("@/components/Button", () => ({ default: ({ children }: { children: unknown }) => children }));
vi.mock("@/components/PayoutExplainerModal", () => ({ default: () => null }));

import BillingPage from "./page";
import { ApiError } from "@/lib/api-client";

afterEach(() => cleanup());
beforeEach(() => {
  authFetchMock.mockReset();
  mutateMock.mockReset();
  showToastMock.mockReset();
  // The mount loads the subscription (a real plan → the Manage button renders)
  // and the connect status. Fresh Response per call.
  authFetchMock.mockImplementation((url: string) => {
    if (url.includes("stripe-connect")) {
      return Promise.resolve(new Response(JSON.stringify({ status: "none" }), { status: 200 }));
    }
    return Promise.resolve(
      new Response(
        JSON.stringify({ profile: { subscription_plan: "premium", subscription_status: "active" } }),
        { status: 200 },
      ),
    );
  });
});

describe("billing Manage Subscription (05 mutate migration)", () => {
  it("surfaces the server error when opening the billing portal fails", async () => {
    mutateMock.mockRejectedValue(new ApiError(500, "portal unavailable", "server_error", {}));
    render(<BillingPage />);

    const manage = await screen.findByText("Manage Subscription");
    fireEvent.click(manage);

    await waitFor(() =>
      expect(showToastMock).toHaveBeenCalledWith("portal unavailable", { variant: "error" }),
    );
    expect(mutateMock).toHaveBeenCalledWith("/api/subscribe/portal", expect.objectContaining({ method: "POST" }));
  });
});
