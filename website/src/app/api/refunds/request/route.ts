import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { notifyRefundRequested } from "@/lib/email";
import { createNotification } from "@/lib/notifications";
import { verifyOrderToken } from "@/lib/order-tracking-token";

export async function POST(request: Request) {
  let body: { orderId?: string; reason?: string; type?: string; amount?: number; token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Plan B Task 12: signed-token branch lets guest buyers (no Bearer)
  // request a refund using the same HMAC link from their receipt
  // email. Bearer auth still works for logged-in buyers/artists/venues.
  let userId: string | null = null;
  let userEmail = "";
  let tokenAuthOrderId: string | null = null;
  if (typeof body.token === "string" && body.token.length > 0) {
    try {
      const verified = await verifyOrderToken(body.token);
      userEmail = verified.email.toLowerCase();
      tokenAuthOrderId = verified.orderId;
    } catch {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 401 });
    }
  } else {
    const auth = await getAuthenticatedUser(request);
    if (auth.error) return auth.error;
    userId = auth.user!.id;
    userEmail = (auth.user!.email || "").toLowerCase();
  }

  try {
    const { orderId, reason, type, amount } = body;

    if (!orderId || !reason || !type) {
      return NextResponse.json({ error: "orderId, reason, and type are required" }, { status: 400 });
    }

    // Token is order-scoped — refuse if the body's orderId doesn't match.
    if (tokenAuthOrderId && tokenAuthOrderId !== orderId) {
      return NextResponse.json({ error: "Token does not authorise this order" }, { status: 403 });
    }

    if (type !== "full" && type !== "partial") {
      return NextResponse.json({ error: "type must be 'full' or 'partial'" }, { status: 400 });
    }

    if (type === "partial" && (!amount || amount <= 0)) {
      return NextResponse.json({ error: "Partial refund requires a positive amount" }, { status: 400 });
    }

    const db = getSupabaseAdmin();

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

    const isBuyer = (order.buyer_email || "").toLowerCase() === userEmail;
    const isArtist = userId !== null && order.artist_user_id === userId;

    let isVenue = false;
    if (userId !== null) {
      const { data: venueProfile } = await db
        .from("venue_profiles")
        .select("slug")
        .eq("user_id", userId)
        .single();
      isVenue = !!(venueProfile && order.venue_slug === venueProfile.slug);
    }

    if (isArtist) {
      requesterType = "artist";
    } else if (isBuyer) {
      requesterType = "buyer";
    } else if (isVenue) {
      requesterType = "venue";
    } else {
      return NextResponse.json({ error: "Not authorised to request a refund for this order" }, { status: 403 });
    }

    // Block any non-rejected duplicate (was: only `pending`). An
    // approved-but-not-yet-processed request shouldn't be re-submittable.
    const { data: existing } = await db
      .from("refund_requests")
      .select("id, status")
      .eq("order_id", orderId)
      .neq("status", "rejected")
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: `A ${existing[0].status} refund request already exists for this order.` },
        { status: 409 },
      );
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

    // Notify artist and admin. Email is the legacy channel; we also fire
    // an in-app bell notification so the artist sees it on the dashboard
    // even if Resend is misconfigured or the email lands in spam. The
    // previous flow was email-only and silently failed when the request
    // didn't get through.
    if (order.artist_user_id) {
      const { data: { user: artistUser } } = await db.auth.admin.getUserById(order.artist_user_id);
      const { data: artistProfile } = await db
        .from("artist_profiles")
        .select("name")
        .eq("user_id", order.artist_user_id)
        .single();

      await notifyRefundRequested({
        artistEmail: artistUser?.email || undefined,
        artistName: artistProfile?.name || undefined,
        requesterName: userEmail,
        requesterType,
        orderId,
        reason,
        amount: refundAmount,
        type,
      }).catch((err) => { if (err) console.error("notifyRefundRequested error:", err); });

      // In-app bell. Deep-link to the orders page so the artist can
      // approve / reject directly. The buyer's identity (not the
      // artist's own) is the actor here, hence the user_id is the
      // artist's. Skip when the requester IS the artist (artists can
      // self-cancel pre-fulfilment) so we don't notify them about
      // their own action.
      if (requesterType !== "artist") {
        await createNotification({
          userId: order.artist_user_id,
          kind: "refund_request",
          title: `Refund request, £${Number(refundAmount).toFixed(2)}`,
          body: `${type === "full" ? "Full" : "Partial"} refund requested on ${orderId}, "${reason.slice(0, 80)}${reason.length > 80 ? "…" : ""}"`,
          link: `/artist-portal/orders?id=${encodeURIComponent(orderId)}`,
        });
      }
    } else {
      // No artist, still notify admin via the email pipeline.
      await notifyRefundRequested({
        requesterName: userEmail,
        requesterType,
        orderId,
        reason,
        amount: refundAmount,
        type,
      }).catch((err) => { if (err) console.error("notifyRefundRequested error:", err); });
    }

    return NextResponse.json({ success: true, refundRequest });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
