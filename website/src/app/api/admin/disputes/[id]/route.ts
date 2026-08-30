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
import { OperationalDisputeResolved } from "@/emails/templates/legal/OperationalDisputeResolved";
import { markEscalated } from "../escalation";

export const runtime = "nodejs";

function siteOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";
}

/**
 * The dispute opener's address and first name, or null when neither can be
 * resolved. Best-effort: a decision that reached the database must not be
 * reported as failed because the notice could not be addressed.
 */
async function disputeOpener(
  db: ReturnType<typeof getSupabaseAdmin>,
  openerUserId: string,
): Promise<{ email: string; firstName: string } | null> {
  try {
    const { data } = await db.auth.admin.getUserById(openerUserId);
    const email = data?.user?.email;
    if (!email) return null;
    const meta = (data.user!.user_metadata ?? {}) as Record<string, unknown>;
    const displayName = typeof meta.display_name === "string" ? meta.display_name : "";
    return { email, firstName: (displayName || "there").split(" ")[0] };
  } catch (err) {
    console.error("[admin/disputes] could not resolve the opener:", err);
    return null;
  }
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
  //
  // G20 adds `category` to the same select: escalate rewrites that column and
  // used to do so without ever reading it, which is how the opener's own
  // classification was destroyed by a button that meant to add a flag.
  const { data: dispute } = await db
    .from("disputes")
    .select("id, status, order_id, placement_id, opener_user_id, category")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      status: string;
      order_id: string | null;
      placement_id: string | null;
      opener_user_id: string | null;
      category: string | null;
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
    // escalate keeps the status open and adds a flag. G20: it used to REPLACE
    // the category with the literal "escalated", so the classification the
    // opener filed under was gone, from the list heading and from the list
    // endpoint's category filter alike. markEscalated keeps the original.
    updates = { category: markEscalated(dispute.category) };
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
            // B29: /orders/[id]/dispute never existed; the order page carries the
            // dispute section, so the resolved email lands there.
            disputeUrl: `${siteOrigin()}/orders/${encodeURIComponent(order.id)}`,
            supportUrl: `${siteOrigin()}/support`,
          }),
          metadata: { disputeId: id, orderId: order.id },
        });
      }
    } else {
      console.error("[admin/disputes PATCH] resolved dispute has no order:", dispute.order_id);
    }
  }

  // G19. The block above is gated on `order_id`, and roughly half the disputes
  // this panel handles have none: a placement dispute, or one raised straight
  // out of a conversation. Those resolved in total silence, so the person who
  // raised the case had to keep coming back to the page to find out what had
  // been decided, which is the failure 09 §D.2 set out to end.
  //
  // Only the opener is notified here. Unlike an order, a placement or a
  // conversation has no settled second party this route can resolve without
  // guessing, and emailing the wrong person about someone else's complaint is
  // worse than emailing one too few.
  if (parsed.data.action === "resolve" && !dispute.order_id && dispute.opener_user_id) {
    const opener = await disputeOpener(db, dispute.opener_user_id);
    if (opener) {
      await sendEmail({
        idempotencyKey: `dispute_resolved:${id}:opener`,
        template: "operational_dispute_resolved",
        category: "legal",
        to: opener.email,
        userId: dispute.opener_user_id,
        subject: "Your Wallplace dispute has been resolved",
        react: OperationalDisputeResolved({
          firstName: opener.firstName,
          subjectLine: dispute.placement_id
            ? `your placement ${dispute.placement_id}`
            : undefined,
          outcome: parsed.data.resolution,
          supportUrl: `${siteOrigin()}/support`,
        }),
        metadata: { disputeId: id, placementId: dispute.placement_id },
      });
    } else {
      console.error("[admin/disputes PATCH] could not reach the opener of dispute", id);
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
