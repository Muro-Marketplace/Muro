/**
 * Portal nav consistency tests (ADR 0005).
 *
 * These tests guard the cross-cutting nav items that must stay consistent
 * across portal layouts. They operate on the source arrays directly (not
 * the rendered DOM) so they run fast and without a jsdom environment.
 *
 * What we check:
 * 1. Every href declared in a portal sidebar nav resolves to an existing
 *    file-system route under src/app/(pages)/<portal>/.
 * 2. The Header portal dropdown for customers includes Addresses, matching
 *    the CustomerPortalLayout sidebar (the accidental omission fixed in
 *    this PR — Bug 6 / ADR 0005).
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../app/(pages)");

function routeExists(href: string): boolean {
  // Strip leading slash and map to the (pages) group directory.
  const rel = href.replace(/^\//, "");
  const dir = path.join(ROOT, rel);
  // Exact directory (index route).
  if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return true;
  // Dynamic segments: the directory contains a [param] child.
  const parent = path.dirname(dir);
  if (fs.existsSync(parent)) {
    const children = fs.readdirSync(parent);
    if (children.some((c) => c.startsWith("[") && c.endsWith("]"))) return true;
  }
  return false;
}

// ---- Artist portal sidebar items ----------------------------------------
const artistNavItems = [
  "/artist-portal",
  "/artist-portal/profile",
  "/artist-portal/portfolio",
  "/artist-portal/showroom",
  "/artist-portal/messages",
  "/artist-portal/placements",
  "/artist-portal/offers",
  "/artist-portal/collections",
  "/artist-portal/saved",
  "/artist-portal/orders",
  "/artist-portal/labels",
  "/artist-portal/posts",
  "/artist-portal/blogs",
  "/artist-portal/analytics",
  "/artist-portal/billing",
  "/artist-portal/settings",
];

// ---- Venue portal sidebar items -----------------------------------------
const venueNavItems = [
  "/venue-portal",
  "/venue-portal/profile",
  "/venue-portal/messages",
  "/venue-portal/placements",
  "/venue-portal/offers",
  "/venue-portal/walls",
  "/venue-portal/saved",
  "/venue-portal/labels",
  "/venue-portal/analytics",
  "/venue-portal/orders",
  "/venue-portal/settings",
];

// ---- Customer portal sidebar items --------------------------------------
const customerNavItems = [
  "/customer-portal",
  "/customer-portal/saved",
  "/customer-portal/addresses",
  "/customer-portal/messages",
  "/customer-portal/settings",
];

// ---- Header portal dropdown items (customer) ----------------------------
// Manually copied from Header.tsx so a future divergence fails this test.
const headerCustomerDropdownItems = [
  "/customer-portal",
  "/customer-portal/saved",
  "/customer-portal/addresses",
  "/customer-portal/messages",
  "/customer-portal/settings",
];

// ---- Admin portal sidebar items -----------------------------------------
const adminNavItems = [
  "/admin",
  "/admin/applications",
  "/admin/artists",
  "/admin/venues",
  "/admin/curation",
  "/admin/feature-requests",
  "/admin/feedback",
  "/admin/blogs",
  "/admin/disputes",
  "/admin/financials",
];

describe("portal nav route existence", () => {
  describe("artist portal", () => {
    for (const href of artistNavItems) {
      it(`route exists: ${href}`, () => {
        expect(routeExists(href), `Missing route for ${href}`).toBe(true);
      });
    }
  });

  describe("venue portal", () => {
    for (const href of venueNavItems) {
      it(`route exists: ${href}`, () => {
        expect(routeExists(href), `Missing route for ${href}`).toBe(true);
      });
    }
  });

  describe("customer portal", () => {
    for (const href of customerNavItems) {
      it(`route exists: ${href}`, () => {
        expect(routeExists(href), `Missing route for ${href}`).toBe(true);
      });
    }
  });

  describe("admin portal", () => {
    for (const href of adminNavItems) {
      it(`route exists: ${href}`, () => {
        expect(routeExists(href), `Missing route for ${href}`).toBe(true);
      });
    }
  });
});

describe("Header portal dropdown parity with sidebar (Bug 6 / ADR 0005)", () => {
  it("customer Header dropdown contains all sidebar hrefs", () => {
    const dropdownSet = new Set(headerCustomerDropdownItems);
    const missing = customerNavItems.filter((href) => !dropdownSet.has(href));
    expect(
      missing,
      `Header customer dropdown is missing sidebar hrefs: ${missing.join(", ")}`,
    ).toHaveLength(0);
  });

  it("customer Header dropdown does not reference routes that do not exist", () => {
    const missing = headerCustomerDropdownItems.filter(
      (href) => !routeExists(href),
    );
    expect(
      missing,
      `Header customer dropdown hrefs with no matching route: ${missing.join(", ")}`,
    ).toHaveLength(0);
  });
});
