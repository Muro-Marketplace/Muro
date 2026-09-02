import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { assertNotDemo } from "@/lib/demo-guard";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getArtistProfileByUserId } from "@/lib/db/artist-profiles";
import { resolveSubscription } from "@/lib/subscriptions";
import { canFeatureArtwork, featuredUntilFrom, isArtworkOfTheWeek } from "@/lib/tier-features";

/**
 * POST /api/artist-works/[id]/feature
 *
 * Artwork of the Week (owner decision 2026-09-02). Premium and Pro artists
 * push one of their own works to the top of the /browse gallery for seven
 * days. One live boost per artist; a boost cannot be ended early, but an
 * expired one can be replaced at once. `featured_until` is server-owned:
 * this is the only writer.
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

  // One live boost per artist. Ownership is enforced by artist_id in every
  // query below (service-role client bypasses RLS).
  const { data: mine, error: listErr } = await db
    .from("artist_works")
    .select("id, featured_until")
    .eq("artist_id", result.profile.id);
  if (listErr) return NextResponse.json({ error: "Could not read your works" }, { status: 500 });
  const live = (mine || []).find(
    (w: { id: string; featured_until: string | null }) => w.id !== id && isArtworkOfTheWeek(w.featured_until, now),
  );
  if (live) {
    return NextResponse.json(
      { error: "You already have an Artwork of the Week running.", code: "boost_live", workId: live.id, featuredUntil: live.featured_until },
      { status: 409 },
    );
  }

  const featuredUntil = featuredUntilFrom(now).toISOString();
  const { data: updated, error } = await db
    .from("artist_works")
    .update({ featured_until: featuredUntil })
    .eq("id", id)
    .eq("artist_id", result.profile.id)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Could not feature this work" }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "Work not found" }, { status: 404 });

  return NextResponse.json({ featuredUntil });
}
