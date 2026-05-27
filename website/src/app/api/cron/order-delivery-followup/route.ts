// Phase 2.3 (J2). Cron that nudges customers to confirm delivery
// 48 hours after order.delivered fires, and auto-confirms after 7
// days of silence so the artist payout isn't blocked forever.
//
// Scheduling: vercel.json runs this once daily at 12:00 UTC.
// Vercel's Hobby tier rejects any cron with frequency < 24h, which
// blocked the Phase 2 deploy when the spec's hourly schedule
// landed. Daily is the smallest schedule Hobby accepts.
//
// Trade-off vs the original hourly spec: the 48h prompt fires
// 48-72h after delivery instead of 48-49h, and the 7-day auto-
// confirm fires 168-192h instead of 168-169h. Both still well
// within the customer-experience target windows.
//
// If Wallplace upgrades to Vercel Pro, this can return to hourly
// without other code changes.
//
// The job is idempotent: re-running on the next tick won't double-
// send because every nudge inserts a `48h_prompt` row into
// order_events with a unique idempotency_key, and auto-confirm
// inserts `order.delivery_confirmed` with its own unique key.
//
// Why the prompt isn't a separate order_events.event_type:
//   The Phase 1 CHECK constraint locks the event_type vocabulary to
//   the six lifecycle events. Adding "48h_prompt" would require a
//   schema migration; instead we store it inside metadata.kind on a
//   freshly-inserted row with event_type='order.delivered' and a
//   distinct idempotency_key — the constraint accepts duplicates of
//   the same event_type so long as idempotency_key is unique.
//
// Auto-confirm writes `order.delivery_confirmed` to the events log so
// the K3 lifecycle stepper renders the final tick. orders.status STAYS
// at "delivered" because the legacy state machine doesn't carry a
// terminal "delivery_confirmed" value (see order-state-machine.ts);
// the event log is the only source of truth for buyer confirmation.

import { NextResponse } from "next/server";
import { requireCronAuth, runBatch } from "@/app/api/cron/_auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendTransactional } from "@/lib/email/dispatcher";

export const runtime = "nodejs";

