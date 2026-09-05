// Vercel functions must run beside the Supabase database.
//
// Measured 5 September 2026, before this pin existed: `x-vercel-id` on every
// Wallplace API route read `lhr1::iad1::…`. The request landed at the London
// edge, then the function executed in iad1, Washington DC, while the Supabase
// project sits in eu-west-1, Ireland. Every authenticated call went London,
// Washington, Dublin and back, and an authenticated route makes two to four
// SEQUENTIAL Supabase round trips inside that (auth getUser, then each query).
//
// From a London connection, 8 samples each: a static asset served at the London
// edge was ~60ms to first byte, while /api/artist-profile returning 401, which
// exits BEFORE any Supabase call at all, was ~175ms. So the detour alone cost
// roughly 115ms of pure network per API request, before the function did any
// work, with a transatlantic hop on each Supabase call on top of that.
//
// vercel.json carried no `regions` key, so this was an account default rather
// than anyone's decision. `dub1` is Vercel's Dublin region: same place as the
// database. The database side is what to optimise, because a request makes one
// round trip to the user and several to Postgres.
//
// If the Supabase project ever moves region, move this with it.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

/**
 * Vercel regions that sit in the same place as Supabase's eu-west-1.
 * `lhr1` (London) is ~12ms from Dublin and is an acceptable second choice;
 * anything outside these two puts an ocean or a continent in the request path.
 */
const COLOCATED_WITH_EU_WEST_1 = ["dub1", "lhr1"];

describe("Vercel function region", () => {
  const config = JSON.parse(readFileSync(path.join(ROOT, "vercel.json"), "utf8")) as {
    regions?: string[];
    functions?: Record<string, { regions?: string[] }>;
  };

  it("is pinned, so it cannot silently fall back to the account default", () => {
    expect(
      config.regions,
      "vercel.json has no `regions`, so functions run wherever the account defaults to. That was iad1 (Washington DC) while the database is in Ireland.",
    ).toBeDefined();
    expect(config.regions).toHaveLength(1);
  });

  it("sits with the database, not across an ocean from it", () => {
    const [region] = config.regions ?? [];
    expect(
      COLOCATED_WITH_EU_WEST_1,
      `functions are pinned to ${region}; the Supabase project is in eu-west-1 (Ireland)`,
    ).toContain(region);
  });

  it("has no per-function override that escapes the pin", () => {
    const strays = Object.entries(config.functions ?? {})
      .filter(([, cfg]) => (cfg.regions ?? []).some((r) => !COLOCATED_WITH_EU_WEST_1.includes(r)))
      .map(([file]) => file);
    expect(strays, "these functions opt out of the colocated region").toEqual([]);
  });
});
