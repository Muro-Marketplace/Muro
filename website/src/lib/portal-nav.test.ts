// H6. The header's portal dropdown and the portal sidebars used to keep
// separate hand-written copies of these lists, under a comment claiming they
// were at parity. They were not. These tests pin the contract the single
// source now has to keep.
//
// The artist sidebar is grouped (My Portfolio, Venues & Buyers, Social). The
// flat list the header reads is that sidebar with each group expanded in
// place, and the helpers below tell the layout which group and which tabs a
// path belongs to. The venue and customer navs stay flat.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const { isFlagOnMock } = vi.hoisted(() => ({ isFlagOnMock: vi.fn() }));
vi.mock("@/lib/feature-flags", () => ({ isFlagOn: isFlagOnMock }));

import {
  artistPortalNav,
  venuePortalNav,
  customerPortalNav,
  portalNavForRole,
  portalNavLinksForRole,
  flattenPortalNav,
  activeGroupFor,
  sectionTabsFor,
  navPageFor,
  navItemOwnsPath,
  navGroupKey,
  cleanNavPath,
  type PortalNav,
} from "./portal-nav";

const blogsOn = () => isFlagOnMock.mockImplementation((flag: string) => flag === "BLOGS_V1");

function artistGroup(label: string) {
  const found = artistPortalNav().primary.find((i) => i.label === label);
  if (!found?.children) throw new Error(`no artist group "${label}"`);
  return found;
}

function labelsOf(items: Array<{ label: string }>) {
  return items.map((i) => i.label);
}

beforeEach(() => {
  isFlagOnMock.mockReset();
  isFlagOnMock.mockReturnValue(false);
});

afterEach(() => vi.restoreAllMocks());

describe("artist sidebar groups", () => {
  it("orders the sidebar the way the owner asked", () => {
    expect(labelsOf(artistPortalNav().primary)).toEqual([
      "Dashboard",
      "Edit Profile",
      "My Portfolio",
      "Venues & Buyers",
      "Social",
      "Saved",
      "QR Labels",
      "Analytics",
      "Billing",
    ]);
  });

  it("puts Works and Collections under My Portfolio, Works first", () => {
    expect(artistGroup("My Portfolio").children).toEqual([
      { label: "Works", flatLabel: "My Portfolio", href: "/artist-portal/portfolio" },
      { label: "Collections", href: "/artist-portal/collections" },
    ]);
  });

  it("puts every venue and buyer interaction under Venues & Buyers, in order", () => {
    const children = artistGroup("Venues & Buyers").children ?? [];
    expect(labelsOf(children)).toEqual(["Messages", "Enquiries", "Placements", "Offers", "Orders"]);
    expect(children.map((c) => c.href)).toEqual([
      "/artist-portal/messages",
      "/artist-portal/enquiries",
      "/artist-portal/placements",
      "/artist-portal/offers",
      "/artist-portal/orders",
    ]);
    expect(children.find((c) => c.label === "Offers")?.flatLabel).toBe("My Offers");
  });

  it("puts Posts under Social, and Blogs only when BLOGS_V1 is on", () => {
    expect(artistGroup("Social").children).toEqual([
      { label: "Posts", flatLabel: "Social Posts", href: "/artist-portal/posts" },
    ]);
    blogsOn();
    expect(labelsOf(artistGroup("Social").children ?? [])).toEqual(["Posts", "Blogs"]);
    expect(artistGroup("Social").children?.[1]?.href).toBe("/artist-portal/blogs");
  });

  it("gives each group its first child's href, so the label lands on a page", () => {
    expect(artistGroup("My Portfolio").href).toBe("/artist-portal/portfolio");
    expect(artistGroup("Venues & Buyers").href).toBe("/artist-portal/messages");
    expect(artistGroup("Social").href).toBe("/artist-portal/posts");
  });

  it("leaves the standalone pages ungrouped and Settings under the divider", () => {
    const standalone = artistPortalNav().primary.filter((i) => !i.children);
    expect(labelsOf(standalone)).toEqual(["Dashboard", "Edit Profile", "Saved", "QR Labels", "Analytics", "Billing"]);
    expect(artistPortalNav().secondary).toEqual([{ label: "Settings", href: "/artist-portal/settings" }]);
  });

  it("changes no routes: every page the flat sidebar had is still linked", () => {
    blogsOn();
    const hrefs = portalNavLinksForRole("artist").map((i) => i.href);
    for (const page of [
      "",
      "/profile",
      "/portfolio",
      "/messages",
      "/enquiries",
      "/placements",
      "/offers",
      "/collections",
      "/saved",
      "/orders",
      "/labels",
      "/posts",
      "/blogs",
      "/analytics",
      "/billing",
      "/settings",
    ]) {
      expect(hrefs).toContain(`/artist-portal${page}`);
    }
    expect(hrefs).toHaveLength(16);
  });

  it("keeps the venue and customer navs flat and unchanged", () => {
    for (const nav of [venuePortalNav(), customerPortalNav()]) {
      for (const item of [...nav.primary, ...nav.secondary]) {
        expect(item.children).toBeUndefined();
        expect(item.flatLabel).toBeUndefined();
      }
      expect(flattenPortalNav(nav)).toEqual([...nav.primary, ...nav.secondary]);
    }
    expect(venuePortalNav().primary.map((i) => i.label)).toContain("My Offers");
    expect(venuePortalNav().secondary).toEqual([{ label: "Settings", href: "/venue-portal/settings" }]);
    // The customer sidebar draws no divider, so it is one flat list.
    expect(customerPortalNav().secondary).toEqual([]);
    expect(customerPortalNav().primary.at(-1)?.label).toBe("Settings");
  });
});

