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

// E14 (WS8 item 3). venue_profiles has no order_notifications_enabled column,
// so the "Order updates" toggle could never persist: every click PATCHed a
// missing column, 500'd and reverted with an error toast. The row is gone for
// venues until the column exists.
describe("venue settings notification rows (E14)", () => {
  it("does not offer the Order updates toggle venues cannot save", async () => {
    render(<VenueSettingsPage />);
    // Anchor on a row that IS there so the absence check is not passing
    // against a blank render.
    expect(await screen.findByText("Message notifications")).toBeTruthy();
    expect(screen.getByText("Wallplace news & digest")).toBeTruthy();
    expect(screen.queryByText("Order updates")).toBeNull();
  });
});

// E10/E12 (WS8 item 3). The Account Details card used to be three
// uncontrolled inputs with no save button, no submit handler and no wiring
// to any API — a venue could not correct their contact name, phone or
// address anywhere in the portal. The card now loads the contact PII from
// the raw venue profile and saves through the venue-profile PUT.
describe("venue settings Account Details contact form (E10/E12)", () => {
  function mockProfileReads() {
    authFetchMock.mockImplementation((url: string) => {
      if (url.includes("venue-profile")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              profile: {
                contact_name: "Priya Shah",
                phone: "020 7123 4567",
                address_line1: "1 High Street",
                address_line2: "",
                city: "London",
                postcode: "E1 6AN",
              },
            }),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });
  }

  it("hydrates the contact fields from the venue profile", async () => {
    mockProfileReads();
    render(<VenueSettingsPage />);

    const nameInput = (await screen.findByPlaceholderText("Who should artists ask for?")) as HTMLInputElement;
    expect(nameInput.value).toBe("Priya Shah");
    expect((screen.getByPlaceholderText("e.g. 020 7123 4567") as HTMLInputElement).value).toBe("020 7123 4567");
    expect((screen.getByPlaceholderText("Street address") as HTMLInputElement).value).toBe("1 High Street");
  });

  it("saves the edited contact fields through the venue-profile PUT", async () => {
    mockProfileReads();
    mutateMock.mockResolvedValue({ success: true });
    render(<VenueSettingsPage />);

    const nameInput = (await screen.findByPlaceholderText("Who should artists ask for?")) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Dev Patel" } });
    fireEvent.click(screen.getByText("Save Details"));

    await waitFor(() => expect(screen.getByText("Saved")).toBeTruthy());
    const putCall = mutateMock.mock.calls.find((c) => c[0] === "/api/venue-profile");
    expect(putCall).toBeTruthy();
    expect((putCall![1] as RequestInit).method).toBe("PUT");
    const body = JSON.parse((putCall![1] as RequestInit).body as string);
    // Fail-before: typing here reached no API at all; the values were
    // silently discarded on navigation.
    expect(body).toEqual({
      contact_name: "Dev Patel",
      phone: "020 7123 4567",
      address_line1: "1 High Street",
      address_line2: null,
      city: "London",
      postcode: "E1 6AN",
    });
  });

  it("surfaces a save failure as an error toast", async () => {
    mockProfileReads();
    mutateMock.mockRejectedValue(new Error("offline"));
    render(<VenueSettingsPage />);

    await screen.findByPlaceholderText("Who should artists ask for?");
    fireEvent.click(screen.getByText("Save Details"));

    await waitFor(() =>
      expect(showToastMock).toHaveBeenCalledWith("Failed to save. Please check your connection.", {
        variant: "error",
      }),
    );
    expect(screen.queryByText("Saved")).toBeNull();
  });
});
