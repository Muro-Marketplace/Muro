/**
 * /api/walls/saved-works
 *
 * GET — works the calling user has bookmarked (`saved_items` with
 * `item_type === 'work'`), resolved to full artwork rows so the wall
 * visualizer panel can show titles, images, dimensions and pricing.
 *
 * Empty list (status 200) when the user has no saved works yet, or
 * when the feature flag is off — keeps the editor's loading state
 * predictable.
 */

import { NextResponse } from "next/server";
import { isFlagOn } from "@/lib/feature-flags";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

interface ArtistWorkRow {
  id: string;
  title: string | null;
  image: string | null;
  dimensions: string | null;
  pricing: unknown;
  orientation: string | null;
  artist_id: string | null;
}

export async function GET(request: Request) {
  if (!isFlagOn("WALL_VISUALIZER_V1")) {
    return NextResponse.json({ works: [] });
  }
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const db = getSupabaseAdmin();

  // 1. Pull the user's saved-work IDs.
  const { data: savedRows, error: sErr } = await db
    .from("saved_items")
    .select("item_id, created_at")
    .eq("user_id", auth.user!.id)
    .eq("item_type", "work")
    .order("created_at", { ascending: false });

  if (sErr) {
    console.error("[saved-works] saved_items query failed:", sErr.message);
    return NextResponse.json({ works: [] });
  }

  const savedIds = (savedRows ?? [])
    .map((r) => (r as { item_id: string }).item_id)
    .filter((x) => typeof x === "string" && x.length > 0);

  if (savedIds.length === 0) {
    return NextResponse.json({ works: [] });
  }

  // 2. Resolve to artwork rows.
  const { data: works } = await db
    .from("artist_works")
    .select("id, title, image, dimensions, pricing, orientation, artist_id")
    .in("id", savedIds);

  const rows = (works ?? []) as ArtistWorkRow[];
  if (rows.length === 0) return NextResponse.json({ works: [] });

  // 3. Resolve artist names via artist_profiles (artist_id → user_id → name).
  const artistIds = Array.from(
    new Set(rows.map((r) => r.artist_id).filter((x): x is string => !!x)),
  );
  const artistNameByProfileId: Record<string, string> = {};
  if (artistIds.length > 0) {
    const { data: profiles } = await db
      .from("artist_profiles")
      .select("id, name")
      .in("id", artistIds);
    for (const row of (profiles ?? []) as Array<{
      id: string;
      name: string | null;
    }>) {
      if (row.name) artistNameByProfileId[row.id] = row.name;
    }
  }

  // 4. Preserve the saved-order (most-recent-first) by re-ordering.
  const indexById = new Map(savedIds.map((id, i) => [id, i]));
  rows.sort((a, b) => {
    const ai = indexById.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bi = indexById.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return ai - bi;
  });

  const out = rows
    .filter((r) => !!r.image)
    .map((r) => ({
      id: r.id,
      title: r.title ?? "Untitled",
      image: r.image!,
      dimensions: r.dimensions ?? undefined,
      pricing: r.pricing,
      orientation: r.orientation ?? undefined,
      artistName: r.artist_id ? artistNameByProfileId[r.artist_id] : undefined,
    }));

  return NextResponse.json({ works: out });
}
