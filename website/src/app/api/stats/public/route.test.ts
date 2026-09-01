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

import { describe, expect, it, vi, beforeEach } from "vitest";

const { fromMock, rateLimitMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rateLimitMock: vi.fn(async () => null),
}));

vi.mock("@/lib/supabase", () => ({ supabase: { from: fromMock } }));
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
    chain.in = (_col: string, values: unknown[]) => {
      filters.push({ table, col: "in", value: values });
      key = `${table}:of_approved`;
      return chain;
    };
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ count: counts[key] ?? 0, data: counts.rows ? [] : [], error: null }).then(resolve);
    return { select: () => chain };
  });
}

beforeEach(() => {
  fromMock.mockReset();
  rateLimitMock.mockReset();
  rateLimitMock.mockResolvedValue(null);
});

describe("GET /api/stats/public", () => {
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
