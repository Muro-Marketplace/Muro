// The reserved-slug set exists because of the vanity URL at
// `src/app/(pages)/[artistSlug]/page.tsx`: `wallplace.co.uk/{slug}` resolves
// to an artist's shop, so an artist slug and a top-level route name now share
// one namespace. Without a guard an artist could take `pricing` and shadow the
// pricing page, or a future route named after an existing artist could steal
// their URL.
//
// The set is DERIVED, not typed by hand. A hand-maintained list rots the first
// time someone adds a route and forgets, so the derivation test below reads the
// route tree off disk and fails CI when a real route is missing from the set.

import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { RESERVED_SLUGS, isReservedSlug } from "./reserved-slugs";

/**
 * Names the derivation rule (spec §6.1) says must be reserved, read off disk
 * so adding a route without updating the set fails here rather than in
 * production.
 */
function derivedNames(): string[] {
  const dirs = (path: string) =>
    readdirSync(path, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

  return [
    // 1. Top-level pages, minus dynamic segments (the vanity route itself).
    ...dirs("src/app/(pages)").filter((n) => !n.startsWith("[")),
    // 2. Top-level app entries, minus route groups.
    ...dirs("src/app").filter((n) => !n.startsWith("(")),
    // 3. Everything served straight out of public/.
    ...readdirSync("public"),
    // 4. Fixed-path route handlers. `robots.ts` serves /robots.txt and
    //    `sitemap.ts` serves /sitemap.xml, so neither shows up as a directory.
    "robots",
    "robots.txt",
    "sitemap",
    "sitemap.xml",
    // 5. Framework-owned prefix.
    "_next",
  ];
}

describe("RESERVED_SLUGS", () => {
  it("covers every name the derivation rule produces", () => {
    const missing = derivedNames().filter((n) => !RESERVED_SLUGS.has(n));
    expect(missing).toEqual([]);
  });

  it("derives a non-trivial number of names, so the sweep cannot pass vacuously", () => {
    expect(derivedNames().length).toBeGreaterThan(30);
  });

  it("does not reserve the vanity route's own dynamic segment", () => {
    expect(RESERVED_SLUGS.has("[artistSlug]")).toBe(false);
  });
});

describe("isReservedSlug()", () => {
  it.each(["browse", "pricing", "checkout", "login", "api", "admin", "_next"])(
    "reserves the real route %p",
    (slug) => {
      expect(isReservedSlug(slug)).toBe(true);
    },
  );

  it.each(["fin-coles", "jane-doe", "artist-1730000000000"])(
    "leaves the ordinary artist slug %p alone",
    (slug) => {
      expect(isReservedSlug(slug)).toBe(false);
    },
  );

  it("reserves names we may want as routes later", () => {
    // Cheap now, impossible once an artist holds the URL and has printed it.
    expect(isReservedSlug("sell")).toBe(true);
    expect(isReservedSlug("shop")).toBe(true);
    expect(isReservedSlug("help")).toBe(true);
  });

  it("matches case-insensitively", () => {
    // Slugs reach the guard lowercased by slugify(), but the claim page has
    // its own divergent copy, so the guard does not assume its caller cleaned up.
    expect(isReservedSlug("Pricing")).toBe(true);
    expect(isReservedSlug("BROWSE")).toBe(true);
  });

  it("ignores surrounding whitespace", () => {
    expect(isReservedSlug("  browse  ")).toBe(true);
  });

  it("treats the empty slug as reserved", () => {
    // slugify() returns "" for input with no alphanumerics. An empty slug would
    // make the vanity URL the site root, so it can never belong to an artist.
    expect(isReservedSlug("")).toBe(true);
    expect(isReservedSlug("   ")).toBe(true);
  });
});
