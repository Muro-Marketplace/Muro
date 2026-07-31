// @vitest-environment jsdom
// 05 (authFetch->mutate). The Stripe Connect onboard/dashboard handlers used authFetch
// with a manual !data.url check. They now go through mutate (throws on a non-2xx), so a
// rejected call surfaces the error toast and the redirect only runs on a url. These are
// account-setup/access links, NOT money movements, so migrating them is in scope. The
// read GET (connect status) stays on authFetch. Success navigates (window.location), so
// these tests drive only the reject / no-url paths.

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
vi.mock("@/context/ToastContext", () => ({ useToast: () => ({ showToast: showToastMock }) }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/hooks/useCurrentVenue", () => ({ useCurrentVenue: () => ({ venue: null, loading: false }) }));
vi.mock("@/lib/use-notification-prefs", () => ({
  useNotificationPrefs: () => ({ prefs: {}, togglePref: vi.fn(), error: null }),
}));
vi.mock("@/components/VenuePortalLayout", () => ({ default: ({ children }: { children: unknown }) => children }));
vi.mock("@/components/AccountDangerZone", () => ({ default: () => null }));
vi.mock("@/components/PayoutExplainerModal", () => ({ default: () => null }));

import VenueSettingsPage from "./page";

afterEach(() => cleanup());
beforeEach(() => {
  authFetchMock.mockReset();
  mutateMock.mockReset();
  showToastMock.mockReset();
  // Connect status GET (stays on authFetch): no account -> the "Set Up Payouts" button.
  authFetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({}), { status: 200 })));
});

describe("venue settings Stripe Connect onboard (05 mutate)", () => {
  it("toasts an error and does not throw when the onboard request rejects", async () => {
    mutateMock.mockRejectedValue(new Error("offline"));

    render(<VenueSettingsPage />);
    fireEvent.click(await screen.findByText("Set Up Payouts"));

    await waitFor(() =>
      expect(showToastMock).toHaveBeenCalledWith("Something went wrong. Please try again.", { variant: "error" }),
    );
    expect(mutateMock).toHaveBeenCalledWith(
      "/api/stripe-connect/onboard",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("toasts the setup-failed message when the server returns no url", async () => {
    mutateMock.mockResolvedValue({}); // 2xx but no url

    render(<VenueSettingsPage />);
    fireEvent.click(await screen.findByText("Set Up Payouts"));

    await waitFor(() =>
      expect(showToastMock).toHaveBeenCalledWith("Failed to start payout setup", { variant: "error" }),
    );
  });
});
