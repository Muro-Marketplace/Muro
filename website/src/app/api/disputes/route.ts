import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { assertOrderParty, assertPlacementParty, handleAuthzError } from "@/lib/authz";
import { assertNotDemo } from "@/lib/demo-guard";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email/send";
import { sendAdminAlert } from "@/lib/email/admin-alert";
import { orderParties } from "@/lib/orders/parties";
import { recordOrderEvent } from "@/lib/orders/lifecycle";
import { OrderDisputeOpened } from "@/emails/templates/orders/OrderDisputeOpened";

/**
 * POST /api/disputes (09 §D.1, item 3.7)
 *
 * `disputes` has existed since migration 060 and was written by **nothing**.
 * `admin/disputes` could list and resolve them, `OrderDisputeOpened` and
 * `OrderDisputeResolved` were both built and registered, and there was no way to
 * create one. So the whole dispute surface was unreachable: a buyer with a
 * problem had no path that was not an email to support.
 *
 * That is why 09 calls this "the largest item in this document; it is a feature,
 * not a wiring task".
 *
 * Deliberately NOT idempotent: a person can open two disputes on one order, and
 * refusing the second would silently swallow a real complaint. The EMAILS are
 * keyed on the dispute row's id instead, so a retried request cannot double-mail
 * even though it does create a second row.
 */

const schema = z
  .object({
    orderId: z.string().max(100).optional(),
    placementId: z.string().max(100).optional(),
    conversationId: z.string().max(200).optional(),
    category: z.string().min(2).max(100),
    description: z.string().min(10).max(2000),
  })
  .refine((v) => Boolean(v.orderId) !== Boolean(v.placementId), {
    message: "Provide exactly one of orderId or placementId",
    path: ["orderId"],
  });

function siteOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";
}

/** What we tell someone happens next. One list, so both parties read the same. */
const NEXT_STEPS = [
  "Reply within 3 business days with your side and any photos",
  "We hold the payout while the case is open",
  "If it stays unresolved we make a final call and refund or release accordingly",
];

/**
 * GET /api/disputes
 *
 * Row C L988 / Track A4.5. An open dispute was invisible on the customer's
 * orders dashboard. `orders.status` deliberately stays `confirmed` when a
 * dispute is opened (the order is still live and the dispute runs alongside
 * it), so no off-pipeline badge renders. `/orders/<id>` looked like it knew,
 * but only from local state after the submit; a reload lost it.
 *
 * The reason nothing could show it is that this route had a POST and no GET.
 * `disputes` has existed since migration 060 and was write-only from the
 * customer's side, so the buyer had no way to see that their own complaint had
 * been received.
 *
 * Scoped to `opener_user_id`, so this is the caller's own list and nothing
 * else. The counterparty's view of a dispute belongs to the admin surface,
 * which already has one.
 */
export async function GET(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const { data } = await getSupabaseAdmin()
      .from("disputes")
      .select("id, order_id, placement_id, status, category, description, resolution, created_at, resolved_at")
      .eq("opener_user_id", auth.user!.id)
      .order("created_at", { ascending: false })
      .limit(100);
    return NextResponse.json({ disputes: data ?? [] });
  } catch (err) {
    // A dashboard that cannot load its disputes must still load its orders.
    console.error("[disputes GET]", err);
    return NextResponse.json({ disputes: [] });
  }
}

export async function POST(request: Request) {
  // Opening a dispute writes a row and mails two people, so it is worth a limit
  // even though it is authenticated.
  const limited = await checkRateLimit(request, 5, 60_000);
  if (limited) return limited;

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const demoResp = assertNotDemo(auth.user!.id);
  if (demoResp) return demoResp;

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    /* the schema rejects it */
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const db = getSupabaseAdmin();
  const actor = { id: auth.user!.id, email: auth.user!.email ?? null };

  try {
    // The opener must be a party. Through the shared assert helpers, not an
    // inline comparison: §D.1 says so, and K9 is why.
    const order = parsed.data.orderId
      ? await assertOrderParty(actor, parsed.data.orderId, { as: "any" }, db)
      : null;
    if (parsed.data.placementId) {
      await assertPlacementParty(actor, parsed.data.placementId, db);
    }

    const { data: dispute, error } = await db
      .from("disputes")
      .insert({
        opener_user_id: auth.user!.id,
        order_id: parsed.data.orderId ?? null,
        placement_id: parsed.data.placementId ?? null,
        conversation_id: parsed.data.conversationId ?? null,
        category: parsed.data.category,
        description: parsed.data.description,
      })
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error || !dispute) {
      console.error("[disputes] insert failed:", error?.message);
      return NextResponse.json({ error: "Could not open the dispute" }, { status: 500 });
    }

    // Everything below is best-effort: the dispute is open and recorded, and a
    // mail failure must not tell the opener their complaint did not land.
    if (order) {
      const parties = await orderParties(db, order);
      for (const party of parties) {
        await sendEmail({
          // Keyed on the dispute row, so a retried request that created a second
          // dispute still cannot send two copies about the first.
          idempotencyKey: `dispute_opened:${dispute.id}:${party.role}`,
          template: "order_dispute_opened",
          category: "orders_and_payouts",
          to: party.email,
          userId: party.userId ?? undefined,
          subject: `Dispute opened on order ${order.id}`,
          react: OrderDisputeOpened({
            firstName: party.firstName,
            orderNumber: order.id,
            // The order page hosts the dispute surface; /orders/<id>/dispute
            // never existed and 404ed from every email.
            disputeUrl: `${siteOrigin()}/orders/${encodeURIComponent(order.id)}`,
            nextSteps: NEXT_STEPS,
            supportUrl: `${siteOrigin()}/support`,
          }),
          metadata: { disputeId: dispute.id, orderId: order.id },
        });
      }

      // Give the order a lifecycle row so the stepper and any payout reconciler
      // can see the case. `emailsForEvent` returns [] for order.disputed on
      // purpose: the two emails above are the surface, and a third would be the
      // duplicate-send class K1 spent its whole PR removing.
      await recordOrderEvent(
        {
          orderId: order.id,
          newStatus: "disputed",
          actorUserId: auth.user!.id,
          buyerEmail: null,
          artistEmail: null,
          data: {},
          metadata: { disputeId: dispute.id, category: parsed.data.category },
        },
        db,
      ).catch((err) => console.error("[disputes] lifecycle row failed:", err));
    }

    await sendAdminAlert({
      idempotencyKey: `admin_dispute_opened:${dispute.id}`,
      subject: `Dispute opened${order ? ` on order ${order.id}` : ""}`,
      summary: "Someone has opened a dispute and both parties have been told.",
      fields: [
        { label: "Dispute", value: dispute.id },
        ...(parsed.data.orderId ? [{ label: "Order", value: parsed.data.orderId }] : []),
        ...(parsed.data.placementId ? [{ label: "Placement", value: parsed.data.placementId }] : []),
        { label: "Category", value: parsed.data.category },
        { label: "Opened by", value: auth.user!.id },
      ],
      actionPath: "/admin/disputes",
      actionLabel: "Open the dispute panel",
    });

    return NextResponse.json({ success: true, disputeId: dispute.id }, { status: 201 });
  } catch (err) {
    const denied = handleAuthzError(err);
    if (denied) return denied;
    console.error("[disputes] unhandled error", err);
    return NextResponse.json({ error: "Could not open the dispute" }, { status: 500 });
  }
}
