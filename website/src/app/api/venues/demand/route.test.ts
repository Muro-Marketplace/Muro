import { afterEach, describe, expect, it, vi } from "vitest";

// Launch audit, blocker 2. The "Active Demand" sections on / and /artists
// point at this endpoint, so what they promise is whatever it returns. The
// 21 seed venues are fictional and must not be counted in production.
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/api-auth", () => ({ getOptionalUser: vi.fn(async () => ({ user: null })) }));
vi.mock("@/lib/subscriptions", () => ({ resolveSubscription: vi.fn(async () => ({ active: false })) }));
vi.mock("@/lib/venue-visibility", () => ({
  canSeeVenueIdentity: () => false,
  redactDemandVenue: (v: unknown) => v,
}));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({ order: async () => ({ data: [], error: null }) }),
    }),
  }),
}));
vi.mock("@/data/venues", () => ({
  venues: [
    {
      slug: "seed-cafe", name: "Seed Cafe", type: "Café", location: "Peckham",
      coordinates: { lat: 51.47, lng: -0.07 }, approximateFootfall: "", audienceType: "",
      interestedInFreeLoan: true, interestedInRevenueShare: false, interestedInDirectPurchase: false,
      interestedInCollections: false, interestedInLocalArtists: false, interestedInFramedWork: false,
      interestedInRotatingArtwork: false, wallSpace: "", preferredStyles: [], preferredThemes: [],
      description: "", image: "",
    },
  ],
}));

import { GET } from "./route";

const req = () => new Request("http://localhost/api/venues/demand");

describe("GET /api/venues/demand seed gating", () => {
  const SNAPSHOT = { ...process.env };
  afterEach(() => {
    process.env = { ...SNAPSHOT };
  });

  it("returns no seed venues when the flag is off", async () => {
    process.env.NEXT_PUBLIC_FLAG_SEED_CATALOG = "0";
    const json = await (await GET(req())).json();
    expect(json.venues).toEqual([]);
    expect(json.stats.total).toBe(0);
  });

  it("returns them by default", async () => {
    delete process.env.NEXT_PUBLIC_FLAG_SEED_CATALOG;
    const json = await (await GET(req())).json();
    expect(json.venues.map((v: { slug: string }) => v.slug)).toEqual(["seed-cafe"]);
  });
});
