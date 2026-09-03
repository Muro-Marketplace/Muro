/**
 * /api/venues/demand carries publicWallCount per venue: the number of walls
 * the venue has measured up and made public, counted server-side so the
 * venue's user_id never leaves the route.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { fromMock, isFlagOnMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  isFlagOnMock: vi.fn((_flag: string) => true),
}));

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/api-auth", () => ({ getOptionalUser: vi.fn(async () => ({ user: null })) }));
vi.mock("@/lib/subscriptions", () => ({ resolveSubscription: vi.fn(async () => ({ active: false })) }));
vi.mock("@/lib/feature-flags", () => ({ isFlagOn: isFlagOnMock }));
vi.mock("@/lib/venue-visibility", () => ({
  redactDemandVenue: (v: Record<string, unknown>) => v,
  canSeeVenueIdentity: () => false,
}));
vi.mock("@/data/venues", () => ({ venues: [] }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: fromMock }) }));

import { GET } from "./route";

const VENUES = [
  { user_id: "u-a", slug: "venue-a", name: "Venue A", type: "cafe" },
  { user_id: "u-b", slug: "venue-b", name: "Venue B", type: "bar" },
];

function wireDb(walls: Array<{ user_id: string }>, wallsError: unknown = null) {
  fromMock.mockImplementation((table: string) => {
    if (table === "venue_profiles") {
      return { select: () => ({ order: async () => ({ data: VENUES, error: null }) }) };
    }
    if (table === "walls") {
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: async () => ({ data: wallsError ? null : walls, error: wallsError }),
      };
      return chain;
    }
    throw new Error(`unexpected table ${table}`);
  });
}

describe("GET /api/venues/demand publicWallCount", () => {
  beforeEach(() => {
    fromMock.mockReset();
    isFlagOnMock.mockReturnValue(true);
  });

  it("counts each venue's public walls and never emits user_id", async () => {
    wireDb([{ user_id: "u-a" }, { user_id: "u-a" }, { user_id: "u-b" }]);
    const res = await GET(new Request("http://localhost/api/venues/demand"));
    const body = await res.json();
    const bySlug = Object.fromEntries(body.venues.map((v: { slug: string }) => [v.slug, v]));
    expect(bySlug["venue-a"].publicWallCount).toBe(2);
    expect(bySlug["venue-b"].publicWallCount).toBe(1);
    for (const v of body.venues) expect(v).not.toHaveProperty("user_id");
  });

  it("is zero for venues with no public walls, and when the lookup fails", async () => {
    wireDb([]);
    let body = await (await GET(new Request("http://localhost/api/venues/demand"))).json();
    expect(body.venues.map((v: { publicWallCount: number }) => v.publicWallCount)).toEqual([0, 0]);
    wireDb([], { message: "boom" });
    body = await (await GET(new Request("http://localhost/api/venues/demand"))).json();
    expect(body.venues.map((v: { publicWallCount: number }) => v.publicWallCount)).toEqual([0, 0]);
  });

  it("does not count walls at all while the visualiser is off", async () => {
    isFlagOnMock.mockImplementation((flag: string) => flag !== "WALL_VISUALIZER_V1");
    wireDb([{ user_id: "u-a" }]);
    const body = await (await GET(new Request("http://localhost/api/venues/demand"))).json();
    expect(body.venues.map((v: { publicWallCount: number }) => v.publicWallCount)).toEqual([0, 0]);
    expect(fromMock.mock.calls.map((c) => c[0])).not.toContain("walls");
  });
});
