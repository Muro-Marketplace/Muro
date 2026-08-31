// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/artist-portal",
}));

const useAuthMock = vi.fn();
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

const showToast = vi.fn();
vi.mock("@/context/ToastContext", () => ({
  useToast: () => ({ showToast }),
}));

const { authFetchMock } = vi.hoisted(() => ({
  authFetchMock: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  authFetch: (...args: unknown[]) => authFetchMock(...args),
}));

import PortalGuard from "./PortalGuard";

function mockProfile(profile: Record<string, unknown> | null) {
  authFetchMock.mockImplementation(async () => ({
    json: async () => ({ profile }),
  }));
}

beforeEach(() => {
  replace.mockReset();
  useAuthMock.mockReset();
  showToast.mockReset();
  authFetchMock.mockReset();
  // Default for legacy tests: approved + active = full access.
  mockProfile({ review_status: "approved", subscription_status: "active" });
});

afterEach(() => cleanup());

describe("<PortalGuard /> email confirmation gate", () => {
  it("blocks access for an unverified artist", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "u", email_confirmed_at: null },
      userType: "artist",
      loading: false,
    });
    render(
      <PortalGuard allowedType="artist">
        <span>portal</span>
      </PortalGuard>,
    );
    await waitFor(() => expect(screen.queryByText("portal")).toBeNull());
    expect(screen.getByText(/verify/i)).toBeTruthy();
  });

  it("allows access for a verified artist with active subscription", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "u", email_confirmed_at: "2026-01-01T00:00:00Z" },
      userType: "artist",
      loading: false,
    });
    render(
      <PortalGuard allowedType="artist">
        <span>portal</span>
      </PortalGuard>,
    );
    await waitFor(() => expect(screen.getByText("portal")).toBeTruthy());
  });
});

describe("<PortalGuard /> wrong-role redirect toast", () => {
  it("toasts before redirecting a customer hitting the artist portal", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "u", email_confirmed_at: "2026-01-01T00:00:00Z" },
      userType: "customer",
      loading: false,
    });
    render(
      <PortalGuard allowedType="artist">
        <span>portal</span>
      </PortalGuard>,
    );
    await waitFor(() => expect(showToast).toHaveBeenCalled());
    expect(showToast.mock.calls[0][0]).toMatch(/artist portal/i);
    expect(showToast.mock.calls[0][0]).toMatch(/customer portal/i);
    expect(replace).toHaveBeenCalledWith("/customer-portal");
  });
});

describe("<PortalGuard allowedType=customer />", () => {
  it("blocks an unverified customer with the email-verify gate", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "u", email_confirmed_at: null },
      userType: "customer",
      loading: false,
    });
    render(
      <PortalGuard allowedType="customer">
        <span>portal</span>
      </PortalGuard>,
    );
    await waitFor(() => expect(screen.queryByText("portal")).toBeNull());
    expect(screen.getByText(/verify/i)).toBeTruthy();
  });

  it("allows a verified customer through (no subscription gate)", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "u", email_confirmed_at: "2026-01-01T00:00:00Z" },
      userType: "customer",
      loading: false,
    });
    render(
      <PortalGuard allowedType="customer">
        <span>portal</span>
      </PortalGuard>,
    );
    await waitFor(() => expect(screen.getByText("portal")).toBeTruthy());
  });

  it("redirects an artist landing on the customer portal", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "u", email_confirmed_at: "2026-01-01T00:00:00Z" },
      userType: "artist",
      loading: false,
    });
    render(
      <PortalGuard allowedType="customer">
        <span>portal</span>
      </PortalGuard>,
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/artist-portal"));
    expect(showToast.mock.calls[0][0]).toMatch(/customer portal/i);
  });
});

