// Unit test for src/app/sitemap.ts
//
// Asserts:
//   1. /galleries is NOT present (it is a redirect-only route — fix 6.2).
//   2. Canonical static routes ARE present (sanity check that the sitemap
//      still includes the expected pages after the removal).
//
// The sitemap function calls Supabase, so we mock getSupabaseAdmin to avoid
// any real network calls and to keep the test fully offline.

import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";

// Mock the Supabase admin client used inside sitemap.ts. Routed through a mutable
// fromMock so individual tests can supply table-specific data (row 19 #9).
const { fromMock, seedArtists } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  seedArtists: [] as Array<{ slug: string; works: Array<{ title: string }> }>,
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}));

// Live array so individual tests can add a seed artist (launch audit).
vi.mock("@/data/artists", () => ({ artists: seedArtists }));

// Mock slugify with the same lowercase/hyphen behaviour the real one applies to
// these fixtures (exercised by the row 19 #9 lastmod test).
vi.mock("@/lib/slugify", () => ({
  slugify: (s: string) => s.toLowerCase().replace(/\s+/g, "-"),
}));

import sitemap from "./sitemap";

const SITE_URL = "https://wallplace.co.uk";

// Default table handler: every query resolves empty, matching an unavailable or
// empty DB (this is what the fix 6.2 tests below assume).
function emptyDb() {
  return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
}

describe("sitemap (fix 6.2)", () => {
  beforeEach(() => {
    // Ensure NEXT_PUBLIC_SITE_URL is unset so the default kicks in.
    delete process.env.NEXT_PUBLIC_SITE_URL;
    fromMock.mockReset();
    fromMock.mockImplementation(() => emptyDb());
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

  // row 19 #9. artist_works has created_at, not updated_at. The old select named
  // updated_at, so PostgREST rejected the whole query and no artwork URL got a DB
  // lastmod. The mock models that rejection faithfully (a naive mock would mask it),
  // so this fails before the fix (the URL is absent) and passes after.
  it("uses artist_works.created_at for the artwork lastmod, not the phantom updated_at (row 19 #9)", async () => {
    // Real columns of artist_works (schema-columns.json); excludes updated_at.
    const ARTIST_WORKS_COLUMNS = new Set(["id", "artist_id", "title", "created_at", "image", "available"]);
    const phantomIn = (cols: string): string | null => {
      for (const raw of cols.split(",")) {
        const t = raw.trim();
        if (!/^[a-z_][a-z0-9_]*$/.test(t)) continue; // skip embeds / aliases
        if (!ARTIST_WORKS_COLUMNS.has(t)) return t;
      }
      return null;
    };
    fromMock.mockImplementation((table: string) => {
      if (table === "artist_works") {
        return {
          // No .eq() follows this select; the route awaits it directly.
          select: (cols: string) => {
            const phantom = phantomIn(cols);
            if (phantom) {
              return Promise.resolve({ data: null, error: { message: `column artist_works.${phantom} does not exist` } });
            }
            return Promise.resolve({
              data: [{ title: "Sunset", created_at: "2026-01-01T00:00:00.000Z", artist_profiles: { slug: "alice" } }],
              error: null,
            });
          },
        };
      }
      return emptyDb();
    });

    const entries = await sitemap();
    const work = entries.find((e) => e.url === `${SITE_URL}/browse/alice/sunset`);
    // Fail-before: the old select named artist_works.updated_at, so the whole query
    // was rejected and this artwork URL never made it into the sitemap.
    expect(work).toBeDefined();
    expect(work?.lastModified).toEqual(new Date("2026-01-01T00:00:00.000Z"));
  });
});

describe("sitemap seed gating (launch audit, blocker 1)", () => {
  const SNAPSHOT = { ...process.env };
  afterEach(() => {
    process.env = { ...SNAPSHOT };
    seedArtists.length = 0;
  });

  it("omits seed artist URLs when the flag is off", async () => {
    seedArtists.push({ slug: "seed-one", works: [{ title: "Study One" }] });
    process.env.NEXT_PUBLIC_FLAG_SEED_CATALOG = "0";
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).not.toContain(`${SITE_URL}/browse/seed-one`);
    expect(urls).not.toContain(`${SITE_URL}/browse/seed-one/study-one`);
  });

  it("includes them by default", async () => {
    seedArtists.push({ slug: "seed-one", works: [{ title: "Study One" }] });
    delete process.env.NEXT_PUBLIC_FLAG_SEED_CATALOG;
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain(`${SITE_URL}/browse/seed-one`);
  });
});
