import { beforeEach, describe, expect, it, vi } from "vitest";

// `artist-profiles.ts` imports `@/lib/supabase` which calls
// `createClient(undefined, undefined)` at module load if env vars are
// missing, which they are in unit-test runs. Stub both supabase modules
// so the import succeeds; we only exercise the pure mapper below.
vi.mock("@/lib/supabase", () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ data: [] }) }) }) },
}));
// Slugs the stubbed `artist_profiles` table holds. Mutable so the
// artistProfileSlugExists tests below can decide what the table contains
// without rebuilding the mock; the mapper tests above never read it.
const dbSlugs = new Set<string>();

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: (_column: string, value: string) => ({
          data: [],
          single: () => ({ data: null }),
          maybeSingle: async () => ({
            data: dbSlugs.has(value) ? { slug: value } : null,
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

import {
  artistProfileSlugExists,
  dbProfileToArtist,
  type DbArtistProfile,
  type DbArtistWork,
} from "./artist-profiles";

// Minimal profile shape, every test below shares this so the assertions
// can focus on the `works[]` mapping. Anything not set defaults sensibly
// in dbProfileToArtist so we only fill what's strictly required by the
// type.
function makeProfile(overrides: Partial<DbArtistProfile> = {}): DbArtistProfile {
  return {
    id: "profile-1",
    user_id: "user-1",
    slug: "test-artist",
    name: "Test Artist",
    profile_image: "",
    banner_image: "",
    short_bio: "",
    extended_bio: "",
    location: "",
    primary_medium: "",
    style_tags: [],
    themes: [],
    instagram: "",
    website: "",
    offers_originals: true,
    offers_prints: true,
    offers_framed: false,
    available_sizes: [],
    open_to_commissions: true,
    open_to_free_loan: true,
    open_to_revenue_share: true,
    revenue_share_percent: 30,
    open_to_outright_purchase: true,
    can_provide_frames: false,
    can_arrange_framing: false,
    delivery_radius: "",
    venue_types_suited_for: [],
    is_founding_artist: false,
    profile_color: "#000",
    ...overrides,
  };
}

function makeWork(overrides: Partial<DbArtistWork> = {}): DbArtistWork {
  return {
    id: "work-1",
    artist_id: "profile-1",
    title: "Untitled",
    medium: "",
    dimensions: "",
    price_band: "£100",
    pricing: [],
    available: true,
    color: "#000",
    image: "",
    orientation: "landscape",
    sort_order: 0,
    ...overrides,
  };
}

describe("dbProfileToArtist", () => {
  it("preserves per-size inStorePrice on each pricing entry", () => {
    // Regression: previously the artist's "Also sold in-store at venues"
    // toggle + per-size prices were stored on a top-level
    // `inStorePricing[]` array that the API never accepted. Per-size
    // in-store now lives on `pricing[i].inStorePrice` alongside
    // `shippingPrice`, which DOES round-trip through the JSONB column.
    // This test pins the contract so a future refactor can't silently
    // strip the field again.
    const artist = dbProfileToArtist(makeProfile(), [
      makeWork({
        pricing: [
          { label: "A4", price: 80, shippingPrice: 6, inStorePrice: 60 },
          { label: "A3", price: 140, shippingPrice: 10, inStorePrice: 110 },
        ],
      }),
    ]);

    expect(artist.works[0].pricing).toEqual([
      { label: "A4", price: 80, shippingPrice: 6, inStorePrice: 60 },
      { label: "A3", price: 140, shippingPrice: 10, inStorePrice: 110 },
    ]);
  });

  it("surfaces the legacy work-level in_store_price as inStorePrice", () => {
    // Older works without per-size in-store data still need the
    // pickup CTA on the artwork page. The work-level fallback comes
    // from the `in_store_price` column.
    const artist = dbProfileToArtist(makeProfile(), [
      makeWork({
        in_store_price: 250,
        pricing: [{ label: "A3", price: 280 }],
      }),
    ]);

    expect(artist.works[0].inStorePrice).toBe(250);
  });

  it("returns inStorePrice undefined when the column is null", () => {
    // Most artworks don't opt into in-store. Make sure the mapper
    // doesn't accidentally coerce null to 0, which would surface a
    // bogus £0 pickup CTA on the public page.
    const artist = dbProfileToArtist(makeProfile(), [
      makeWork({ in_store_price: null }),
    ]);

    expect(artist.works[0].inStorePrice).toBeUndefined();
  });
});

// The vanity URL (`/{slug}` → `/browse/{slug}`) needs to know whether a slug is
// taken before it redirects. `getArtistProfileBySlug` answers that question but
// pays for the whole profile row, every work, and a placements read to do it,
// which is the right shape for rendering a page and the wrong shape for a
// yes/no on a catch-all route that also fields every mistyped URL on the site.
describe("artistProfileSlugExists()", () => {
  beforeEach(() => {
    dbSlugs.clear();
  });

  it("is true for a slug the table holds", async () => {
    dbSlugs.add("fin-coles");
    expect(await artistProfileSlugExists("fin-coles")).toBe(true);
  });

  it("is false for a slug the table does not hold", async () => {
    dbSlugs.add("fin-coles");
    expect(await artistProfileSlugExists("nobody-here")).toBe(false);
  });

  it("is false rather than throwing on an empty slug", async () => {
    expect(await artistProfileSlugExists("")).toBe(false);
  });
});