describe("flat list for the header", () => {
  it("expands each group in place, under labels that read on their own", () => {
    expect(labelsOf(portalNavLinksForRole("artist"))).toEqual([
      "Dashboard",
      "Edit Profile",
      "My Portfolio",
      "Collections",
      "Messages",
      "Enquiries",
      "Placements",
      "My Offers",
      "Orders",
      "Social Posts",
      "Saved",
      "QR Labels",
      "Analytics",
      "Billing",
      "Settings",
    ]);
  });

  it("slots Blogs after Social Posts when BLOGS_V1 is on", () => {
    blogsOn();
    const labels = labelsOf(portalNavLinksForRole("artist"));
    expect(labels.indexOf("Blogs")).toBe(labels.indexOf("Social Posts") + 1);
  });

  it("carries nothing but label and href, so the header can compare it to the DOM", () => {
    blogsOn();
    for (const role of ["artist", "venue", "customer"]) {
      for (const item of portalNavLinksForRole(role)) {
        expect(Object.keys(item).sort()).toEqual(["href", "label"]);
      }
    }
  });

  it("never lists a group as a page of its own", () => {
    const labels = labelsOf(portalNavLinksForRole("artist"));
    expect(labels).not.toContain("Venues & Buyers");
    expect(labels).not.toContain("Social");
    expect(labels).not.toContain("Works");
    expect(labels).not.toContain("Posts");
  });

  it("keeps the artist entries the header dropdown had dropped", () => {
    const labels = labelsOf(portalNavLinksForRole("artist"));
    expect(labels).toContain("Enquiries");
    expect(labels).toContain("My Offers");
    expect(labels).toContain("Social Posts");
  });

  it("shows Blogs only when BLOGS_V1 is on", () => {
    expect(labelsOf(portalNavLinksForRole("artist"))).not.toContain("Blogs");
    blogsOn();
    expect(labelsOf(portalNavLinksForRole("artist"))).toContain("Blogs");
  });

  it("reads the flag on every call rather than pinning it at import time", () => {
    artistPortalNav();
    expect(isFlagOnMock).toHaveBeenCalledWith("BLOGS_V1");
  });

  it("never links a route parked off the navs (artwork requests)", () => {
    for (const role of ["artist", "venue", "customer"]) {
      const hrefs = portalNavLinksForRole(role).map((i) => i.href);
      expect(hrefs.some((h) => h.includes("artwork-requests"))).toBe(false);
    }
  });

  it("has no duplicate hrefs in any role's list", () => {
    blogsOn();
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
    for (const role of ["artist", "venue", "customer"]) {
      const flat = portalNavLinksForRole(role);
      expect(flat).toEqual(flattenPortalNav(portalNavForRole(role)));
      expect(flat.at(-1)?.label).toBe("Settings");
    }
  });
});

