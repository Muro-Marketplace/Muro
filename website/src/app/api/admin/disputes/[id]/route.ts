// Phase 2.8 A2. Admin actions on a single dispute. Each action writes
// an admin_audit_log row.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { recordAdminAction } from "@/lib/admin-audit";
import { sendEmail } from "@/lib/email/send";
import { orderParties, type OrderPartySource } from "@/lib/orders/parties";
import { OrderDisputeResolved } from "@/emails/templates/orders/OrderDisputeResolved";

export const runtime = "nodejs";

function siteOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";
}

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("resolve"),
    resolution: z.string().min(2).max(2000),
  }),
  z.object({ action: z.literal("close") }),
  z.object({
    action: z.literal("escalate"),
    note: z.string().max(2000).optional(),
  }),
]);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getAdminUser(request);
  if (auth.error) return auth.error;

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  // 09 §D.2. This used to select only "id, status", which is why nobody was ever
  // told their dispute had been decided: the row that carried the decision did
  // not carry the people it was about. An admin resolved a case, the audit log
  // recorded it, and both parties were left refreshing a page.
  const { data: dispute } = await db
    .from("disputes")
    .select("id, status, order_id, placement_id, opener_user_id")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      status: string;
      order_id: string | null;
      placement_id: string | null;
      opener_user_id: string | null;
    }>();
  if (!dispute) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = new Date().toISOString();
  let updates: Record<string, unknown> = {};

  if (parsed.data.action === "resolve") {
    updates = {
      status: "resolved",
      resolution: parsed.data.resolution,
      resolved_at: now,
      resolved_by_user_id: auth.user!.id,
    };
  } else if (parsed.data.action === "close") {
    updates = { status: "closed", resolved_at: now, resolved_by_user_id: auth.user!.id };
  } else {
    // escalate keeps status open but stamps a category-like flag.
    updates = { category: "escalated" };
  }

  const { error } = await db.from("disputes").update(updates).eq("id", id);
  if (error) {
    console.error("[admin/disputes PATCH]", error);
    return NextResponse.json({ error: "Could not update dispute" }, { status: 500 });
  }

  // Tell both parties, once each. Only on `resolve`: that is the action that
  // produces a decision to communicate. `close` ends the case with no outcome
  // text, and `escalate` is an internal reclassification, so neither has
  // anything to say that would not be an empty email.
  if (parsed.data.action === "resolve" && dispute.order_id) {
    const { data: order } = await db
      .from("orders")
      .select("id, buyer_email, buyer_user_id, artist_user_id, artist_slug, shipping")
      .eq("id", dispute.order_id)
      .maybeSingle<OrderPartySource>();

    if (order) {
      for (const party of await orderParties(db, order)) {
        await sendEmail({
          idempotencyKey: `dispute_resolved:${id}:${party.role}`,
          template: "order_dispute_resolved",
          category: "orders_and_payouts",
          to: party.email,
          userId: party.userId ?? undefined,
          subject: `Dispute on ${order.id} resolved`,
          react: OrderDisputeResolved({
            firstName: party.firstName,
            orderNumber: order.id,
            outcome: parsed.data.resolution,
            disputeUrl: `${siteOrigin()}/orders/${encodeURIComponent(order.id)}/dispute`,
            supportUrl: `${siteOrigin()}/support`,
          }),
          metadata: { disputeId: id, orderId: order.id },
        });
      }
    } else {
      console.error("[admin/disputes PATCH] resolved dispute has no order:", dispute.order_id);
    }
  }

  await recordAdminAction({
    adminUserId: auth.user!.id,
    action: `dispute.${parsed.data.action}`,
    context: {
      dispute_id: id,
      ...("resolution" in parsed.data
        ? { resolution: parsed.data.resolution }
        : "note" in parsed.data && parsed.data.note
          ? { note: parsed.data.note }
          : {}),
    },
  });

  return NextResponse.json({ status: "ok" });
}
