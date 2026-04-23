import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/placements/[id]/history — chronological list of
// placement_request and placement_response messages that reference
// this placement, used by the negotiation log.
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const { id } = await context.params;
  if (!id || id.length > 100) {
    return NextResponse.json({ error: "Valid id required" }, { status: 400 });
  }

  const db = getSupabaseAdmin();

  // Only parties on the placement can read its history.
  const { data: placement } = await db
    .from("placements")
    .select("artist_user_id, venue_user_id")
    .eq("id", id)
    .single();
  if (!placement) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (placement.artist_user_id !== auth.user!.id && placement.venue_user_id !== auth.user!.id) {
    return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  }

  // Postgres JSON contains — metadata->>placementId = id. Supabase's
  // .contains() drives the query server-side without pulling every
  // placement_request/response message back.
  const { data: msgs, error } = await db
    .from("messages")
    .select("id, created_at, message_type, sender_name, sender_type, content, metadata")
    .in("message_type", ["placement_request", "placement_response"])
    .contains("metadata", { placementId: id })
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    console.error("Negotiation log fetch error:", error);
    return NextResponse.json({ entries: [] });
  }

  return NextResponse.json({ entries: msgs || [] });
}
