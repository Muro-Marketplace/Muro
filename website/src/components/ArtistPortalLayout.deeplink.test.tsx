// @vitest-environment jsdom
//
// LA-C004 (launch audit 2026-09-05). The artist layout's own sign-in bounce sent a
// signed-out visitor to a bare /login, dropping the deep link an email had given
// them (for example /artist-portal/offers?offer=<id>). The login page honours
// ?next=, so the bounce now carries it.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";

const { replace, router } = vi.hoisted(() => {
  const replace = vi.fn();
  return { replace, router: { replace, push: vi.fn() } };
});

// The chrome now reads the route itself (it is rendered once by
// artist-portal/layout.tsx, which passes no activePath). These tests still
// pass activePath explicitly, so usePathname only has to exist.
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/artist-portal" }));
vi.mock("next/link", () => ({ default: ({ children }: { children: unknown }) => children }));
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: null, loading: false, userType: null, displayName: null, signOut: vi.fn() }),
}));
vi.mock("@/lib/api-client", () => ({ authFetch: vi.fn() }));
vi.mock("@/lib/feature-flags", () => ({ isFlagOn: () => false }));

import ArtistPortalLayout from "./ArtistPortalLayout";

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});

describe("ArtistPortalLayout signed-out bounce keeps the deep link (LA-C004)", () => {
  it("sends a signed-out visitor to /login with the current URL as ?next=", async () => {
    window.history.replaceState({}, "", "/artist-portal/offers?offer=off_9");
    render(<ArtistPortalLayout activePath="/artist-portal/offers">portal content</ArtistPortalLayout>);
    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(replace).toHaveBeenCalledWith("/login?next=%2Fartist-portal%2Foffers%3Foffer%3Doff_9");
  });
});