// Hour offsets driving the cron.
const PROMPT_AFTER_MS = 48 * 60 * 60 * 1000;
const AUTO_CONFIRM_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  const db = getSupabaseAdmin();
  const now = Date.now();

  // Pull every order.delivered event that hasn't already received a
  // 48h prompt or a delivery_confirmed event. The volume is small
  // enough that a single LIMIT 500 query is fine; we'll batch
  // pagination in if delivery volume grows.
  const { data: deliveredEvents, error } = await db
    .from("order_events")
    .select("order_id, created_at")
    .eq("event_type", "order.delivered")
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) {
    console.error("[cron/order-delivery-followup] delivered query:", error);
    return NextResponse.json({ error: "Could not load delivered events" }, { status: 500 });
  }

  if (!deliveredEvents || deliveredEvents.length === 0) {
    return NextResponse.json({ status: "ok", prompted: 0, confirmed: 0 });
  }

  const orderIds = Array.from(
    new Set(deliveredEvents.map((e) => (e as { order_id: string }).order_id)),
  );

  // Pull every confirmation + prompt event for these orders in one go.
  // PostgREST's `like` filter uses `*` as the wildcard (URL-encoded
  // %2A). `%` in the value comes through as a literal percent sign,
  // not a wildcard, so the original query never matched.
  const { data: closingEvents } = await db
    .from("order_events")
    .select("order_id, event_type, idempotency_key")
    .in("order_id", orderIds)
    .or("event_type.eq.order.delivery_confirmed,idempotency_key.like.*:48h_prompt*");

  const alreadyConfirmed = new Set<string>();
  const alreadyPrompted = new Set<string>();
  for (const ev of (closingEvents ?? []) as Array<{
    order_id: string;
    event_type: string;
    idempotency_key: string | null;
  }>) {
    if (ev.event_type === "order.delivery_confirmed") {
      alreadyConfirmed.add(ev.order_id);
    }
    if (ev.idempotency_key?.endsWith(":48h_prompt")) {
      alreadyPrompted.add(ev.order_id);
    }
  }

  // Look up buyer emails in one batch so per-order email dispatch is
  // a constant-time hash lookup.
  const { data: orderRows } = await db
    .from("orders")
    .select("id, buyer_email, status, shipping")
    .in("id", orderIds);
  const buyerById = new Map<
    string,
    { buyerEmail: string | null; firstName: string; status: string | null }
  >();
  for (const row of (orderRows ?? []) as Array<{
    id: string;
    buyer_email: string | null;
    status: string | null;
    shipping: unknown;
  }>) {
    const shipping = (row.shipping ?? {}) as { fullName?: string };
    const firstName = row.buyer_email
      ? (shipping.fullName || row.buyer_email.split("@")[0]).split(" ")[0]
      : "there";
    buyerById.set(row.id, {
      buyerEmail: row.buyer_email,
      firstName,
      status: row.status,
    });
  }

  // Decide which orders need a 48h prompt and which need auto-confirm.
  const toPrompt: Array<{ orderId: string; firstName: string; buyerEmail: string; deliveredAt: string }> = [];
  const toConfirm: Array<{ orderId: string }> = [];

  for (const ev of deliveredEvents as Array<{ order_id: string; created_at: string }>) {
    if (alreadyConfirmed.has(ev.order_id)) continue;
    const deliveredAtMs = Date.parse(ev.created_at);
    if (!Number.isFinite(deliveredAtMs)) continue;
    const ageMs = now - deliveredAtMs;

    if (ageMs >= AUTO_CONFIRM_AFTER_MS) {
      toConfirm.push({ orderId: ev.order_id });
      continue;
    }
    if (ageMs >= PROMPT_AFTER_MS && !alreadyPrompted.has(ev.order_id)) {
      const buyer = buyerById.get(ev.order_id);
      if (!buyer?.buyerEmail) continue;
      toPrompt.push({
        orderId: ev.order_id,
        firstName: buyer.firstName,
        buyerEmail: buyer.buyerEmail,
        deliveredAt: new Date(deliveredAtMs).toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
        }),
      });
    }
  }

  // Send prompts and log them.
  const promptResult = await runBatch(toPrompt, async (p) => {
    await sendTransactional({
      to: p.buyerEmail,
      template: "customer_confirm_delivery",
      idempotencyKey: `${p.orderId}:48h_prompt`,
      data: {
        firstName: p.firstName,
        orderNumber: p.orderId,
        deliveredAt: p.deliveredAt,
        confirmUrl: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://wallplace.co.uk"}/orders/${p.orderId}/confirm`,
        reportProblemUrl: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://wallplace.co.uk"}/contact?order=${p.orderId}`,
        autoConfirmInDays: 5,
      },
    });
    await db.from("order_events").upsert(
      {
        order_id: p.orderId,
        event_type: "order.delivered",
        metadata: { kind: "48h_prompt" },
        idempotency_key: `${p.orderId}:48h_prompt`,
      },
      { onConflict: "idempotency_key" },
    );
  });

  // Auto-confirm overdue orders. The event log (order_events) is the
  // source of truth for the K3 stepper; orders.status STAYS at
  // "delivered" because the legacy state machine doesn't have a
  // "delivery_confirmed" terminal value (see order-state-machine.ts).
  // Anything downstream that needs to know "buyer confirmed receipt"
  // reads from order_events.event_type='order.delivery_confirmed'.
  const confirmResult = await runBatch(toConfirm, async (c) => {
    await db.from("order_events").upsert(
      {
        order_id: c.orderId,
        event_type: "order.delivery_confirmed",
        metadata: { kind: "auto_confirm_7d" },
        idempotency_key: `${c.orderId}:order.delivery_confirmed`,
      },
      { onConflict: "idempotency_key" },
    );
  });

  return NextResponse.json({
    status: "ok",
    prompted: promptResult.succeeded,
    promptedFailed: promptResult.failed,
    confirmed: confirmResult.succeeded,
    confirmedFailed: confirmResult.failed,
  });
}
