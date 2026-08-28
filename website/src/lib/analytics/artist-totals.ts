// The one definition of an artist's headline totals.
//
// K5 (07 §5). There were two, and they disagreed by construction:
//
//   A  cached `artist_profiles.total_views / total_placements / total_sales /
//      total_enquiries`, read by the artist dashboard and by the public artist
//      shape;
//   B  a live aggregation over `analytics_events`, computed by
//      api/analytics/artist.
//
// The brief guessed the columns were dead. They are not — `stats-cache.ts`
// writes them, computing exactly the same numbers with exactly the same
// predicates. The defect is WHEN: its only caller was a manual admin POST that
// no cron ever hit, so the columns hold whatever the last human-triggered
// refresh computed, which for almost every artist is the column default.
//
// Measured against prod on 2026-08-28: **2,295 profile_view events across 54
// artists, and 1 of 14 artist_profiles rows with a non-zero total_views**. So an
// artist's dashboard said 0 views while their analytics page said 9, on the same
// account on the same day. That is Bug 13, and it was not an edge case.
//
// Not a dead column: a write-once-by-accident column. This module is the single
// aggregation both surfaces now read.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ArtistTotals {
  /** `profile_view` events against this artist's slug. */
  views: number;
  /** Placements currently `active`. */
  placements: number;
  /** Placements that reached `completed`. */
  sales: number;
  /** Rows in `enquiries` against this artist's slug. */
  enquiries: number;
}

export const EMPTY_ARTIST_TOTALS: ArtistTotals = {
  views: 0,
  placements: 0,
  sales: 0,
  enquiries: 0,
};

/**
 * Count an artist's headline totals live.
 *
 * The predicates are lifted verbatim from `stats-cache.ts`, which is the point:
 * they were already identical to the live aggregation, so nothing about the
 * numbers changes, only how fresh they are.
 *
 * Four `head: true` counts, so no rows cross the wire. At current scale (14
 * artists, ~2.3k events) this is nothing; if `analytics_events` ever passes
 * ~10^6 rows, replace it with a materialised view that has a defined refresh,
 * not with hand-updated columns.
 */
export async function artistTotals(
  db: SupabaseClient,
  artist: { slug: string; userId?: string | null },
): Promise<ArtistTotals> {
  const [views, placements, sales, enquiries] = await Promise.all([
    count(db, (q) =>
      q.from("analytics_events").select("id", { count: "exact", head: true })
        .eq("artist_slug", artist.slug)
        .eq("event_type", "profile_view"),
    ),
    artist.userId
      ? count(db, (q) =>
          q.from("placements").select("id", { count: "exact", head: true })
            .eq("artist_user_id", artist.userId)
            .eq("status", "active"),
        )
      : Promise.resolve(0),
    artist.userId
      ? count(db, (q) =>
          q.from("placements").select("id", { count: "exact", head: true })
            .eq("artist_user_id", artist.userId)
            .eq("status", "completed"),
        )
      : Promise.resolve(0),
    count(db, (q) =>
      q.from("enquiries").select("id", { count: "exact", head: true })
        .eq("artist_slug", artist.slug),
    ),
  ]);

  return { views, placements, sales, enquiries };
}

/**
 * Run a count query and return 0 on failure.
 *
 * Zero-on-failure is right for a display total and wrong for anything else: a
 * failed count must not crash a dashboard, but it must not be mistaken for a
 * real zero either, hence the log.
 */
async function count(
  db: SupabaseClient,
  build: (db: SupabaseClient) => PromiseLike<{ count: number | null; error: { message: string } | null }>,
): Promise<number> {
  const { count: n, error } = await build(db);
  if (error) {
    console.error("[artist-totals] count failed:", error.message);
    return 0;
  }
  return n ?? 0;
}
