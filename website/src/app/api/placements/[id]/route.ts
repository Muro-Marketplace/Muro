import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";

// GET /api/placements/[id] — fetch a single placement with linked record, photos,
// venue + artist profile info. RLS-gated: only the artist or venue party can read.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const { id } = await context.params;
  if (!id || id.length > 100) {
    return NextResponse.json({ error: "Valid id required" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const { data: placement, error } = await db
    .from("placements")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !placement) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isParty =
    placement.artist_user_id === auth.user!.id || placement.venue_user_id === auth.user!.id;
  if (!isParty) {
    return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  }

  // Compute earned revenue (re-use same approach as the list endpoint)
  const revenueCol = placement.venue_user_id === auth.user!.id ? "venue_revenue" : "artist_revenue";
  const { data: orderRows } = await db
    .from("orders")
    .select(`${revenueCol}`)
    .eq("placement_id", id);
  const revenueEarned = (orderRows || []).reduce(
    (sum, r) => sum + (Number((r as Record<string, unknown>)[revenueCol]) || 0),
    0,
  );

  const { data: record } = await db
    .from("placement_records")
    .select("*")
    .eq("placement_id", id)
    .maybeSingle();

  const { data: photos } = await db
    .from("placement_photos")
    .select("*")
    .eq("placement_id", id)
    .order("created_at", { ascending: false });

  // Friendly names for the UI
  const [{ data: artistProfile }, { data: venueProfile }] = await Promise.all([
    placement.artist_user_id
      ? db.from("artist_profiles").select("name, slug, image").eq("user_id", placement.artist_user_id).single()
      : Promise.resolve({ data: null }),
    placement.venue_user_id
      ? db.from("venue_profiles").select("name, slug, image, location, city").eq("user_id", placement.venue_user_id).single()
      : Promise.resolve({ data: null }),
  ]);

  // Override requester_user_id with the sender of the most recent
  // counter message (if any). The counter flow writes this via
  // metadata.requesterUserId; the placements row column can lag
  // behind if the update hit an older schema, so the messages are
  // the authoritative source for "who currently owes a response."
  let effectiveRequesterId: string | null = placement.requester_user_id || null;
  try {
    const { data: reqMsgs } = await db
      .from("messages")
      .select("sender_id, metadata, created_at")
      .eq("message_type", "placement_request")
      .order("created_at", { ascending: false })
      .limit(50);
    for (const m of (reqMsgs || []) as Array<{ sender_id: string | null; metadata: Record<string, unknown> | null; created_at: string }>) {
      if (m.metadata?.placementId !== id) continue;
      if (m.metadata?.counter === true) {
        const sender = (m.metadata?.requesterUserId as string | undefined) || m.sender_id;
        if (sender) {
          effectiveRequesterId = sender;
          break; // newest first
        }
      }
    }
  } catch { /* non-fatal */ }

  return NextResponse.json({
    placement: {
      ...placement,
      requester_user_id: effectiveRequesterId,
      revenue_earned_gbp: Math.round(revenueEarned * 100) / 100,
    },
    record: record || null,
    photos: photos || [],
    artist: artistProfile || null,
    venue: venueProfile || null,
    viewerRole: placement.artist_user_id === auth.user!.id ? "artist" : "venue",
  });
}
