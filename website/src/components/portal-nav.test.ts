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
 * 2. The Header portal dropdown matches the sidebar for every role (the
 *    customer Addresses omission was Bug 6 / ADR 0005).
 *
 * H6: the nav arrays below used to be string literals hand-copied out of the
 * layouts, with a comment asking whoever changed one to remember to change the
 * other. Nobody did, and the header dropdown drifted from three sidebars while
 * this file kept passing against its own stale copy. They are now read from
 * src/lib/portal-nav.ts, the single source both surfaces render from, so this
 * file checks the real lists rather than a snapshot of them.
 */
import { describe, it, expect, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// Force the flag-gated entries on so their routes are covered too. Whether a
// given entry is SHOWN is the layout's business (and is tested in
// blogs-flag-gate.test.tsx); this file is about whether it RESOLVES.
vi.mock("@/lib/feature-flags", () => ({ isFlagOn: () => true }));

const { portalNavLinksForRole } = await import("@/lib/portal-nav");

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

// Sidebar items, straight from the module the layouts render.
const artistNavItems = portalNavLinksForRole("artist").map((i) => i.href);
const venueNavItems = portalNavLinksForRole("venue").map((i) => i.href);
const customerNavItems = portalNavLinksForRole("customer").map((i) => i.href);

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

describe("Header portal dropdown parity with sidebar (Bug 6 / ADR 0005, H6)", () => {
  // Parity is now structural: Header.tsx and the three portal layouts both
  // render portalNavLinksForRole, so there is no second list to fall behind.
  // Header.test.tsx asserts the header really does render from it; what is
  // worth checking here is that the shared list only points at live routes.
  for (const [role, items] of Object.entries({
    artist: artistNavItems,
    venue: venueNavItems,
    customer: customerNavItems,
  })) {
    it(`${role} portal dropdown references no route that does not exist`, () => {
      const missing = items.filter((href) => !routeExists(href));
      expect(
        missing,
        `${role} portal nav hrefs with no matching route: ${missing.join(", ")}`,
      ).toHaveLength(0);
    });
  }

  it("still carries Addresses for customers (the Bug 6 omission)", () => {
    expect(customerNavItems).toContain("/customer-portal/addresses");
  });
});
