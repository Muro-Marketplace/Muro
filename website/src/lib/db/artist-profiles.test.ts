import { describe, expect, it, vi } from "vitest";

// `artist-profiles.ts` imports `@/lib/supabase` which calls
// `createClient(undefined, undefined)` at module load if env vars are
// missing, which they are in unit-test runs. Stub both supabase modules
// so the import succeeds; we only exercise the pure mapper below.
vi.mock("@/lib/supabase", () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ data: [] }) }) }) },
}));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({ select: () => ({ eq: () => ({ data: [], single: () => ({ data: null }) }) }) }),
  }),
}));

import { dbProfileToArtist, type DbArtistProfile, type DbArtistWork } from "./artist-profiles";

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

describe("open_to_programme, the Programmes supply pool (phase 1)", () => {
  it("leaves a legacy row OUT of the programme pool while keeping the other three open", () => {
    // The contrast is the point, not an oversight. The three flags beside this
    // one default to open for rows that predate them, because being shown to a
    // venue costs the artist nothing. Programme rent is a different bargain:
    // roughly GBP 10 per piece per month, Wallplace picks the pieces, and the
    // piece cannot sell elsewhere while it hangs. Defaulting that to true would
    // enrol every existing artist in terms they have never read, so consent has
    // to be explicit and absence has to mean no.
    const artist = dbProfileToArtist(makeProfile(), []);

    expect(artist.openToProgramme).toBe(false);
    expect(artist.openToFreeLoan).toBe(true);
    expect(artist.openToRevenueShare).toBe(true);
    expect(artist.openToOutrightPurchase).toBe(true);
  });

  it("reads an explicit null as not opted in", () => {
    const artist = dbProfileToArtist(makeProfile({ open_to_programme: null }), []);
    expect(artist.openToProgramme).toBe(false);
  });

  it("reads an explicit false as not opted in", () => {
    const artist = dbProfileToArtist(makeProfile({ open_to_programme: false }), []);
    expect(artist.openToProgramme).toBe(false);
  });

  it("carries a real opt-in through to the artist shape", () => {
    const artist = dbProfileToArtist(makeProfile({ open_to_programme: true }), []);
    expect(artist.openToProgramme).toBe(true);
  });
});
