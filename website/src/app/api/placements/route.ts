import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { placementSchema, placementUpdateSchema } from "@/lib/validations";
import { notifyPlacementRequest, notifyPlacementResponse } from "@/lib/email";
import { createNotification } from "@/lib/notifications";
import { z } from "zod";

function deterministicConversationId(slugA: string, slugB: string): string {
  const [a, b] = [slugA, slugB].sort();
  return `placement-${a}__${b}`;
}

/**
 * Determine if the authenticated user is an artist or venue.
 * Returns { type, slug, profile } or null.
 */
async function getUserRole(userId: string) {
  const db = getSupabaseAdmin();
  const { data: artist } = await db
    .from("artist_profiles")
    .select("slug, name, user_id")
    .eq("user_id", userId)
    .single();
  if (artist) return { type: "artist" as const, slug: artist.slug, name: artist.name };

  const { data: venue } = await db
    .from("venue_profiles")
    .select("slug, name, user_id")
    .eq("user_id", userId)
    .single();
  if (venue) return { type: "venue" as const, slug: venue.slug, name: venue.name };

  return null;
}

// GET: fetch placements for the authenticated user (artist or venue)
export async function GET(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const db = getSupabaseAdmin();
    const role = await getUserRole(auth.user!.id);

    if (!role) {
      return NextResponse.json({ placements: [] });
    }

    let query;
    if (role.type === "artist") {
      query = db.from("placements").select("*").eq("artist_user_id", auth.user!.id);
    } else {
      query = db.from("placements").select("*").eq("venue_user_id", auth.user!.id);
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ error: "Failed to fetch placements" }, { status: 500 });
    }

    return NextResponse.json({ placements: data || [], userType: role.type });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// POST: artist or venue creates a placement request