describe("<PortalGuard /> artist onboarding gating", () => {
  // Bug fix: previously approved-no-sub artists were paywalled out of the
  // entire portal, which blocked the artwork upload flow. The portal now
  // lets them in (and lets them upload work) while a banner nudges them
  // to subscribe before going live on the marketplace. Outbound paid
  // actions still gate themselves.
  it("lets an approved artist into the portal even with subscription_status=none", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "u", email_confirmed_at: "2026-01-01T00:00:00Z" },
      userType: "artist",
      loading: false,
    });
    mockProfile({ review_status: "approved", subscription_status: "none" });
    render(
      <PortalGuard allowedType="artist">
        <span>portal</span>
      </PortalGuard>,
    );
    await waitFor(() => expect(screen.getByText("portal")).toBeTruthy());
    // Soft banner, not a paywall, points the artist at billing without
    // blocking the rest of the page.
    expect(screen.queryByText(/Choose Your Plan/i)).toBeNull();
    expect(screen.getByText(/Pick a plan to go live/i)).toBeTruthy();
  });

  it("lets a pending artist into the portal with the under-review banner", async () => {
    // Bug fix #2: pending artists must be allowed in so they can upload
    // works for admin review before approval. /api/apply now pre-creates
    // the artist_profiles row with review_status='pending'.
    useAuthMock.mockReturnValue({
      user: { id: "u", email_confirmed_at: "2026-01-01T00:00:00Z" },
      userType: "artist",
      loading: false,
    });
    mockProfile({ review_status: "pending", subscription_status: "none" });
    render(
      <PortalGuard allowedType="artist">
        <span>portal</span>
      </PortalGuard>,
    );
    await waitFor(() => expect(screen.getByText("portal")).toBeTruthy());
    expect(screen.getByText(/under review/i)).toBeTruthy();
    // No paywall, no go-live banner, just the under-review notice.
    expect(screen.queryByText(/Choose Your Plan/i)).toBeNull();
    expect(screen.queryByText(/Pick a plan to go live/i)).toBeNull();
  });

  it("keeps the lapsed-subscription paywall for past_due artists", async () => {
    // The point of the paywall now is to surface billing problems for
    // already-subscribed artists, not to gate new artists out of the
    // portal entirely. past_due remains gated.
    useAuthMock.mockReturnValue({
      user: { id: "u", email_confirmed_at: "2026-01-01T00:00:00Z" },
      userType: "artist",
      loading: false,
    });
    mockProfile({ review_status: "approved", subscription_status: "past_due" });
    render(
      <PortalGuard allowedType="artist">
        <span>portal</span>
      </PortalGuard>,
    );
    await waitFor(() => expect(screen.queryByText("portal")).toBeNull());
    expect(screen.getByText(/Choose Your Plan/i)).toBeTruthy();
  });

  it("lets a new user without a profile through to set up", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "u", email_confirmed_at: "2026-01-01T00:00:00Z" },
      userType: "artist",
      loading: false,
    });
    mockProfile(null);
    render(
      <PortalGuard allowedType="artist">
        <span>portal</span>
      </PortalGuard>,
    );
    await waitFor(() => expect(screen.getByText("portal")).toBeTruthy());
  });
});

describe("<PortalGuard /> verify-email recovery actions (C1)", () => {
  // Fail-before: the unverified screen was a dead end — no resend button and
  // no sign-out control, even though POST /api/auth/resend-verification
  // existed. A stuck user had to know to log out and fail a login to reach
  // the resend on the login page.
  const signOut = vi.fn(async () => {});

  function renderUnverified() {
    useAuthMock.mockReturnValue({
      user: { id: "u", email: "new@example.com", email_confirmed_at: null },
      userType: "artist",
      loading: false,
      signOut,
    });
    return render(
      <PortalGuard allowedType="artist">
        <span>portal</span>
      </PortalGuard>,
    );
  }

  beforeEach(() => {
    signOut.mockClear();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resends the verification email to the signed-in address", async () => {
    renderUnverified();
    fireEvent.click(await screen.findByText("Resend verification email"));

    await waitFor(() => expect(screen.getByText(/we have sent a new link/i)).toBeTruthy());
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/auth/resend-verification");
    expect(JSON.parse(init.body as string).email).toBe("new@example.com");
  });

  it("offers a sign-out that ends the session and lands on /login", async () => {
    renderUnverified();
    fireEvent.click(await screen.findByText("Sign out"));

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });
});

// Pass 2 item 3.9 (rows 2571, 2585). Two production accounts own BOTH an artist
// and a venue profile on one auth user. Navigating to /venue-portal redirected
// them straight back, because the guard keys on user_metadata.user_type and
// there is only one of those. venue_profiles.finlay is unreachable as a result.
//
// user_metadata is also the weaker of the two authorities: a user can write
// their own, and cannot write the profile tables. /api/account/roles now
// reports `ownRoles` from profile ownership, and the guard honours it.
describe("<PortalGuard /> lets an account into a portal whose profile it owns (3.9)", () => {
  function withRoles(ownRoles: string[]) {
    authFetchMock.mockImplementation(async (url: string) => ({
      json: async () =>
        url === "/api/account/roles"
          ? { roles: ownRoles, ownRoles }
          : { profile: { review_status: "approved", subscription_status: "active" } },
    }));
  }

  it("does not bounce an artist-metadata account out of the venue portal it owns", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "u", email_confirmed_at: "2026-01-01" },
      userType: "artist",
      loading: false,
    });
    withRoles(["artist", "venue"]);

    render(
      <PortalGuard allowedType="venue">
        <p>venue portal</p>
      </PortalGuard>,
    );

    await waitFor(() => expect(screen.getByText("venue portal")).toBeTruthy());
    expect(replace).not.toHaveBeenCalled();
  });

  it("still bounces an account that owns no such profile", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "u", email_confirmed_at: "2026-01-01" },
      userType: "artist",
      loading: false,
    });
    withRoles(["artist"]);

    render(
      <PortalGuard allowedType="venue">
        <p>venue portal</p>
      </PortalGuard>,
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/artist-portal"));
  });

  it("bounces when the roles lookup fails, rather than opening the portal", async () => {
    // Fail closed: an unreachable roles endpoint must not become a way in.
    useAuthMock.mockReturnValue({
      user: { id: "u", email_confirmed_at: "2026-01-01" },
      userType: "artist",
      loading: false,
    });
    authFetchMock.mockRejectedValue(new Error("offline"));

    render(
      <PortalGuard allowedType="venue">
        <p>venue portal</p>
      </PortalGuard>,
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/artist-portal"));
  });
});
