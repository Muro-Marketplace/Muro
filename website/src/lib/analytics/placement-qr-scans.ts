// Per-placement QR scan counts.
//
// E17. The portal's placement rows carried a "QR scans" figure computed inline
// in `api/placements`, and it was near-guaranteed to be zero, because both of
// its predicates compared the wrong pair of things:
//
//   e.venue_name !== p.venue_slug   // display name vs slug: "The Curzon" vs "the-curzon"
//   e.work_id    !== p.work_title   // a uuid vs a human title
//
// `analytics_events.venue_name` is the venue's DISPLAY name, written by
// `api/qr/[slug]` from `venue_profiles.name`, and `work_id` has been a real
// `artist_works.id` since the `w=` param landed. So any scan from a modern QR
// label failed both tests and was thrown away, and the number an artist saw
// against a live placement was 0 while their analytics page showed the scans.
//
// This module is the one definition, and it attributes the way
// `api/analytics/venue` does: `venue_user_id` first, falling back to the
// display name for labels printed before user-id resolution existed.
//
// Work-level attribution handles both eras of label:
//   - modern: `work_id` is an `artist_works.id`, resolved here to its title;
//   - legacy: `work_id` IS the title, so it is compared as one;
//   - portfolio scans carry no `work_id` and count toward every placement of
//     that artist at that venue, which is what a portfolio scan means.

import type { SupabaseClient } from "@supabase/supabase-js";

/** The placement columns this needs. A superset is fine, `placements` rows fit. */
export interface PlacementScanSubject {
  id: string;
  artist_slug?: string | null;
  /** Preferred venue key. Matches `analytics_events.venue_user_id`. */
  venue_user_id?: string | null;
  /** Venue DISPLAY name (`placements.venue`). Matches legacy `venue_name` events. */
  venue?: string | null;
  work_title?: string | null;
  extra_works?: Array<{ title?: string | null }> | null;
}

interface ScanEvent {
  artist_slug: string | null;
  venue_user_id: string | null;
  venue_name: string | null;
  work_id: string | null;
}

function titlesOf(p: PlacementScanSubject): Set<string> {
  const titles = new Set<string>();
  if (p.work_title) titles.add(p.work_title.trim().toLowerCase());
  for (const extra of p.extra_works || []) {
    if (extra?.title) titles.add(extra.title.trim().toLowerCase());
  }
  return titles;
}

/**
 * Count qr_scan events per placement id.
 *
 * Returns a map keyed by placement id, with an entry for every placement passed
 * in (0 where nothing matched, so callers do not have to distinguish "no scans"
 * from "not counted"). An analytics failure logs and yields all-zero rather than
 * throwing: a broken telemetry read must not take the placements list down.
 */
export async function placementQrScanCounts(
  db: SupabaseClient,
  placements: PlacementScanSubject[],
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const p of placements) counts[p.id] = 0;

  const artistSlugs = Array.from(
    new Set(placements.map((p) => p.artist_slug).filter((s): s is string => !!s)),
  );
  if (artistSlugs.length === 0) return counts;

  const { data, error } = await db
    .from("analytics_events")
    .select("artist_slug, venue_user_id, venue_name, work_id")
    .eq("event_type", "qr_scan")
    .in("artist_slug", artistSlugs);
  if (error) {
    console.error("[placement-qr-scans] scan query failed:", error.message);
    return counts;
  }
  const events = (data || []) as ScanEvent[];
  if (events.length === 0) return counts;

  // Resolve the work ids the events carry to titles, so a modern event can be
  // compared against a placement that only knows the title.
  const workIds = Array.from(
    new Set(events.map((e) => e.work_id).filter((id): id is string => !!id)),
  );
  const titleByWorkId = new Map<string, string>();
  if (workIds.length > 0) {
    const { data: works } = await db
      .from("artist_works")
      .select("id, title")
      .in("id", workIds);
    for (const w of (works || []) as Array<{ id: string; title: string | null }>) {
      if (w.title) titleByWorkId.set(w.id, w.title.trim().toLowerCase());
    }
  }

  for (const p of placements) {
    if (!p.artist_slug) continue;
    const titles = titlesOf(p);
    let n = 0;
    for (const e of events) {
      if (e.artist_slug !== p.artist_slug) continue;

      // Venue. user_id when the event has one, display name for legacy labels.
      // A placement with neither key falls back to artist-level attribution,
      // which is the old best-effort behaviour and still better than dropping.
      if (p.venue_user_id || p.venue) {
        const byUserId = !!p.venue_user_id && e.venue_user_id === p.venue_user_id;
        const byName = !!p.venue && !!e.venue_name && e.venue_name === p.venue;
        if (!byUserId && !byName) continue;
      }

      // Work. A scan with no work_id is a portfolio scan at this venue and
      // belongs to the placement; anything else has to name one of its works.
      if (e.work_id && titles.size > 0) {
        const resolved = titleByWorkId.get(e.work_id) ?? e.work_id.trim().toLowerCase();
        if (!titles.has(resolved)) continue;
      }

      n += 1;
    }
    counts[p.id] = n;
  }

  return counts;
}