export async function POST(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const { placements, fromVenue, artistSlug: bodyArtistSlug } = body;

    if (!placements || !Array.isArray(placements) || placements.length === 0) {
      return NextResponse.json({ error: "No placements provided" }, { status: 400 });
    }

    const parsed = z.array(placementSchema).safeParse(placements);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid placement data" }, { status: 400 });
    }

    const db = getSupabaseAdmin();
    const role = await getUserRole(auth.user!.id);

    let artistProfile: { user_id: string; slug: string; name: string } | null = null;
    let venueProfile: { user_id: string; slug: string; name: string } | null = null;

    if (fromVenue && role?.type === "venue") {
      // Venue-initiated request: look up artist from body
      const targetArtistSlug = bodyArtistSlug || parsed.data[0].venueSlug;
      const { data: ap } = await db.from("artist_profiles").select("user_id, slug, name").eq("slug", targetArtistSlug).single();
      const { data: vp } = await db.from("venue_profiles").select("user_id, slug, name").eq("user_id", auth.user!.id).single();

      if (!ap) return NextResponse.json({ error: "Artist not found" }, { status: 400 });
      if (!vp) return NextResponse.json({ error: "Venue profile not found" }, { status: 400 });

      artistProfile = ap;
      venueProfile = vp;
    } else {
      // Artist-initiated request: look up venue from venueSlug
      const { data: ap } = await db.from("artist_profiles").select("user_id, slug, name").eq("user_id", auth.user!.id).single();
      if (!ap) return NextResponse.json({ error: "Artist profile not found" }, { status: 400 });

      const venueSlug = parsed.data[0].venueSlug;
      if (!venueSlug) return NextResponse.json({ error: "Venue selection required" }, { status: 400 });

      const { data: vp } = await db.from("venue_profiles").select("user_id, slug, name").eq("slug", venueSlug).single();
      if (!vp) return NextResponse.json({ error: "Venue not found" }, { status: 400 });

      artistProfile = ap;
      venueProfile = vp;
    }

    if (artistProfile.user_id === venueProfile.user_id) {
      return NextResponse.json(
        { error: "You cannot create a placement between your own artist and venue profiles" },
        { status: 400 }
      );
    }

    // Build rows with new columns, fall back to base columns if they don't exist
    const baseRows = parsed.data.map((p) => ({
      id: p.id,
      artist_user_id: artistProfile!.user_id,
      work_title: p.workTitle,
      work_image: p.workImage || null,
      venue: venueProfile!.name,
      arrangement_type: p.type,
      revenue_share_percent: p.revenueSharePercent || null,
      status: "pending",
      revenue: null,
      notes: p.notes || null,
      created_at: new Date().toISOString(),
    }));

    const fullRows = baseRows.map((row, i) => ({
      ...row,
      artist_slug: artistProfile!.slug,
      venue_user_id: venueProfile!.user_id,
      venue_slug: venueProfile!.slug,
      message: parsed.data[i].message || null,
      qr_enabled: parsed.data[i].qrEnabled ?? true,
      monthly_fee_gbp: parsed.data[i].monthlyFeeGbp ?? null,
    }));

    let { error } = await db.from("placements").insert(fullRows);

    // If insert failed (likely missing columns), retry with base columns only
    if (error) {
      console.warn("Placement insert failed with new columns, retrying base-only:", error.message);
      const retry = await db.from("placements").insert(baseRows);
      error = retry.error;
    }

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ error: "Failed to save placements" }, { status: 500 });
    }

    // Notify the other party by email (fire-and-forget)
    const notifyUserId = fromVenue ? artistProfile!.user_id : venueProfile!.user_id;
    if (notifyUserId) {
      const { data: { user: notifyUser } } = await db.auth.admin.getUserById(notifyUserId);
      if (notifyUser?.email) {
        notifyPlacementRequest({
          email: notifyUser.email,
          venueName: venueProfile!.name,
          artistName: artistProfile!.name,
          workTitles: parsed.data.map((p) => p.workTitle),
          arrangementType: parsed.data[0].type,
          revenueSharePercent: parsed.data[0].revenueSharePercent,
          message: parsed.data[0].message,
        }).catch((err) => { if (err) console.error("Fire-and-forget error:", err); });
      }

      // In-app notification (F9)
      const portalBase = fromVenue ? "/artist-portal" : "/venue-portal";
      const workTitles = parsed.data.map((p) => p.workTitle);
      const workSummary = workTitles.length === 1
        ? workTitles[0]
        : `${workTitles.length} works`;
      const requesterName = fromVenue ? venueProfile!.name : artistProfile!.name;
      createNotification({
        userId: notifyUserId,
        kind: "placement_request",
        title: "New placement request",
        body: `${requesterName} requested a placement for ${workSummary}`,
        link: `${portalBase}/placements`,
      }).catch(() => {});
    }

    // Auto in-app message from requester to recipient (F7)
    try {
      const requesterSlug = fromVenue ? venueProfile!.slug : artistProfile!.slug;
      const recipientSlug = fromVenue ? artistProfile!.slug : venueProfile!.slug;
      const senderType = fromVenue ? "venue" : "artist";
      const workTitles = parsed.data.map((p) => p.workTitle);
      const workLine = workTitles.length === 1
        ? workTitles[0]
        : workTitles.join(", ");
      const arrangementLine = parsed.data[0].type === "revenue_share"
        ? `Revenue share: ${parsed.data[0].revenueSharePercent || 0}% to the venue`
        : parsed.data[0].type === "free_loan"
          ? "Free loan arrangement"
          : "Purchase arrangement";
      const userMessage = (parsed.data[0].message || "").trim();
      const content = [
        `Placement request sent for: ${workLine}`,
        arrangementLine,
        userMessage ? `\n"${userMessage}"` : "",
      ].filter(Boolean).join("\n");

      const cid = deterministicConversationId(requesterSlug, recipientSlug);
      await db.from("messages").insert({
        conversation_id: cid,
        sender_id: auth.user!.id,
        sender_name: requesterSlug,
        sender_type: senderType,
        recipient_slug: recipientSlug,
        content,
        is_read: false,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      console.warn("Auto-message on placement skipped:", err);
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// PATCH: update placement status (artist or venue)
export async function PATCH(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const parsed = placementUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "ID and valid status required" }, { status: 400 });
    }

    const { id, status } = parsed.data;
    const db = getSupabaseAdmin();

    // Fetch the placement
    const { data: existing } = await db
      .from("placements")
      .select("artist_user_id, venue_user_id, artist_slug, venue, status")
      .eq("id", id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Placement not found" }, { status: 404 });
    }

    const isArtist = existing.artist_user_id === auth.user!.id;
    const isVenue = existing.venue_user_id === auth.user!.id;

    if (!isArtist && !isVenue) {
      return NextResponse.json({ error: "Not authorised" }, { status: 403 });
    }

    // Self-accept guard: placements where both parties are the same user cannot be accepted/declined
    if (
      existing.artist_user_id &&
      existing.venue_user_id &&
      existing.artist_user_id === existing.venue_user_id &&
      existing.status === "pending" &&
      (status === "active" || status === "declined")
    ) {
      return NextResponse.json(
        { error: "You cannot accept a placement you created yourself" },
        { status: 400 }
      );
    }

    // Venue can accept/decline pending requests
    if (isVenue) {
      if (existing.status !== "pending") {
        return NextResponse.json({ error: "Can only respond to pending requests" }, { status: 400 });
      }
      if (status !== "active" && status !== "declined") {
        return NextResponse.json({ error: "Venue can only accept or decline" }, { status: 400 });
      }
    }

    // Artist can update active placements but not pending ones (venue decides those)
    if (isArtist && existing.status === "pending" && status !== "pending") {
      return NextResponse.json({ error: "Awaiting venue response" }, { status: 400 });
    }

    const updates: Record<string, unknown> = { status };
    if (isVenue && (status === "active" || status === "declined")) {
      updates.responded_at = new Date().toISOString();
    }

    const { error } = await db.from("placements").update(updates).eq("id", id);

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ error: "Failed to update placement" }, { status: 500 });
    }

    // Notify artist when venue responds (fire-and-forget)
    if (isVenue && existing.artist_user_id) {
      const { data: { user: artistUser } } = await db.auth.admin.getUserById(existing.artist_user_id);
      const { data: artistProfile } = await db
        .from("artist_profiles")
        .select("name")
        .eq("user_id", existing.artist_user_id)
        .single();
      if (artistUser?.email && artistProfile) {
        notifyPlacementResponse({
          email: artistUser.email,
          artistName: artistProfile.name,
          venueName: existing.venue || "Venue",
          accepted: status === "active",
        }).catch((err) => { if (err) console.error("Fire-and-forget error:", err); });
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// DELETE: artist removes a placement
export async function DELETE(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id || id.length > 100) {
      return NextResponse.json({ error: "Valid ID required" }, { status: 400 });
    }

    const db = getSupabaseAdmin();
    const { data: existing } = await db
      .from("placements")
      .select("artist_user_id")
      .eq("id", id)
      .single();

    if (!existing || existing.artist_user_id !== auth.user!.id) {
      return NextResponse.json({ error: "Not authorised" }, { status: 403 });
    }

    const { error } = await db.from("placements").delete().eq("id", id);

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ error: "Failed to delete placement" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
