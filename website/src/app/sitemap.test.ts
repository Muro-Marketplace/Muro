// Unit test for src/app/sitemap.ts
//
// Asserts:
//   1. /galleries is NOT present (it is a redirect-only route — fix 6.2).
//   2. Canonical static routes ARE present (sanity check that the sitemap
//      still includes the expected pages after the removal).
//
// The sitemap function calls Supabase, so we mock getSupabaseAdmin to avoid
// any real network calls and to keep the test fully offline.

import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the Supabase admin client used inside sitemap.ts.
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  }),
}));

// Mock the static artist seed data so the test doesn't depend on the full
// artists array and remains fast.
vi.mock("@/data/artists", () => ({
  artists: [],
}));

// Mock slugify — not exercised by these assertions but imported by sitemap.ts.
vi.mock("@/lib/slugify", () => ({
  slugify: (s: string) => s.toLowerCase().replace(/\s+/g, "-"),
}));

import sitemap from "./sitemap";

const SITE_URL = "https://wallplace.co.uk";

describe("sitemap (fix 6.2)", () => {
  beforeEach(() => {
    // Ensure NEXT_PUBLIC_SITE_URL is unset so the default kicks in.
    delete process.env.NEXT_PUBLIC_SITE_URL;
  });

  it("does NOT include /galleries (redirect-only route)", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).not.toContain(`${SITE_URL}/galleries`);
  });

  it("still includes canonical static routes", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    for (const path of ["/", "/browse", "/artists", "/spaces", "/blog", "/about"]) {
      expect(urls, `expected ${path} in sitemap`).toContain(`${SITE_URL}${path}`);
    }
  });

  it("includes the home page with priority 1", async () => {
    const entries = await sitemap();
    const home = entries.find((e) => e.url === `${SITE_URL}/`);
    expect(home).toBeDefined();
    expect(home?.priority).toBe(1);
  });
});
