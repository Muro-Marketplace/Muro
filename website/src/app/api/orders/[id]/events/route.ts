// Phase 2.3 (K3). Read-only endpoint that returns the order_events
// log for a single order, plus the order's basic identity (status,
// buyer email, items) so the customer tracking page can render a
// stepper without two round-trips.
//
// Auth: either
//   - the caller is signed in and is the buyer / artist / venue on
//     the order (standard session auth via getAuthenticatedUser); OR
//   - the request carries `?t=<token>` matching the signed token
//     baked into the customer order-receipt email (guest checkout
//     path; same mechanism /api/orders/track already uses).

import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { assertNotDemo } from "@/lib/demo-guard";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifyOrderToken } from "@/lib/order-tracking-token";

export const runtime = "nodejs";

// 7b phantom-column fix: the select named venue_user_id, currency and placed_at,
// none of which exist on orders, so the whole select was rejected and this route
// 404'd for every order. orders links the venue via venue_slug (resolved to a user
// id below for the authz check), has no currency (GBP only), and uses created_at.
interface OrderRow {
  id: string;
  status: string;
  buyer_email: string | null;
  artist_user_id: string | null;
  venue_slug: string | null;
  items: unknown;
  shipping: unknown;
  total: number | null;
  created_at: string;
}

async function loadOrder(id: string): Promise<OrderRow | null> {
  const db = getSupabaseAdmin();
  const { data } = await db
    .from("orders")
    .select(
      "id, status, buyer_email, artist_user_id, venue_slug, items, shipping, total, created_at",
    )
    .eq("id", id)
    .maybeSingle<OrderRow>();
  return data ?? null;
}

/** Whether `userId` is the venue behind `venueSlug` (orders has no venue_user_id;
 *  the link is venue_slug -> venue_profiles.user_id). */
async function isVenueForSlug(venueSlug: string, userId: string): Promise<boolean> {
  const db = getSupabaseAdmin();
  const { data } = await db
    .from("venue_profiles")
    .select("user_id")
    .eq("slug", venueSlug)
    .maybeSingle<{ user_id: string | null }>();
  return !!data?.user_id && data.user_id === userId;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const url = new URL(request.url);
  const token = url.searchParams.get("t");

  // Guest path: a signed token off the receipt email proves the
  // bearer is the buyer. We still pull the order row through the
  // admin client because the page itself doesn't require Supabase
  // auth — same shape as /api/orders/track.
  if (token) {
    let claim: { orderId: string; email: string };
    try {
      claim = await verifyOrderToken(token);
    } catch {
      return NextResponse.json({ error: "Invalid or expired tracking link" }, { status: 401 });
    }
    if (claim.orderId !== id) {
      return NextResponse.json({ error: "Token does not match order" }, { status: 403 });
    }
    const order = await loadOrder(id);
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (
      !order.buyer_email ||
      order.buyer_email.toLowerCase() !== claim.email.toLowerCase()
    ) {
      return NextResponse.json({ error: "Token does not match order" }, { status: 403 });
    }
    return buildResponse(order);
  }

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const order = await loadOrder(id);
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const userEmail = auth.user!.email ?? null;
  const isBuyer =
    !!order.buyer_email && userEmail && order.buyer_email.toLowerCase() === userEmail.toLowerCase();
  const isArtist = !!order.artist_user_id && order.artist_user_id === auth.user!.id;
  const isVenue =
    !isBuyer && !isArtist && !!order.venue_slug
      ? await isVenueForSlug(order.venue_slug, auth.user!.id)
      : false;
  if (!isBuyer && !isArtist && !isVenue) {
    return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  }

  return buildResponse(order);
}

async function buildResponse(order: OrderRow): Promise<NextResponse> {
  const db = getSupabaseAdmin();
  const { data: events } = await db
    .from("order_events")
    .select("event_type, created_at, metadata, actor_user_id")
    .eq("order_id", order.id)
    .order("created_at", { ascending: true });

  return NextResponse.json({
    order: {
      id: order.id,
      status: order.status,
      buyerEmail: order.buyer_email,
      items: order.items,
      shipping: order.shipping,
      total: order.total,
      currency: "gbp",
      placedAt: order.created_at,
    },
    events: events ?? [],
  });
}

/**
 * Customer-driven event insert. Only `order.delivery_confirmed` is
 * accepted today; the route exists so the K3 stepper can flip the
 * order from "delivered" to "confirmed" without a Stripe round-trip.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const token = url.searchParams.get("t");
  const body = await request.json().catch(() => null);
  if (!body || body.event_type !== "order.delivery_confirmed") {
    return NextResponse.json(
      { error: "Only event_type=order.delivery_confirmed is accepted" },
      { status: 400 },
    );
  }

  // Guest path: signed token off the receipt email. Same verify
  // shape as GET so guest buyers can confirm delivery without
  // signing up. Without this, the K3 stepper's confirm button
  // 401s for every guest order placed via QR scan.
  let buyerEmail: string | null = null;
  let actorUserId: string | null = null;
  if (token) {
    let claim: { orderId: string; email: string };
    try {
      claim = await verifyOrderToken(token);
    } catch {
      return NextResponse.json({ error: "Invalid or expired tracking link" }, { status: 401 });
    }
    if (claim.orderId !== id) {
      return NextResponse.json({ error: "Token does not match order" }, { status: 403 });
    }
    buyerEmail = claim.email;
  } else {
    const auth = await getAuthenticatedUser(request);
    if (auth.error) return auth.error;
    // E23a: soft demo guard. 200 + {demo:true} so the portal can toast without
    // unwinding optimistic state. The helper had zero call sites while two doc
    // comments claimed it was enforced.
    const demoResp = assertNotDemo(auth.user!.id);
    if (demoResp) return demoResp;
    buyerEmail = auth.user!.email ?? null;
    actorUserId = auth.user!.id;
  }

  const db = getSupabaseAdmin();
  const { data: order } = await db
    .from("orders")
    .select("id, buyer_email")
    .eq("id", id)
    .maybeSingle<{ id: string; buyer_email: string | null }>();
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isBuyer =
    !!order.buyer_email &&
    !!buyerEmail &&
    order.buyer_email.toLowerCase() === buyerEmail.toLowerCase();
  if (!isBuyer) {
    return NextResponse.json({ error: "Only the buyer can confirm delivery" }, { status: 403 });
  }

  await db.from("order_events").upsert(
    {
      order_id: id,
      event_type: "order.delivery_confirmed",
      actor_user_id: actorUserId,
      metadata: { kind: "manual_confirm" },
      idempotency_key: `${id}:order.delivery_confirmed`,
    },
    { onConflict: "idempotency_key" },
  );

  return NextResponse.json({ status: "ok" });
}
