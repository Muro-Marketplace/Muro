import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser, withAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { FOUNDING_ARTIST_LIMIT } from "@/lib/pricing";

export async function GET(request: Request) {
  const { error } = await getAdminUser(request);
  if (error) return error;

  try {
    const { data, error: dbError } = await getSupabaseAdmin()
      .from("artist_profiles")
      .select("id, user_id, slug, name, primary_medium, location, created_at")
      .order("created_at", { ascending: false });

    if (dbError) throw dbError;

    return NextResponse.json({ artists: data || [] });
  } catch (err) {
    console.error("Admin artists error:", err);
    return NextResponse.json({ error: "Failed to fetch artists" }, { status: 500 });
  }
}

const patchSchema = z.object({
  id: z.string().uuid(),
  is_founding_artist: z.boolean(),
});

// Task 8 / Step 2. `is_founding_artist` sits on ARTIST_PROFILE_SERVER_OWNED
// (lib/db/writable-fields.ts) precisely so no artist-facing route can set it;
// this admin toggle is the only write path. The flyer's "First 20 artists: 6
// months free" claim is only true while this stays the sole path and the
// count guard below holds at FOUNDING_ARTIST_LIMIT.
export async function PATCH(request: Request) {
  return withAdmin(request, "artist_founding_status_updated", async ({ audit }) => {
    const body = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    const { id, is_founding_artist } = parsed.data;

    const db = getSupabaseAdmin();

    const { data: artist, error: fetchError } = await db
      .from("artist_profiles")
      .select("id, is_founding_artist")
      .eq("id", id)
      .maybeSingle<{ id: string; is_founding_artist: boolean | null }>();

    if (fetchError) {
      console.error("Admin artists PATCH fetch error:", fetchError);
      return NextResponse.json({ error: "Failed to load artist" }, { status: 500 });
    }
    if (!artist) {
      return NextResponse.json({ error: "Artist not found" }, { status: 404 });
    }

    // Idempotent no-op: already at the requested value. Returning early here
    // (rather than re-running the count guard) means a retry of an
    // already-founding artist can never be refused by counting its own row.
    // Still audited explicitly: withAdmin logs every 2xx response regardless,
    // so calling audit() here is what keeps that row's context meaningful
    // instead of landing blank.
    if (Boolean(artist.is_founding_artist) === is_founding_artist) {
      audit({ artistId: id, is_founding_artist, noop: true });
      return NextResponse.json({ success: true, is_founding_artist });
    }

    if (is_founding_artist) {
      const { count: foundingCount, error: countError } = await db
        .from("artist_profiles")
        .select("id", { count: "exact", head: true })
        .eq("is_founding_artist", true);
      if (countError) {
        console.error("Admin artists PATCH count error:", countError);
        return NextResponse.json({ error: "Failed to check the founding cohort" }, { status: 500 });
      }
      if ((foundingCount ?? 0) >= FOUNDING_ARTIST_LIMIT) {
        return NextResponse.json(
          { error: `The founding cohort is full (${FOUNDING_ARTIST_LIMIT} artists).` },
          { status: 409 },
        );
      }
    }

    const { error: updateError } = await db
      .from("artist_profiles")
      .update({ is_founding_artist })
      .eq("id", id);

    if (updateError) {
      console.error("Admin artists PATCH update error:", updateError);
      return NextResponse.json({ error: "Failed to update artist" }, { status: 500 });
    }

    audit({ artistId: id, is_founding_artist });
    return NextResponse.json({ success: true, is_founding_artist });
  });
}
