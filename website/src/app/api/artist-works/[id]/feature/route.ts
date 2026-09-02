import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { assertNotDemo } from "@/lib/demo-guard";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getArtistProfileByUserId } from "@/lib/db/artist-profiles";
import { resolveSubscription } from "@/lib/subscriptions";
import { canFeatureArtwork, featuredUntilFrom } from "@/lib/tier-features";

/**
 * POST /api/artist-works/[id]/feature
 *
 * Artwork of the Week (owner decision 2026-09-02). Premium and Pro artists
 * push one of their own works to the top of the /browse gallery for seven
 * days. One live boost per artist, decided and written atomically by
 * feature_artist_work() (migration 134) under a per-artist advisory lock, so
 * two concurrent requests cannot both pass the check and both write.
 * `featured_until` is server-owned: this is the only writer.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;
  // Same pattern as POST /api/artist-works: a demo session gets a soft 200
  // here, before any row is read or written, so touring the demo never
  // actually sets featured_until.
  const demoResp = assertNotDemo(auth.user!.id);
  if (demoResp) return demoResp;
  const { id } = await params;

  const result = await getArtistProfileByUserId(auth.user!.id);
  if (!result) return NextResponse.json({ error: "Artist profile not found" }, { status: 404 });

  const sub = await resolveSubscription(auth.user!.id);
  if (!sub.active || !canFeatureArtwork(sub.plan)) {
    return NextResponse.json(
      { error: "Artwork of the Week is included with Premium and Pro.", code: "plan_required" },
      { status: 403 },
    );
  }

  const db = getSupabaseAdmin();
  const now = new Date();
  const featuredUntil = featuredUntilFrom(now).toISOString();

  // One live boost per artist, decided and written under the per-artist
  // advisory lock inside feature_artist_work() (migration 134), so two
  // concurrent requests cannot both pass the check. Ownership is enforced in
  // the function too: the UPDATE matches artist_id, so someone else's work id
  // comes back not_found rather than being written.
  const { data, error } = await db.rpc("feature_artist_work", {
    p_artist_id: result.profile.id,
    p_work_id: id,
    p_now: now.toISOString(),
    p_until: featuredUntil,
  });
  if (error) return NextResponse.json({ error: "Could not feature this work" }, { status: 500 });

  const row = (Array.isArray(data) ? data[0] : data) as
    | { outcome: string; live_work_id: string | null; live_until: string | null }
    | null
    | undefined;
  if (!row || row.outcome === "not_found") {
    return NextResponse.json({ error: "Work not found" }, { status: 404 });
  }
  if (row.outcome === "boost_live") {
    return NextResponse.json(
      { error: "You already have an Artwork of the Week running.", code: "boost_live", workId: row.live_work_id, featuredUntil: row.live_until },
      { status: 409 },
    );
  }
  if (row.outcome !== "featured") {
    return NextResponse.json({ error: "Could not feature this work" }, { status: 500 });
  }

  return NextResponse.json({ featuredUntil });
}
