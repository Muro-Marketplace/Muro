import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Launch audit, blocker 3. This route counted with the anon client, and
// production grants anon no SELECT on artist_profiles or venue_profiles, so
// every count came back 0 and the trust bar rendered nothing.
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => null) }));

const counts: Record<string, number> = {
  "artist_profiles|review_status=approved": 11,
  "artist_works|": 35,
  "artist_works|available=false": 4,
  "placements|status=active": 38,
  "venue_profiles|": 9,
};

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      const filters: string[] = [];
      const chain = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          filters.push(`${col}=${String(val)}`);
          return chain;
        },
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ count: counts[`${table}|${filters.join(",")}`] ?? 0, error: null }).then(resolve),
      };
      return chain;
    },
  }),
}));

import { GET } from "./route";

describe("GET /api/stats/public", () => {
  it("counts through the service-role client, not anon", () => {
    const src = readFileSync(join(process.cwd(), "src/app/api/stats/public/route.ts"), "utf8");
    expect(src).toContain("getSupabaseAdmin");
    expect(src).not.toMatch(/from "@\/lib\/supabase"/);
  });

  it("returns approved artists, artworks, active placements, venues and sold", async () => {
    const json = await (await GET(new Request("http://localhost/api/stats/public"))).json();
    expect(json).toEqual({
      total_artists: 11,
      total_artworks: 35,
      total_placements: 38,
      total_venues: 9,
      artworks_sold: 4,
    });
  });
});
