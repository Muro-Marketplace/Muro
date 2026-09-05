// @vitest-environment jsdom
//
// LA-C046 (launch audit 2026-09-05). The layout's profile check treated any
// failed /api/artist-profile call, including a 500 or a dropped connection, as
// "no profile" and sent an approved artist to the application form with no
// message. Only a successful answer with no profile means the artist has not
// applied; a failed check now says so and offers a retry.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// One auth object for the whole file: the layout's profile check lists `user`
// in its effect deps, so a mock that built a fresh user per render would re-run
// the check on every commit.
const { replace, router, authFetchMock, AUTH } = vi.hoisted(() => {
  const replace = vi.fn();
  return {
    replace,
    router: { replace, push: vi.fn() },
    authFetchMock: vi.fn(),
    AUTH: {
      user: { id: "u-artist", email: "artist@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" },
      loading: false,
      userType: "artist",
      displayName: "Real Artist",
      signOut: vi.fn(),
    },
  };
});

// The chrome now reads the route itself (it is rendered once by
// artist-portal/layout.tsx, which passes no activePath). These tests still
// pass activePath explicitly, so usePathname only has to exist.
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/artist-portal" }));
vi.mock("next/link", () => ({ default: ({ children }: { children: unknown }) => children }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => AUTH }));
vi.mock("@/lib/api-client", () => ({ authFetch: authFetchMock }));
vi.mock("@/lib/feature-flags", () => ({ isFlagOn: () => false }));

import ArtistPortalLayout from "./ArtistPortalLayout";

afterEach(() => cleanup());
beforeEach(() => {
  replace.mockReset();
  authFetchMock.mockReset();
});

describe("ArtistPortalLayout when the profile check fails (LA-C046)", () => {
  it("does not send the artist to /apply on a network failure; it shows an error with a retry", async () => {
    authFetchMock.mockRejectedValueOnce(new Error("network down"));
    render(<ArtistPortalLayout activePath="/artist-portal">portal content</ArtistPortalLayout>);
    expect(await screen.findByText(/could not load your profile/i)).toBeTruthy();
    expect(replace).not.toHaveBeenCalledWith("/apply");

    authFetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ profile: { id: "p-1" } }) });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("portal content")).toBeTruthy();
  });

  it("treats a 500 the same way", async () => {
    authFetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: "boom" }) });
    render(<ArtistPortalLayout activePath="/artist-portal">portal content</ArtistPortalLayout>);
    expect(await screen.findByText(/could not load your profile/i)).toBeTruthy();
    expect(replace).not.toHaveBeenCalledWith("/apply");
  });

  it("still sends an account with no profile to the application form", async () => {
    authFetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ profile: null }) });
    render(<ArtistPortalLayout activePath="/artist-portal">portal content</ArtistPortalLayout>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/apply"));
  });
});
