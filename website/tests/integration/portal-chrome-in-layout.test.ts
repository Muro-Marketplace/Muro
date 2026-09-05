// Portal navigation cost. The four portals each rendered their chrome (sidebar,
// nav, auth/profile gate) from inside every PAGE rather than from the route's
// layout.tsx.
//
// Next.js App Router keeps layout.tsx mounted across sibling navigations and
// swaps the page element. React sees a different component type in that slot and
// unmounts everything below it, so with the chrome under the page every click
// destroyed the chrome and rebuilt it: state reset, the gate went back to
// "checking", a full-screen loader replaced the whole portal (sidebar included),
// and it stayed there until a fresh profile request came back. Measured on the
// artist portal: four identical GET /api/artist-profile per navigation to
// /artist-portal/portfolio, one of them blocking the paint.
//
// The chrome now lives in each portal's layout.tsx, so it mounts once per
// session and survives every in-portal navigation. This file is the ratchet:
// a page that renders its own chrome puts the defect straight back.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PAGES = path.join(ROOT, "src/app/(pages)");

interface Portal {
  /** Route directory under src/app/(pages). */
  dir: string;
  /** The chrome component the route layout must own. */
  chrome: string;
}

const PORTALS: Portal[] = [
  { dir: "artist-portal", chrome: "ArtistPortalLayout" },
  { dir: "venue-portal", chrome: "VenuePortalLayout" },
  { dir: "customer-portal", chrome: "CustomerPortalLayout" },
  { dir: "admin", chrome: "AdminPortalLayout" },
];

function pagesUnder(dir: string): string[] {
  const out: string[] = [];
  function walk(d: string) {
    for (const entry of readdirSync(d)) {
      const full = path.join(d, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry === "page.tsx") out.push(full);
    }
  }
  walk(dir);
  return out;
}

describe.each(PORTALS)("$dir renders its chrome from the route layout", ({ dir, chrome }) => {
  const portalDir = path.join(PAGES, dir);

  it("no page imports the chrome component", () => {
    const offenders = pagesUnder(portalDir)
      .filter((f) => readFileSync(f, "utf8").includes(`@/components/${chrome}`))
      .map((f) => path.relative(ROOT, f));

    expect(offenders, `these pages render ${chrome} themselves, so it remounts on every click`).toEqual([]);
  });

  it("layout.tsx renders the chrome", () => {
    const layout = readFileSync(path.join(portalDir, "layout.tsx"), "utf8");
    expect(layout).toContain(`@/components/${chrome}`);
  });
});
