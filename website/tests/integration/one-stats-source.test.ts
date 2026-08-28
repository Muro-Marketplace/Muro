// K5 (07 §5.6). One source for an artist's headline totals.
//
// There were two. Cached `artist_profiles.total_*` columns, and a live
// aggregation over `analytics_events`. They computed the same numbers with the
// same predicates, so the divergence was never arithmetic — it was freshness:
// the cache's only writer was a manual admin POST that no cron entry ever hit.
//
// Measured against prod on 2026-08-28: **2,295 profile_view events across 54
// artists, and 1 of 14 artist_profiles rows with a non-zero total_views**. An
// artist's dashboard said 0 views while their own analytics page said 9. That is
// Bug 13, and it was the common case rather than an edge one.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: fromMock }) }));

import { artistTotals, EMPTY_ARTIST_TOTALS } from "@/lib/analytics/artist-totals";

/** Counts keyed by the table + the filters a query applied. */
let counts: Record<string, number> = {};

function installDb() {
  fromMock.mockImplementation((table: string) => {
    const filters: string[] = [];
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = (col: string, val: unknown) => {
      filters.push(`${col}=${String(val)}`);
      return chain;
    };
    chain.then = (resolve: (v: unknown) => unknown) => {
      const key = [table, ...filters].join("|");
      return Promise.resolve({ count: counts[key] ?? 0, error: null }).then(resolve);
    };
    return chain;
  });
}

beforeEach(() => {
  fromMock.mockReset();
  counts = {};
  installDb();
});

describe("artistTotals (K5)", () => {
  it("counts each total from the predicate the cache used", async () => {
    counts = {
      "analytics_events|artist_slug=maya|event_type=profile_view": 9,
      "placements|artist_user_id=u1|status=active": 3,
      "placements|artist_user_id=u1|status=completed": 2,
      "enquiries|artist_slug=maya": 5,
    };

    await expect(artistTotals({ from: fromMock } as never, { slug: "maya", userId: "u1" })).resolves.toEqual({
      views: 9,
      placements: 3,
      sales: 2,
      enquiries: 5,
    });
  });

  it("reports zero rather than throwing when there is nothing to count", async () => {
    await expect(
      artistTotals({ from: fromMock } as never, { slug: "nobody", userId: "u9" }),
    ).resolves.toEqual(EMPTY_ARTIST_TOTALS);
  });

  it("skips the placement counts for an artist with no auth user", async () => {
    // Seed-data artists have a slug but no user_id, and
    // `.eq("artist_user_id", null)` is not the same query as "skip this".
    counts = { "analytics_events|artist_slug=seed|event_type=profile_view": 4 };
    const totals = await artistTotals({ from: fromMock } as never, { slug: "seed", userId: null });
    expect(totals).toEqual({ views: 4, placements: 0, sales: 0, enquiries: 0 });
  });

  it("does not fail the whole call when one count errors", async () => {
    // A dashboard must not 500 because one aggregate is unavailable, but a
    // failed count must not be silently indistinguishable from a real zero
    // either, hence the log inside the helper.
    fromMock.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ count: null, error: { message: "permission denied" } }).then(resolve);
      return chain;
    });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      artistTotals({ from: fromMock } as never, { slug: "maya", userId: "u1" }),
    ).resolves.toEqual(EMPTY_ARTIST_TOTALS);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe("the manual cache is gone (K5)", () => {
  it("has deleted the writer and the admin route that was its only caller", () => {
    expect(existsSync("src/lib/stats-cache.ts")).toBe(false);
    expect(existsSync("src/app/api/admin/refresh-stats/route.ts")).toBe(false);
  });

  it("has no surface reading a cached total_* column for display", async () => {
    // The two that did — the artist dashboard and the public artist profile —
    // count live now. The transform still maps the columns onto the public
    // Artist shape for LIST endpoints, where counting per artist would be an
    // N+1; that is named in a comment there and recorded as an owner item.
    const files = await sourceFiles(path.join(process.cwd(), "src"));
    const ALLOWED = [path.join("src", "lib", "db", "artist-profiles-transform.ts")];
    const offenders = files.filter((f) => {
      if (ALLOWED.includes(f)) return false;
      const src = readFileSync(f, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      // Member access specifically: `profile.total_views`. A JSON response key
      // of the same name (api/stats/public reports a SITE-wide
      // `total_placements`, counted live) and the string literals in the
      // server-owned denylist are not reads of the artist column.
      return /\.\s*(?:total_views|total_placements|total_sales|total_enquiries)\b/.test(src);
    });
    expect(offenders).toEqual([]);
  });
});

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await sourceFiles(full)));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(path.relative(process.cwd(), full));
    }
  }
  return out.sort();
}
