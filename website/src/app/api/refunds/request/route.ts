import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { notifyRefundRequested } from "@/lib/email";

export async function POST(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const { orderId, reason, type, amount } = body;

    if (!orderId || !reason || !type) {
      return NextResponse.json({ error: "orderId, reason, and type are required" }, { status: 400 });
    }

    if (type !== "full" && type !== "partial") {
      return NextResponse.json({ error: "type must be 'full' or 'partial'" }, { status: 400 });
    }

    if (type === "partial" && (!amount || amount <= 0)) {
      return NextResponse.json({ error: "Partial refund requires a positive amount" }, { status: 400 });
    }

    const db = getSupabaseAdmin();
    const userId = auth.user!.id;
    const userEmail = auth.user!.email || "";

    // Fetch the order
    const { data: order, error: orderErr } = await db
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (orderErr || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Validate the user is the buyer, venue, or the artist who owns this order
    let requesterType: "buyer" | "venue" | "artist";

    const isBuyer = order.buyer_email === userEmail;
    const isArtist = order.artist_user_id === userId;

    const { data: venueProfile } = await db
      .from("venue_profiles")
      .select("slug")
      .eq("user_id", userId)
      .single();

    const isVenue = venueProfile && order.venue_slug === venueProfile.slug;

    if (isArtist) {
      requesterType = "artist";
    } else if (isBuyer) {
      requesterType = "buyer";
    } else if (isVenue) {
      requesterType = "venue";
    } else {
      return NextResponse.json({ error: "Not authorised to request a refund for this order" }, { status: 403 });
    }

    // Check for existing pending refund request
    const { data: existing } = await db
      .from("refund_requests")
      .select("id")
      .eq("order_id", orderId)
      .eq("status", "pending")
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ error: "A pending refund request already exists for this order" }, { status: 409 });
    }

    // Determine refund amount
    const refundAmount = type === "full" ? order.total : amount;

    if (refundAmount > order.total) {
      return NextResponse.json({ error: "Refund amount exceeds order total" }, { status: 400 });
    }

    // Insert the refund request
    const { data: refundRequest, error: insertErr } = await db
      .from("refund_requests")
      .insert({
        order_id: orderId,
        requester_user_id: userId,
        requester_email: userEmail,
        requester_type: requesterType,
        reason,
        type,
        amount: refundAmount,
        status: "pending",
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertErr) {
      console.error("Refund request insert error:", insertErr);
      return NextResponse.json({ error: "Failed to create refund request" }, { status: 500 });
    }

    // Notify artist and admin (fire-and-forget)
    if (order.artist_user_id) {
      const { data: { user: artistUser } } = await db.auth.admin.getUserById(order.artist_user_id);
      const { data: artistProfile } = await db
        .from("artist_profiles")
        .select("name")
        .eq("user_id", order.artist_user_id)
        .single();

      notifyRefundRequested({
        artistEmail: artistUser?.email || undefined,
        artistName: artistProfile?.name || undefined,
        requesterName: userEmail,
        requesterType,
        orderId,
        reason,
        amount: refundAmount,
        type,
      }).catch((err) => { if (err) console.error("Fire-and-forget error:", err); });
    } else {
      // No artist, still notify admin
      notifyRefundRequested({
        requesterName: userEmail,
        requesterType,
        orderId,
        reason,
        amount: refundAmount,
        type,
      }).catch((err) => { if (err) console.error("Fire-and-forget error:", err); });
    }

    return NextResponse.json({ success: true, refundRequest });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
