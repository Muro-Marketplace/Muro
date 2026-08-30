// H6. The header's portal dropdown and the portal sidebars used to keep
// separate hand-written copies of these lists, under a comment claiming they
// were at parity. They were not. These tests pin the contract the single
// source now has to keep.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const { isFlagOnMock } = vi.hoisted(() => ({ isFlagOnMock: vi.fn() }));
vi.mock("@/lib/feature-flags", () => ({ isFlagOn: isFlagOnMock }));

import {
  artistPortalNav,
  venuePortalNav,
  customerPortalNav,
  portalNavForRole,
  portalNavLinksForRole,
} from "./portal-nav";

beforeEach(() => {
  isFlagOnMock.mockReset();
  isFlagOnMock.mockReturnValue(false);
});

afterEach(() => vi.restoreAllMocks());

describe("portal nav lists", () => {
  it("keeps the artist entries the header dropdown had dropped", () => {
    const labels = artistPortalNav().primary.map((i) => i.label);
    expect(labels).toContain("Enquiries");
    expect(labels).toContain("My Offers");
    expect(labels).toContain("Social Posts");
  });

  it("keeps My Offers for venues", () => {
    expect(venuePortalNav().primary.map((i) => i.label)).toContain("My Offers");
  });

  it("puts Settings under the divider for artist and venue, and nowhere else", () => {
    expect(artistPortalNav().secondary).toEqual([{ label: "Settings", href: "/artist-portal/settings" }]);
    expect(venuePortalNav().secondary).toEqual([{ label: "Settings", href: "/venue-portal/settings" }]);
    // The customer sidebar draws no divider, so it is one flat list.
    expect(customerPortalNav().secondary).toEqual([]);
    expect(customerPortalNav().primary.at(-1)?.label).toBe("Settings");
  });

  it("shows Blogs only when BLOGS_V1 is on", () => {
    expect(artistPortalNav().primary.map((i) => i.label)).not.toContain("Blogs");
    isFlagOnMock.mockImplementation((flag: string) => flag === "BLOGS_V1");
    expect(artistPortalNav().primary.map((i) => i.label)).toContain("Blogs");
  });

  it("reads the flag on every call rather than pinning it at import time", () => {
    artistPortalNav();
    expect(isFlagOnMock).toHaveBeenCalledWith("BLOGS_V1");
  });

  it("never links a route parked off the navs (artwork requests, showroom)", () => {
    for (const role of ["artist", "venue", "customer"]) {
      const hrefs = portalNavLinksForRole(role).map((i) => i.href);
      expect(hrefs.some((h) => h.includes("artwork-requests"))).toBe(false);
      expect(hrefs.some((h) => h.includes("showroom"))).toBe(false);
    }
  });

  it("has no duplicate hrefs in any role's list", () => {
    for (const role of ["artist", "venue", "customer"]) {
      const hrefs = portalNavLinksForRole(role).map((i) => i.href);
      expect(new Set(hrefs).size).toBe(hrefs.length);
    }
  });

  it("keeps every link inside that role's own portal", () => {
    const base: Record<string, string> = {
      artist: "/artist-portal",
      venue: "/venue-portal",
      customer: "/customer-portal",
    };
    for (const [role, prefix] of Object.entries(base)) {
      for (const item of portalNavLinksForRole(role)) {
        expect(item.href.startsWith(prefix)).toBe(true);
      }
    }
  });
});

describe("portalNavForRole", () => {
  it("routes each known role to its own list", () => {
    expect(portalNavForRole("venue")).toEqual(venuePortalNav());
    expect(portalNavForRole("customer")).toEqual(customerPortalNav());
    expect(portalNavForRole("artist")).toEqual(artistPortalNav());
  });

  it("falls back to the artist portal for unknown or missing roles, matching portalBase", () => {
    expect(portalNavForRole(null)).toEqual(artistPortalNav());
    expect(portalNavForRole(undefined)).toEqual(artistPortalNav());
    expect(portalNavForRole("admin")).toEqual(artistPortalNav());
  });

  it("flattens primary then secondary, so Settings lands last", () => {
    const flat = portalNavLinksForRole("artist");
    const nav = artistPortalNav();
    expect(flat).toEqual([...nav.primary, ...nav.secondary]);
    expect(flat.at(-1)?.label).toBe("Settings");
  });
});
