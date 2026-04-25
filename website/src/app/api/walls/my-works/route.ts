/**
 * /api/walls/my-works
 *
 * GET — works currently on display at the calling user's venue.
 *
 * Source of truth: `placements` rows where the venue is `me` and the
 * placement is in an "on the wall" state. We pull the matching
 * `artist_works` rows in a second query so we get full pricing data
 * (the placements row only stores a denormalised work_image + work_title).
 *
 * Returned shape mirrors what /api/artist-works and /api/browse-artists
 * emit so the front-end's normaliseWork helper can map any of them.
 *
 * Empty list (status 200) when:
 *   - User has no placements yet
 *   - User isn't a venue
 *   - Feature flag is off (silently empty rather than 404 — keeps the
 *     editor UX predictable; the page-level flag check has already
 *     gated visit).
 */

import { NextResponse } from "next/server";
import { isFlagOn } from "@/lib/feature-flags";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

interface PlacementRow {
  id: string;
  work_id: string | null;
  work_title: string | null;
  work_image: string | null;
  status: string | null;
  artist_user_id: string | null;
  artist_slug: string | null;
}

interface ArtistWorkRow {
  id: string;
  title: string | null;
  image: string | null;
  dimensions: string | null;
  pricing: unknown;
  orientation?: string | null;
}

interface WorkResponse {
  id: string;
  title: string;
  image: string;
  dimensions?: string;
  pricing?: unknown;
  artistName?: string;
  orientation?: string;
}

export async function GET(request: Request) {
  if (!isFlagOn("WALL_VISUALIZER_V1")) {
    return NextResponse.json({ works: [] });
  }
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const db = getSupabaseAdmin();

  // 1. Pull the venue's "currently on the wall" placements.
  //    `status === 'active'` covers accepted-but-not-yet-installed AND
  //    installed/live — venues planning the install want both.
  const { data: placements, error: pErr } = await db
    .from("placements")
    .select(
      "id, work_id, work_title, work_image, status, artist_user_id, artist_slug",
    )
    .eq("venue_user_id", auth.user!.id)
    .eq("status", "active");

  if (pErr) {
    console.error("[my-works] placements query failed:", pErr.message);
    return NextResponse.json({ works: [] });
  }

  const rows = (placements ?? []) as PlacementRow[];
  if (rows.length === 0) {
    return NextResponse.json({ works: [] });
  }

  // 2. Resolve work data — prefer artist_works rows when work_id matches.
  const workIds = Array.from(
    new Set(rows.map((r) => r.work_id).filter((x): x is string => !!x)),
  );
  const worksById: Record<string, ArtistWorkRow> = {};
  if (workIds.length > 0) {
    const { data: works } = await db
      .from("artist_works")
      .select("id, title, image, dimensions, pricing, orientation")
      .in("id", workIds);
    for (const row of (works ?? []) as ArtistWorkRow[]) {
      worksById[row.id] = row;
    }
  }

  // 3. Build artist-name lookup so the panel can show "Title — by Artist"
  //    if the venue has many artists displayed.
  const artistIds = Array.from(
    new Set(
      rows.map((r) => r.artist_user_id).filter((x): x is string => !!x),
    ),
  );
  const artistNameById: Record<string, string> = {};
  if (artistIds.length > 0) {
    const { data: profiles } = await db
      .from("artist_profiles")
      .select("user_id, name")
      .in("user_id", artistIds);
    for (const row of (profiles ?? []) as Array<{
      user_id: string;
      name: string | null;
    }>) {
      if (row.name) artistNameById[row.user_id] = row.name;
    }
  }

  // 4. Build the response.
  const out: WorkResponse[] = [];
  const seenIds = new Set<string>();
  for (const p of rows) {
    const work = p.work_id ? worksById[p.work_id] : undefined;
    const id = p.work_id ?? p.id;
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    // Prefer the artist_works data; fall back to the denormalised
    // values on the placement row if the work was deleted.
    const title = work?.title ?? p.work_title ?? "Untitled";
    const image = work?.image ?? p.work_image ?? null;
    if (!image) continue; // can't preview without an image

    out.push({
      id,
      title,
      image,
      dimensions: work?.dimensions ?? undefined,
      pricing: work?.pricing,
      orientation: work?.orientation ?? undefined,
      artistName: p.artist_user_id
        ? artistNameById[p.artist_user_id]
        : undefined,
    });
  }

  return NextResponse.json({ works: out });
}
