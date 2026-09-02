import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Row A L123. The homepage trust bar rendered "30+ Curated Artists, 230+
// Original Artworks, 20+ Active Venues" from the STATIC seed in
// src/data/artists.ts and src/data/venues.ts. Live production holds 11 approved
// artists, 32 of their works and 9 venues, so the three claims overstate by
// roughly 3x, 7x and 2x. The admin dashboard already distinguishes
// "REGISTERED ARTISTS (DB) 14" from "LISTED (MARKETPLACE) 41", so the gap was
// known internally and shown to visitors anyway.
//
// This endpoint existed for exactly that job and had zero callers. It counted
// every artist_profiles row, including pending and rejected ones, which is not
// what a visitor can browse. It counts what /browse shows.
//
// Launch audit, blocker 3. The anon client has no SELECT on artist_profiles
// or venue_profiles in production, so every count came back 0 and the trust
// bar rendered nothing. The route now reads through the service-role client
// (getSupabaseAdmin); the explicit review_status filter below is what keeps
// the artist count honest, not RLS.

const { fromMock, rateLimitMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rateLimitMock: vi.fn(async () => null),
}));

vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: fromMock }) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: rateLimitMock }));

import { GET } from "./route";

/** Records the filters each counting query applied, keyed by table. */
let filters: Array<{ table: string; col: string; value: unknown }> = [];

function setupCounts(counts: Record<string, number>) {
  filters = [];
  fromMock.mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {};
    let key = table;
    chain.eq = (col: string, value: unknown) => {
      filters.push({ table, col, value });
      if (col === "review_status") key = `${table}:approved`;
      if (col === "available") key = `${table}:sold`;
      if (col === "status") key = `${table}:active`;
      return chain;
    };
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ count: counts[key] ?? 0, error: null }).then(resolve);
    return { select: () => chain };
  });
}

beforeEach(() => {
  fromMock.mockReset();
  rateLimitMock.mockReset();
  rateLimitMock.mockResolvedValue(null);
});

describe("GET /api/stats/public", () => {
  it("counts through the service-role client, not anon", () => {
    const src = readFileSync(join(process.cwd(), "src/app/api/stats/public/route.ts"), "utf8");
    expect(src).toContain("getSupabaseAdmin");
    expect(src).not.toMatch(/from "@\/lib\/supabase"/);
  });

  it("counts only artists a visitor can actually browse", async () => {
    setupCounts({ "artist_profiles:approved": 11, artist_works: 35, venue_profiles: 9 });

    const body = await (await GET(new Request("http://localhost/api/stats/public"))).json();

    expect(body.total_artists).toBe(11);
    expect(filters).toContainEqual({
      table: "artist_profiles",
      col: "review_status",
      value: "approved",
    });
  });

  it("returns approved artists, artworks, active placements, venues and sold", async () => {
    setupCounts({
      "artist_profiles:approved": 11,
      artist_works: 35,
      "artist_works:sold": 4,
      "placements:active": 38,
      venue_profiles: 9,
    });

    const json = await (await GET(new Request("http://localhost/api/stats/public"))).json();

    expect(json).toEqual({
      total_artists: 11,
      total_artworks: 35,
      total_placements: 38,
      total_venues: 9,
      artworks_sold: 4,
    });
  });

  it("answers zeroes rather than throwing when the database is unreachable", async () => {
    fromMock.mockImplementation(() => {
      throw new Error("db down");
    });

    const res = await GET(new Request("http://localhost/api/stats/public"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total_artists).toBe(0);
    expect(body.total_venues).toBe(0);
  });

  it("stays rate limited", async () => {
    setupCounts({});
    await GET(new Request("http://localhost/api/stats/public"));
    expect(rateLimitMock).toHaveBeenCalled();
  });
});
