import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { notifyBuyerStatusUpdate } from "@/lib/email";

// GET: fetch orders for the authenticated user (customer, artist, or venue)
export async function GET(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const db = getSupabaseAdmin();
    const email = auth.user!.email || "";
    const userId = auth.user!.id;

    // Check user type
    const { data: artistProfile } = await db.from("artist_profiles").select("slug").eq("user_id", userId).single();
    const { data: venueProfile } = !artistProfile
      ? await db.from("venue_profiles").select("slug").eq("user_id", userId).single()
      : { data: null };

    let query;
    if (artistProfile) {
      // Artist: orders for their work
      query = db.from("orders").select("*").eq("artist_slug", artistProfile.slug);
    } else if (venueProfile) {
      // Venue: orders from their venue + their own purchases
      query = db.from("orders").select("*").or(`venue_slug.eq.${venueProfile.slug},buyer_email.eq.${email}`);
    } else {
      // Customer: orders by email or user ID
      query = db.from("orders").select("*").or(`buyer_email.eq.${email},buyer_user_id.eq.${userId}`);
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
    }

    return NextResponse.json({
      orders: data || [],
      userType: artistProfile ? "artist" : venueProfile ? "venue" : "customer",
    });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// PATCH: update order status (artist fulfillment)
export async function PATCH(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const { orderId, status, trackingNumber } = body;

    if (!orderId || !status) {
      return NextResponse.json({ error: "Order ID and status required" }, { status: 400 });
    }

    const validStatuses = ["processing", "shipped", "delivered", "cancelled"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const db = getSupabaseAdmin();

    // Verify the artist owns this order
    const { data: order } = await db.from("orders").select("artist_user_id, buyer_email, status_history").eq("id", orderId).single();
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    if (order.artist_user_id !== auth.user!.id) return NextResponse.json({ error: "Not authorised" }, { status: 403 });

    // Append to status history
    const history = Array.isArray(order.status_history) ? order.status_history : [];
    history.push({ status, timestamp: new Date().toISOString() });

    const updates: Record<string, unknown> = { status, status_history: JSON.stringify(history) };
    if (trackingNumber) updates.tracking_number = trackingNumber;

    const { error } = await db.from("orders").update(updates).eq("id", orderId);

    if (error) {
      console.error("Status update error:", error);
      return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
    }

    // Notify buyer (fire-and-forget)
    if (order.buyer_email) {
      notifyBuyerStatusUpdate({
        email: order.buyer_email,
        orderId,
        status,
        trackingNumber,
      }).catch((err) => { if (err) console.error("Fire-and-forget error:", err); });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, items, shipping, subtotal, shippingCost, total, buyerEmail } = body;

    if (!id || !items || !shipping || subtotal == null || total == null || !buyerEmail) {
      return NextResponse.json({ error: "Missing order data" }, { status: 400 });
    }

    const { error } = await getSupabaseAdmin().from("orders").insert({
      id,
      buyer_email: buyerEmail,
      items,
      shipping,
      subtotal,
      shipping_cost: shippingCost,
      total,
      status: "confirmed",
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ error: "Failed to save order" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
