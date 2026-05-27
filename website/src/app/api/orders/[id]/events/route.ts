// Phase 2.3 (K3). Read-only endpoint that returns the order_events
// log for a single order, plus the order's basic identity (status,
// buyer email, items) so the customer tracking page can render a
// stepper without two round-trips.
//
// Auth: same model as /api/orders/track — either the caller is the
// buyer (matched by buyer_email on the row), the artist (matched by
// artist_user_id), or the venue. We don't gate by a magic token here
// because the page itself is wrapped in the customer portal layout,
// which already requires signin.

import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;
  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const db = getSupabaseAdmin();
  const { data: order } = await db
    .from("orders")
    .select(
      "id, status, buyer_email, artist_user_id, venue_user_id, items, shipping, total, currency, placed_at, created_at",
    )
    .eq("id", id)
    .maybeSingle<{
      id: string;
      status: string;
      buyer_email: string | null;
      artist_user_id: string | null;
      venue_user_id: string | null;
      items: unknown;
      shipping: unknown;
      total: number | null;
      currency: string | null;
      placed_at: string | null;
      created_at: string;
    }>();

  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const userEmail = auth.user!.email ?? null;
  const isBuyer =
    !!order.buyer_email && userEmail && order.buyer_email.toLowerCase() === userEmail.toLowerCase();
  const isArtist = !!order.artist_user_id && order.artist_user_id === auth.user!.id;
  const isVenue = !!order.venue_user_id && order.venue_user_id === auth.user!.id;
  if (!isBuyer && !isArtist && !isVenue) {
    return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  }

  const { data: events } = await db
    .from("order_events")
    .select("event_type, created_at, metadata, actor_user_id")
    .eq("order_id", id)
    .order("created_at", { ascending: true });

  return NextResponse.json({
    order: {
      id: order.id,
      status: order.status,
      buyerEmail: order.buyer_email,
      items: order.items,
      shipping: order.shipping,
      total: order.total,
      currency: order.currency,
      placedAt: order.placed_at ?? order.created_at,
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
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  if (!body || body.event_type !== "order.delivery_confirmed") {
    return NextResponse.json(
      { error: "Only event_type=order.delivery_confirmed is accepted" },
      { status: 400 },
    );
  }

  const db = getSupabaseAdmin();
  const { data: order } = await db
    .from("orders")
    .select("id, buyer_email, artist_user_id, venue_user_id")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      buyer_email: string | null;
      artist_user_id: string | null;
      venue_user_id: string | null;
    }>();
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const userEmail = auth.user!.email ?? null;
  const isBuyer =
    !!order.buyer_email && userEmail && order.buyer_email.toLowerCase() === userEmail.toLowerCase();
  if (!isBuyer) {
    return NextResponse.json({ error: "Only the buyer can confirm delivery" }, { status: 403 });
  }

  await db.from("order_events").upsert(
    {
      order_id: id,
      event_type: "order.delivery_confirmed",
      actor_user_id: auth.user!.id,
      metadata: { kind: "manual_confirm" },
      idempotency_key: `${id}:order.delivery_confirmed`,
    },
    { onConflict: "idempotency_key" },
  );

  return NextResponse.json({ status: "ok" });
}
