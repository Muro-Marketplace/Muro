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
import { verifyOrderToken } from "@/lib/order-tracking-token";

// 7b phantom-column fix: the select named 8 columns that do not exist on orders
// (total_amount, shipping_amount, currency, cart_items, buyer_name, tracking_url,
// shipped_at, delivered_at), so PostgREST rejected the whole query and the route
// 500'd on every request. Mapped to the real schema: total, shipping_cost, items,
// tracking_number. buyer_name/shipped_at/delivered_at were never rendered and are
// dropped; currency is GBP-only; ship/deliver timing lives in status_history.
interface DbOrder {
  id: string;
  order_number: string | null;
  status: string | null;
  buyer_email: string | null;
  artist_slug: string | null;
  total: number | null;
  shipping_cost: number | null;
  items: unknown;
  status_history: unknown;
  tracking_number: string | null;
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
  const { orderId, email, token } = (body || {}) as {
    orderId?: string;
    email?: string;
    token?: string;
  };

  // Plan B Task 11: token-first / email-fallback. Tokenized links from
  // order confirmation emails skip the orderId+email form. Bare email
  // path stays for legacy receipts (90-day deprecation window before
  // removal).
  let cleanedId: string;
  let cleanedEmail: string;
  if (typeof token === "string" && token.length > 0) {
    try {
      const verified = await verifyOrderToken(token);
      cleanedId = verified.orderId;
      cleanedEmail = verified.email.toLowerCase();
    } catch {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 401 });
    }
  } else {
    if (typeof orderId !== "string" || typeof email !== "string") {
      return NextResponse.json({ error: "orderId and email are required" }, { status: 400 });
    }
    cleanedId = orderId.trim();
    cleanedEmail = email.trim().toLowerCase();
    if (!cleanedId || !cleanedEmail || !cleanedEmail.includes("@")) {
      return NextResponse.json({ error: "orderId and email are required" }, { status: 400 });
    }
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("orders")
    .select(
      "id, order_number, status, buyer_email, artist_slug, total, shipping_cost, items, status_history, tracking_number, created_at",
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
      orderNumber: data.order_number,
      status: data.status || "confirmed",
      placedAt: data.created_at,
      artistSlug: data.artist_slug,
      total: data.total,
      shipping: data.shipping_cost,
      currency: "gbp",
      items: Array.isArray(data.items) ? data.items : [],
      history: Array.isArray(data.status_history) ? data.status_history : [],
      // orders stores no tracking_url; the tracking page treats url as optional.
      tracking: data.tracking_number
        ? { number: data.tracking_number, url: null }
        : null,
    },
  });
}
