// @vitest-environment jsdom
//
// LA-C004 (launch audit 2026-09-05). The venue layout's own sign-in bounce sent a
// signed-out visitor to a bare /login, dropping the deep link the placements
// email had given them (for example /venue-portal/labels?placement=<id>). The
// login page honours ?next=, so the bounce now carries it.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("@/lib/api-client", () => ({
  mutate: vi.fn(),
  authFetch: async () => ({ json: async () => ({ roles: [], ownRoles: [] }) }),
}));
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: null, loading: false, userType: null, displayName: null, signOut: vi.fn() }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/venue-portal/labels",
  useRouter: () => ({ replace, push: vi.fn() }),
}));
vi.mock("next/link", () => ({ default: ({ children }: { children: unknown }) => children }));

import VenuePortalLayout from "./VenuePortalLayout";

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});

describe("VenuePortalLayout signed-out bounce keeps the deep link (LA-C004)", () => {
  it("sends a signed-out visitor to /login with the current URL as ?next=", async () => {
    window.history.replaceState({}, "", "/venue-portal/labels?placement=pl_1");
    render(<VenuePortalLayout>portal content</VenuePortalLayout>);
    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(replace).toHaveBeenCalledWith("/login?next=%2Fvenue-portal%2Flabels%3Fplacement%3Dpl_1");
  });
});
