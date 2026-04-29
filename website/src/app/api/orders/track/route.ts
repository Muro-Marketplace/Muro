// Public order-tracking endpoint (#3). Lets a guest buyer look up
// their order using just the order ID + the email they used at
// checkout, no login required. We deliberately scope responses to
// the safe-to-show fields (status, line items, fulfilment dates) and
// omit anything that could be used to scrape PII (artist payouts,
// internal IDs, buyer phone, etc.). Email-match is the auth check.
//
// Companion to /orders/track on the frontend.

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limit";

interface DbOrder {
  id: string;
  status: string | null;
  buyer_email: string | null;
  buyer_name: string | null;
  artist_slug: string | null;
  total_amount: number | null;
  shipping_amount: number | null;
  currency: string | null;
  cart_items: unknown;
  status_history: unknown;
  tracking_number: string | null;
  tracking_url: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  created_at: string | null;
}

export async function POST(request: Request) {
  // Rate-limit harder than the authenticated /orders endpoint,
  // unauthenticated lookup is a tempting enumeration target.
  const limited = await checkRateLimit(request, 12, 60_000);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { orderId, email } = (body || {}) as { orderId?: string; email?: string };
  if (typeof orderId !== "string" || typeof email !== "string") {
    return NextResponse.json({ error: "orderId and email are required" }, { status: 400 });
  }
  const cleanedId = orderId.trim();
  const cleanedEmail = email.trim().toLowerCase();
  if (!cleanedId || !cleanedEmail || !cleanedEmail.includes("@")) {
    return NextResponse.json({ error: "orderId and email are required" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("orders")
    .select(
      "id, status, buyer_email, buyer_name, artist_slug, total_amount, shipping_amount, currency, cart_items, status_history, tracking_number, tracking_url, shipped_at, delivered_at, created_at",
    )
    .eq("id", cleanedId)
    .maybeSingle<DbOrder>();
  if (error) {
    console.error("[orders/track] lookup failed:", error.message);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
  // Constant response for both "not found" and "email mismatch" so
  // the endpoint can't be used to confirm whether a given orderId
  // exists.
  if (!data || (data.buyer_email || "").toLowerCase() !== cleanedEmail) {
    return NextResponse.json({ error: "No matching order" }, { status: 404 });
  }

  return NextResponse.json({
    order: {
      id: data.id,
      status: data.status || "confirmed",
      placedAt: data.created_at,
      buyerName: data.buyer_name,
      artistSlug: data.artist_slug,
      total: data.total_amount,
      shipping: data.shipping_amount,
      currency: data.currency || "gbp",
      items: Array.isArray(data.cart_items) ? data.cart_items : [],
      history: Array.isArray(data.status_history) ? data.status_history : [],
      shippedAt: data.shipped_at,
      deliveredAt: data.delivered_at,
      tracking: data.tracking_number
        ? { number: data.tracking_number, url: data.tracking_url || null }
        : null,
    },
  });
}
