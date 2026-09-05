// @vitest-environment jsdom
//
// What the chrome-in-the-layout move has to buy, asserted rather than argued.
//
// The chrome is rendered once by app/(pages)/artist-portal/layout.tsx. App
// Router preserves a layout across sibling navigations and swaps only the page
// element, so the chrome must survive a click with its state intact while still
// following the new route (the sidebar highlight and the tab title).
//
// Before the move each of the 21 pages rendered the chrome itself, so React
// unmounted it on every navigation: the sidebar left the DOM, profileCheck went
// back to "loading", the full-screen loader took the viewport, and it stayed
// there until a fresh GET /api/artist-profile returned.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

const { router, authFetchMock, AUTH, nav } = vi.hoisted(() => ({
  router: { replace: vi.fn(), push: vi.fn() },
  authFetchMock: vi.fn(),
  // One object for the whole file: the profile check lists `user` in its deps,
  // so a fresh user per render would re-run it on every commit.
  AUTH: {
    user: { id: "u-artist", email: "artist@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" },
    loading: false,
    userType: "artist",
    displayName: "Real Artist",
    signOut: vi.fn(),
  },
  // Mutable, so a test can move the route the way the router does.
  nav: { pathname: "/artist-portal/orders" },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => nav.pathname,
}));
// Forward every prop, className included: one test reads the active-row class
// off the sidebar links.
vi.mock("next/link", () => ({
  default: ({ children, ...rest }: { children: React.ReactNode } & Record<string, unknown>) => (
    <a {...rest}>{children}</a>
  ),
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => AUTH }));
vi.mock("@/lib/api-client", () => ({ authFetch: authFetchMock }));
vi.mock("@/lib/feature-flags", () => ({ isFlagOn: () => false }));

import ArtistPortalLayout from "./ArtistPortalLayout";
import { resetArtistProfileSharedForTests } from "@/lib/artist-profile-source";
import { clearCurrentArtistCache } from "@/lib/current-artist-cache";

function OrdersBody() {
  return <>Orders body</>;
}
function PortfolioBody() {
  return <>Portfolio body</>;
}

afterEach(() => {
  cleanup();
  resetArtistProfileSharedForTests();
  clearCurrentArtistCache();
});
beforeEach(() => {
  authFetchMock.mockReset();
  authFetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ profile: { id: "p-1", user_id: "u-artist", profile_image: null }, works: [] }),
  });
  router.replace.mockReset();
  resetArtistProfileSharedForTests();
  clearCurrentArtistCache();
  sessionStorage.clear();
  nav.pathname = "/artist-portal/orders";
});

describe("navigating inside the artist portal", () => {
  it("keeps the chrome mounted: no loader, no second profile request, body swaps at once", async () => {
    const view = render(
      <ArtistPortalLayout>
        <OrdersBody />
      </ArtistPortalLayout>,
    );
    expect(await screen.findByText("Orders body")).toBeTruthy();
    expect(authFetchMock).toHaveBeenCalledTimes(1);

    // The click: same layout instance, new page element, new path.
    nav.pathname = "/artist-portal/portfolio";
    view.rerender(
      <ArtistPortalLayout>
        <PortfolioBody />
      </ArtistPortalLayout>,
    );

    // The whole point: the portal never goes away and nothing is refetched.
    expect(screen.queryByText("Loading your portal...")).toBeNull();
    expect(screen.getByRole("navigation", { name: "Artist portal" })).toBeTruthy();
    expect(screen.getByText("Portfolio body")).toBeTruthy();
    expect(authFetchMock).toHaveBeenCalledTimes(1);
  });

  it("still follows the new route: the tab title tracks the page", async () => {
    const view = render(
      <ArtistPortalLayout>
        <OrdersBody />
      </ArtistPortalLayout>,
    );
    expect(await screen.findByText("Orders body")).toBeTruthy();
    expect(document.title).toBe("Orders | Artist Portal | Wallplace");

    nav.pathname = "/artist-portal/portfolio";
    view.rerender(
      <ArtistPortalLayout>
        <PortfolioBody />
      </ArtistPortalLayout>,
    );

    // A preserved layout that could not see the new path would be stuck on
    // "Orders". usePathname keeps a Client Component layout current.
    expect(document.title).toBe("My Portfolio | Artist Portal | Wallplace");
  });

  it("moves the sidebar highlight to the new route without remounting", async () => {
    // Two ungrouped entries. A grouped one (Orders lives under Venues & Buyers)
    // is hidden once its group collapses on navigating away, so it cannot be
    // read back for the "no longer highlighted" half of this.
    nav.pathname = "/artist-portal/analytics";
    const view = render(
      <ArtistPortalLayout>
        <OrdersBody />
      </ArtistPortalLayout>,
    );
    await screen.findByText("Orders body");

    // Scoped to the sidebar: a grouped page also repeats its siblings in the
    // section tab strip above the page body, so a bare role query is ambiguous.
    const sidebarLink = (href: string) => {
      const sidebar = screen.getByRole("navigation", { name: "Artist portal" });
      const link = within(sidebar).getAllByRole("link").find((a) => a.getAttribute("href") === href);
      if (!link) throw new Error(`no sidebar link for ${href}`);
      return link.className;
    };

    expect(sidebarLink("/artist-portal/analytics")).toContain("text-accent");

    nav.pathname = "/artist-portal/saved";
    view.rerender(
      <ArtistPortalLayout>
        <PortfolioBody />
      </ArtistPortalLayout>,
    );

    expect(sidebarLink("/artist-portal/analytics")).not.toContain("text-accent");
    expect(sidebarLink("/artist-portal/saved")).toContain("text-accent");
  });
});