describe("activeGroupFor and sectionTabsFor", () => {
  let nav: PortalNav;
  beforeEach(() => {
    blogsOn();
    nav = artistPortalNav();
  });

  it("finds the group a child page belongs to", () => {
    expect(activeGroupFor(nav, "/artist-portal/messages")?.label).toBe("Venues & Buyers");
    expect(activeGroupFor(nav, "/artist-portal/orders")?.label).toBe("Venues & Buyers");
    expect(activeGroupFor(nav, "/artist-portal/portfolio")?.label).toBe("My Portfolio");
    expect(activeGroupFor(nav, "/artist-portal/collections")?.label).toBe("My Portfolio");
    expect(activeGroupFor(nav, "/artist-portal/posts")?.label).toBe("Social");
    expect(activeGroupFor(nav, "/artist-portal/blogs")?.label).toBe("Social");
  });

  it("follows a sub-route up to its page (orders/[id], the blog editor)", () => {
    expect(activeGroupFor(nav, "/artist-portal/orders/ord_123")?.label).toBe("Venues & Buyers");
    expect(activeGroupFor(nav, "/artist-portal/blogs/new")?.label).toBe("Social");
  });

  it("ignores query strings, hashes and trailing slashes", () => {
    expect(activeGroupFor(nav, "/artist-portal/collections/?tab=drafts#top")?.label).toBe("My Portfolio");
  });

  it("returns null for a standalone page, the dashboard, Settings and unknown paths", () => {
    for (const path of [
      "/artist-portal",
      "/artist-portal/profile",
      "/artist-portal/saved",
      "/artist-portal/labels",
      "/artist-portal/analytics",
      "/artist-portal/billing",
      "/artist-portal/settings",
      "/artist-portal/nowhere",
      "/venue-portal/messages",
    ]) {
      expect(activeGroupFor(nav, path)).toBeNull();
      expect(sectionTabsFor(nav, path)).toEqual([]);
    }
  });

  it("matches on a path boundary, not a string prefix", () => {
    expect(activeGroupFor(nav, "/artist-portal/postscript")).toBeNull();
    expect(activeGroupFor(nav, "/artist-portal/ordersheet")).toBeNull();
  });

  it("does not offer Blogs while the flag is off", () => {
    isFlagOnMock.mockReturnValue(false);
    const gated = artistPortalNav();
    expect(activeGroupFor(gated, "/artist-portal/blogs")).toBeNull();
    expect(labelsOf(sectionTabsFor(gated, "/artist-portal/posts"))).toEqual(["Posts"]);
  });

  it("hands back the group's children as the tab strip, in sidebar order", () => {
    expect(labelsOf(sectionTabsFor(nav, "/artist-portal/placements"))).toEqual([
      "Messages",
      "Enquiries",
      "Placements",
      "Offers",
      "Orders",
    ]);
    expect(labelsOf(sectionTabsFor(nav, "/artist-portal/portfolio"))).toEqual(["Works", "Collections"]);
    expect(labelsOf(sectionTabsFor(nav, "/artist-portal/blogs"))).toEqual(["Posts", "Blogs"]);
  });

  it("finds nothing in the flat venue and customer navs", () => {
    expect(activeGroupFor(venuePortalNav(), "/venue-portal/messages")).toBeNull();
    expect(sectionTabsFor(customerPortalNav(), "/customer-portal/saved")).toEqual([]);
  });
});

describe("navPageFor (document titles)", () => {
  let nav: PortalNav;
  beforeEach(() => {
    blogsOn();
    nav = artistPortalNav();
  });

  it("names a grouped page by its own standalone label, never by its group", () => {
    expect(navPageFor(nav, "/artist-portal/portfolio")?.label).toBe("My Portfolio");
    expect(navPageFor(nav, "/artist-portal/offers")?.label).toBe("My Offers");
    expect(navPageFor(nav, "/artist-portal/posts")?.label).toBe("Social Posts");
    expect(navPageFor(nav, "/artist-portal/orders")?.label).toBe("Orders");
    expect(navPageFor(nav, "/artist-portal/collections")?.label).toBe("Collections");
  });

  it("resolves a sub-route to the longest page it sits under", () => {
    expect(navPageFor(nav, "/artist-portal/orders/ord_123")?.label).toBe("Orders");
    expect(navPageFor(nav, "/artist-portal/portfolio/edit/9")?.label).toBe("My Portfolio");
  });

  it("names the dashboard only on the exact portal root", () => {
    expect(navPageFor(nav, "/artist-portal")?.label).toBe("Dashboard");
    expect(navPageFor(nav, "/artist-portal/")?.label).toBe("Dashboard");
    expect(navPageFor(nav, "/artist-portal/nowhere")).toBeNull();
    expect(navPageFor(nav, "/elsewhere")).toBeNull();
  });

  it("still finds Settings below the divider", () => {
    expect(navPageFor(nav, "/artist-portal/settings")?.label).toBe("Settings");
  });
});

describe("path helpers", () => {
  it("cleanNavPath strips query, hash and trailing slashes", () => {
    expect(cleanNavPath("/artist-portal/orders/?x=1#y")).toBe("/artist-portal/orders");
    expect(cleanNavPath("/artist-portal///")).toBe("/artist-portal");
    expect(cleanNavPath("/")).toBe("/");
    expect(cleanNavPath("")).toBe("/");
  });

  it("navItemOwnsPath matches a portal root exactly and a page by boundary", () => {
    const root = { label: "Dashboard", href: "/artist-portal" };
    const orders = { label: "Orders", href: "/artist-portal/orders" };
    expect(navItemOwnsPath(root, "/artist-portal")).toBe(true);
    expect(navItemOwnsPath(root, "/artist-portal/orders")).toBe(false);
    expect(navItemOwnsPath(orders, "/artist-portal/orders")).toBe(true);
    expect(navItemOwnsPath(orders, "/artist-portal/orders/1")).toBe(true);
    expect(navItemOwnsPath(orders, "/artist-portal/ordersheet")).toBe(false);
    expect(navItemOwnsPath(orders, "/artist-portal")).toBe(false);
  });

  it("navGroupKey slugs a label into a DOM id and storage key", () => {
    expect(navGroupKey({ label: "Venues & Buyers", href: "/x" })).toBe("venues-buyers");
    expect(navGroupKey({ label: "My Portfolio", href: "/x" })).toBe("my-portfolio");
    expect(navGroupKey({ label: "Social", href: "/x" })).toBe("social");
  });
});
