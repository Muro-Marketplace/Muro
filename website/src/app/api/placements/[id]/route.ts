import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";

// GET /api/placements/[id], fetch a single placement with linked record, photos,
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
      ? db.from("artist_profiles").select("name, slug, image:profile_image").eq("user_id", placement.artist_user_id).single()
      : Promise.resolve({ data: null }),
    placement.venue_user_id
      ? db.from("venue_profiles").select("name, slug, image, location, city").eq("user_id", placement.venue_user_id).single()
      : Promise.resolve({ data: null }),
  ]);

  // Resolve who currently "owns" the request, i.e. who made the latest
  // offer and is therefore awaiting a response. Precedence:
  //   1. Latest counter message sender (most recent acts).
  //   2. The placements.proposed_by_user_id column. (F29: this used to read
  //      placement.requester_user_id, a phantom column no migration ever
  //      created, so the column path was ALWAYS null and every row leaned
  //      on the message scan.)
  //   3. The original placement_request message sender (used when the
  //      column is NULL because the row predates proposed_by_user_id
  //      being written). Without this fallback, a brand-new pending row
  //      with a NULL column reads as `null !== userId` true for
  //      everyone, and the original sender sees their own
  //      Accept/Decline buttons. That was the "first request you can
  //      accept your own" bug.
  let effectiveRequesterId: string | null = placement.proposed_by_user_id || null;
  let firstRequester: string | null = null;
  try {
    // F29: scoped to THIS placement's messages via the jsonb metadata,
    // instead of scanning the latest 50 placement_request messages
    // platform-wide and filtering after, which stopped resolving as soon
    // as 50 newer requests existed anywhere on the platform.
    const { data: reqMsgs } = await db
      .from("messages")
      .select("sender_id, metadata, created_at")
      .eq("message_type", "placement_request")
      .contains("metadata", { placementId: id })
      .order("created_at", { ascending: false })
      .limit(50);
    let counterFound = false;
    for (const m of (reqMsgs || []) as Array<{ sender_id: string | null; metadata: Record<string, unknown> | null; created_at: string }>) {
      if (m.metadata?.placementId !== id) continue;
      if (!counterFound && m.metadata?.counter === true) {
        const sender = (m.metadata?.requesterUserId as string | undefined) || m.sender_id;
        if (sender) {
          effectiveRequesterId = sender;
          counterFound = true;
        }
      }
      // The list is newest-first; track every match so the last seen
      // (oldest) becomes the original requester for the fallback path.
      const senderForFallback = (m.metadata?.requesterUserId as string | undefined) || m.sender_id;
      if (senderForFallback) firstRequester = senderForFallback;
    }
  } catch { /* non-fatal */ }
  if (!effectiveRequesterId && firstRequester) {
    effectiveRequesterId = firstRequester;
  }

  // Version log for the loan/consignment record. Best-effort: if the
  // migration hasn't been applied (033), this just returns empty.
  let recordVersions: Array<Record<string, unknown>> = [];
  try {
    const { data: versionRows } = await db
      .from("placement_record_versions")
      .select("id, changed_by_user_id, changed_by_role, changed_fields, snapshot, created_at")
      .eq("placement_id", id)
      .order("created_at", { ascending: false })
      .limit(30);
    recordVersions = (versionRows as Array<Record<string, unknown>>) || [];
  } catch { /* table doesn't exist yet, ignore */ }

  return NextResponse.json({
    placement: {
      ...placement,
      requester_user_id: effectiveRequesterId,
      revenue_earned_gbp: Math.round(revenueEarned * 100) / 100,
    },
    record: record || null,
    recordVersions,
    photos: photos || [],
    artist: artistProfile || null,
    venue: venueProfile || null,
    viewerRole: placement.artist_user_id === auth.user!.id ? "artist" : "venue",
  });
}
