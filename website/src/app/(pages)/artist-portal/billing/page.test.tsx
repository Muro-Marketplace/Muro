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

describe("billing referral panel (D9)", () => {
  it("renders the referral code with a Copy button when the profile carries one", async () => {
    // Fail-before: fetchSub never copied referral_code into state, so
    // sub?.referral_code was always undefined and this panel could not
    // render for anyone.
    authFetchMock.mockImplementation((url: string) => {
      if (url.includes("stripe-connect")) {
        return Promise.resolve(new Response(JSON.stringify({ status: "none" }), { status: 200 }));
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            profile: {
              subscription_plan: "premium",
              subscription_status: "active",
              referral_code: "WP-MAYA123",
            },
          }),
          { status: 200 },
        ),
      );
    });

    render(<BillingPage />);

    expect(await screen.findByText("WP-MAYA123")).toBeTruthy();
    expect(screen.getByText("Copy")).toBeTruthy();
    // Renders for a SUBSCRIBED artist too — the panel used to live only in
    // the no-plan branch, hiding it from exactly the artists most likely to
    // refer.
    expect(screen.getByText("Manage Subscription")).toBeTruthy();
  });

  it("renders no referral panel when the profile has no code", async () => {
    render(<BillingPage />);
    await screen.findByText("Manage Subscription");
    expect(screen.queryByText(/your referral code/i)).toBeNull();
  });
});


describe("billing page: the offer and the plan chosen at application", () => {
  function profileResponse(profile: Record<string, unknown>, appliedPlan: string | null) {
    authFetchMock.mockImplementation((url: string) => {
      if (url === "/api/artist-profile") {
        return Promise.resolve(new Response(JSON.stringify({ profile, appliedPlan }), { status: 200 }));
      }
      if (url.startsWith("/api/outreach/allowance")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ applicable: true, limit: 3, used: 0, remaining: 3, unlimited: false, planName: "Core", nextSlotAt: null, windowDays: 7 }),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });
  }

  it("opens on Set up billing with the applied plan preselected and no allowance card", async () => {
    profileResponse({ subscription_status: "none", subscription_plan: null, is_founding_artist: false }, "core");
    render(<BillingPage />);
    await waitFor(() => {
      expect(screen.getByText("Set up billing")).toBeTruthy();
    });
    expect(screen.getByText("Continue with Core")).toBeTruthy();
    expect(screen.getByText("Start with Premium")).toBeTruthy();
    expect(screen.getByText("Your choice at application")).toBeTruthy();
    expect(document.querySelector('[data-applied="true"]')).not.toBeNull();
    expect(screen.queryByText(/Venue approaches this week/i)).toBeNull();
    expect(screen.getByText("Your first month is free")).toBeTruthy();
    expect(screen.getByText(/First month free, then billing starts\. Cancel anytime\./)).toBeTruthy();
  });

  it("states the founding offer for a founding artist", async () => {
    profileResponse({ subscription_status: "none", subscription_plan: null, is_founding_artist: true }, null);
    render(<BillingPage />);
    await waitFor(() => {
      expect(screen.getByText("Choose a plan")).toBeTruthy();
    });
    expect(screen.getByText(/Founding artist offer: 6 months free/)).toBeTruthy();
    expect(screen.getByText(/6 months free, then billing starts\. Cancel anytime\./)).toBeTruthy();
    expect(screen.queryByText("Continue with Core")).toBeNull();
  });

  it("keeps the allowance card once a plan is live", async () => {
    profileResponse({ subscription_status: "trialing", subscription_plan: "core", is_founding_artist: false, trial_end: null }, null);
    render(<BillingPage />);
    await waitFor(() => {
      expect(screen.getByText(/Venue approaches this week/i)).toBeTruthy();
    });
    expect(screen.queryByTestId("trial-offer")).toBeNull();
  });
});
