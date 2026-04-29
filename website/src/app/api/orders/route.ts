import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { notifyBuyerStatusUpdate } from "@/lib/email";
import { executeTransfer } from "@/lib/stripe-connect";

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

    // Defensive normalisation: any legacy row where status_history,
    // items, or shipping was stored as a stringified JSON value (older
    // orders from before we corrected the PATCH path) gets parsed back
    // into an object/array so the client can render it without crashing.
    const safeParseArray = (v: unknown) => {
      if (Array.isArray(v)) return v;
      if (typeof v === "string") {
        try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
      }
      return [];
    };
    const safeParseObject = (v: unknown) => {
      if (v && typeof v === "object" && !Array.isArray(v)) return v;
      if (typeof v === "string") {
        try { const p = JSON.parse(v); return p && typeof p === "object" ? p : {}; } catch { return {}; }
      }
      return {};
    };
    const orders = (data || []).map((o) => ({
      ...o,
      status_history: safeParseArray((o as { status_history?: unknown }).status_history),
      items: safeParseArray((o as { items?: unknown }).items),
      shipping: safeParseObject((o as { shipping?: unknown }).shipping),
    }));

    return NextResponse.json({
      orders,
      userType: artistProfile ? "artist" : venueProfile ? "venue" : "customer",
      userEmail: email,
      artistSlug: artistProfile?.slug || null,
      venueSlug: venueProfile?.slug || null,
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

    // Verify the artist owns this order. Legacy orders (pre-migration)
    // may have artist_user_id = NULL but artist_slug populated; fall back
    // to matching the caller's artist_profiles.slug so those orders
    // aren't locked out of the status transitions.
    const { data: order } = await db
      .from("orders")
      .select("artist_user_id, artist_slug, buyer_email, status_history, placement_id, venue_revenue")
      .eq("id", orderId)
      .single();
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    let authorised = order.artist_user_id === auth.user!.id;
    if (!authorised && order.artist_slug) {
      const { data: myArtistProfile } = await db
        .from("artist_profiles")
        .select("slug, user_id")
        .eq("user_id", auth.user!.id)
        .single();
      if (myArtistProfile?.slug === order.artist_slug) {
        authorised = true;
        // Back-fill the missing column so subsequent updates hit the
        // fast path.
        db.from("orders").update({ artist_user_id: auth.user!.id }).eq("id", orderId).then(() => {}, () => {});
      }
    }
    if (!authorised) return NextResponse.json({ error: "Not authorised" }, { status: 403 });

    // Append to status history. status_history is JSONB, pass the actual
    // array, never JSON.stringify'd, otherwise the column stores a string
    // and the client crashes when it tries to .find/.map on it. That was
    // the source of the "something went wrong" page on order detail click.
    const rawHistory = order.status_history;
    const parsedHistory = Array.isArray(rawHistory)
      ? rawHistory
      : typeof rawHistory === "string"
        ? (() => { try { const v = JSON.parse(rawHistory); return Array.isArray(v) ? v : []; } catch { return []; } })()
        : [];
    parsedHistory.push({ status, timestamp: new Date().toISOString() });

    const updates: Record<string, unknown> = { status, status_history: parsedHistory };
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

    // On delivery, release pending payouts immediately (instead of waiting 14 days)
    // and attribute the venue revenue back to the source placement so venue
    // dashboards see the linkage. Idempotent: status_history is checked before
    // the original update; if "delivered" was already there we skip the bump.
    if (status === "delivered") {
      const { data: pendingTransfers } = await db
        .from("stripe_transfers")
        .select("id")
        .eq("order_id", orderId)
        .eq("status", "pending");

      if (pendingTransfers) {
        for (const t of pendingTransfers) {
          executeTransfer(t.id).catch((err) => console.error("Early payout error:", err));
        }
      }

      // Placement-revenue attribution. Only fires on the first delivered
      // transition (rawHistory was the pre-update snapshot, so an existing
      // "delivered" entry there means we've already counted this order).
      const alreadyDelivered = parsedHistory
        .slice(0, -1)
        .some((h: { status?: string }) => h?.status === "delivered");
      if (!alreadyDelivered && order.placement_id && order.venue_revenue) {
        const { error: rpcErr } = await db.rpc("increment_placement_revenue", {
          p_placement_id: order.placement_id,
          p_amount: order.venue_revenue,
        });
        if (rpcErr) console.error("Failed to attribute placement revenue:", rpcErr);
      }
    }

    // On cancellation, cancel pending payouts
    if (status === "cancelled") {
      await db
        .from("stripe_transfers")
        .update({ status: "cancelled" })
        .eq("order_id", orderId)
        .eq("status", "pending");
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
