import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { createNotification } from "@/lib/notifications";
import { z } from "zod";

const addSchema = z.object({
  url: z.string().url().max(2000),
  caption: z.string().max(500).optional(),
});

// POST /api/placements/[id]/photos, record an uploaded photo against a placement.
// Caller is expected to upload the image via uploadImage() first and pass the URL.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid photo" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const { data: placement } = await db
    .from("placements")
    .select("artist_user_id, venue_user_id")
    .eq("id", id)
    .single();

  if (!placement) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (placement.artist_user_id !== auth.user!.id && placement.venue_user_id !== auth.user!.id) {
    return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  }

  const { data, error } = await db
    .from("placement_photos")
    .insert({
      placement_id: id,
      uploader_user_id: auth.user!.id,
      url: parsed.data.url,
      caption: parsed.data.caption || "",
    })
    .select()
    .single();

  if (error) {
    console.error("placement_photos insert:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }

  // Bell notification to the other party, the uploader knows they
  // just added a photo, but the counterparty wants to see the new
  // documentation land in their inbox.
  const otherUserId =
    auth.user!.id === placement.artist_user_id
      ? placement.venue_user_id
      : placement.artist_user_id;
  if (otherUserId) {
    createNotification({
      userId: otherUserId,
      kind: "placement_photo_added",
      title: "New placement photo",
      body: parsed.data.caption ? parsed.data.caption.slice(0, 80) : "A photo was added to your placement",
      link: `/placements/${encodeURIComponent(id)}`,
    }).catch((err) => console.warn("[photos] notification failed:", err));
  }

  return NextResponse.json({ photo: data });
}

// DELETE /api/placements/[id]/photos?photoId=..., delete a photo the caller uploaded
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const { id } = await context.params;
  const url = new URL(request.url);
  const photoId = url.searchParams.get("photoId");
  if (!photoId) return NextResponse.json({ error: "photoId required" }, { status: 400 });

  const db = getSupabaseAdmin();
  const { data: photo } = await db
    .from("placement_photos")
    .select("uploader_user_id, placement_id")
    .eq("id", photoId)
    .single();

  if (!photo || photo.placement_id !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (photo.uploader_user_id !== auth.user!.id) {
    return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  }

  const { error } = await db.from("placement_photos").delete().eq("id", photoId);
  if (error) {
    console.error("placement_photos delete:", error);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
