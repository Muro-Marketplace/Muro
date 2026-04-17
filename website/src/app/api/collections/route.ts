import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";

// GET: fetch collections for the authenticated artist
export async function GET(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const db = getSupabaseAdmin();

    // Get artist profile by user_id
    const { data: profile } = await Promise.resolve(
      db.from("artist_profiles").select("id, slug").eq("user_id", auth.user!.id).single()
    );

    if (!profile) {
      return NextResponse.json({ collections: [] });
    }

    // Try to query artist_collections table
    try {
      const { data, error } = await Promise.resolve(
        db
          .from("artist_collections")
          .select("*")
          .eq("artist_id", profile.id)
          .order("created_at", { ascending: false })
      );

      if (error) {
        // Table may not exist yet — return empty
        console.error("Collections query error (table may not exist):", error.message);
        return NextResponse.json({ collections: [] });
      }

      return NextResponse.json({ collections: data || [] });
    } catch {
      // Table doesn't exist — return empty gracefully
      return NextResponse.json({ collections: [] });
    }
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// POST: create a new collection
export async function POST(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const { name, description, bundlePrice, workIds } = await request.json();

    if (!name || !workIds || workIds.length < 2) {
      return NextResponse.json(
        { error: "name and at least 2 workIds are required" },
        { status: 400 }
      );
    }

    const db = getSupabaseAdmin();

    // Get artist profile
    const { data: profile } = await Promise.resolve(
      db.from("artist_profiles").select("id, slug").eq("user_id", auth.user!.id).single()
    );

    if (!profile) {
      return NextResponse.json({ error: "Artist profile not found" }, { status: 404 });
    }

    const id = `${profile.slug}-collection-${Date.now()}`;

    const { error } = await Promise.resolve(
      db.from("artist_collections").upsert({
        id,
        artist_id: profile.id,
        artist_slug: profile.slug,
        name,
        description: description || null,
        bundle_price: bundlePrice ? parseFloat(bundlePrice) : null,
        work_ids: workIds,
        available: true,
        created_at: new Date().toISOString(),
      }, { onConflict: "id" })
    );

    if (error) {
      console.error("Collections save error:", error.message);
      return NextResponse.json({ error: "Failed to save collection" }, { status: 500 });
    }

    return NextResponse.json({ success: true, id, dbSaved: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// DELETE: remove a collection
export async function DELETE(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id query param is required" }, { status: 400 });
    }

    const db = getSupabaseAdmin();

    // Get artist profile
    const { data: profile } = await Promise.resolve(
      db.from("artist_profiles").select("id").eq("user_id", auth.user!.id).single()
    );

    if (!profile) {
      return NextResponse.json({ error: "Artist profile not found" }, { status: 404 });
    }

    // Try to delete from artist_collections table
    try {
      const { error } = await Promise.resolve(
        db
          .from("artist_collections")
          .delete()
          .eq("id", id)
          .eq("artist_id", profile.id)
      );

      if (error) {
        console.error("Collections delete error (table may not exist):", error.message);
        return NextResponse.json({ success: true, dbDeleted: false });
      }

      return NextResponse.json({ success: true, dbDeleted: true });
    } catch {
      return NextResponse.json({ success: true, dbDeleted: false });
    }
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
