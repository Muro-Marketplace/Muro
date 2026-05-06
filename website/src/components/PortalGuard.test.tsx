// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

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

vi.mock("@/lib/api-client", () => ({
  authFetch: vi.fn(async () => ({
    json: async () => ({ profile: { review_status: "approved", subscription_status: "active" } }),
  })),
}));

import PortalGuard from "./PortalGuard";

beforeEach(() => {
  replace.mockReset();
  useAuthMock.mockReset();
  showToast.mockReset();
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
