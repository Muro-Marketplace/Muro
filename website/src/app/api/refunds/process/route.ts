import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { assertNotDemo } from "@/lib/demo-guard";
import { isAdminRequest } from "@/lib/admin-auth";
import { recordAdminAction } from "@/lib/admin-audit";
import { notifyRefundDecision } from "@/lib/email";
import { sendEmail } from "@/lib/email/send";
import { createNotification } from "@/lib/notifications";
import { CustomerRefundConfirmation } from "@/emails/templates/orders/CustomerRefundConfirmation";
import { ArtistRefundNotification } from "@/emails/templates/orders/ArtistRefundNotification";
import { claimPending, releaseClaim } from "@/lib/api/idempotency";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";

export async function POST(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;
  // E23a: soft demo guard. 200 + {demo:true} so the portal can toast without
  // unwinding optimistic state. The helper had zero call sites while two doc
  // comments claimed it was enforced.
  const demoResp = assertNotDemo(auth.user!.id);
  if (demoResp) return demoResp;

  // A malformed JSON body is the ONLY thing that should ever produce a 400 here.
  // Parse it in isolation so a genuine downstream failure can't be misreported
  // as "Invalid request".
  let body: { refundRequestId?: string; action?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Hoisted out of the main try so the catch can release a claim it may have
  // taken before throwing.
  const db = getSupabaseAdmin();
  let claimedRefundId: string | null = null;

  try {
    const { refundRequestId, action, reason } = body;

    if (!refundRequestId || !action) {
      return NextResponse.json({ error: "refundRequestId and action are required" }, { status: 400 });
    }

    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
    }

    const userId = auth.user!.id;

    // Fetch the refund request (read-only; needed for order_id / requester_type
    // to run authorisation before we mutate anything).
    const { data: refundReqRaw, error: refundReqErr } = await db
      .from("refund_requests")
      .select("*")
      .eq("id", refundRequestId)
      .single();

    if (refundReqErr || !refundReqRaw) {
      return NextResponse.json(
        { error: "Refund request not found" },
        { status: 404 },
      );
    }

    const refundReqForAuthz = refundReqRaw as Record<string, unknown>;

    // Fetch the order
    const { data: order, error: orderErr } = await db
      .from("orders")
      .select("*")
      .eq("id", refundReqForAuthz.order_id)
      .single();

    if (orderErr || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Verify the user is the artist for this order, or an admin (1.5).
    const isArtist = order.artist_user_id === userId;
    const admin = await isAdminRequest(request);

    if (!isArtist && !admin) {
      return NextResponse.json({ error: "Not authorised to process this refund" }, { status: 403 });
    }

    // 4.1: an artist-initiated refund can only be actioned by an admin, never by
    // the artist (no self-approval). requester_type is a NOT NULL column on
    // refund_requests; "artist" means the artist raised it.
    if (!admin && refundReqForAuthz.requester_type === "artist") {
      return NextResponse.json({ error: "Artist-initiated refunds require admin approval" }, { status: 403 });
    }

    // ── 1.8 Atomic claim ────────────────────────────────────────────────────
    // All authorisation checks have passed. Now flip status from
    // 'pending' → 'processing' in a single conditional UPDATE.
    // Only one concurrent caller will receive a row back; all others get null
    // and must 409 without making any Stripe calls.
    const refundReq = await claimPending<Record<string, unknown>>(
      db,
      "refund_requests",
      refundRequestId,
    );

    if (!refundReq) {
      return NextResponse.json(
        { error: "Refund request has already been processed" },
        { status: 409 },
      );
    }

    // Claim succeeded — record the id so the catch can release it if anything
    // after this point throws unexpectedly.
    claimedRefundId = refundRequestId;

    // ─── Reject ───
    if (action === "reject") {
      const { error: updateErr } = await db
        .from("refund_requests")
        .update({
          status: "rejected",
          processed_by: userId,
          processed_at: new Date().toISOString(),
          rejection_reason: reason || null,
        })
        .eq("id", refundRequestId);

      if (updateErr) {
        console.error("Refund reject update error:", updateErr);
        await releaseClaim(db, "refund_requests", refundRequestId);
        return NextResponse.json({ error: "Failed to reject refund request" }, { status: 500 });
      }

      // Notify the requester (awaited so it runs on serverless; .catch keeps mail failure non-fatal)
      const requesterEmail = refundReq.requester_email as string | null | undefined;
      const buyerEmailFallback = order.buyer_email as string | null | undefined;
      if (requesterEmail || buyerEmailFallback) {
        await notifyRefundDecision({
          buyerEmail: (requesterEmail || buyerEmailFallback) as string,
          orderId: order.id,
          approved: false,
          reason: reason || undefined,
        }).catch((err) => { if (err) console.error("notifyRefundDecision error:", err); });
      }

      // E30a / G3. An admin rejecting an artist-raised refund is the decision
      // that stops money moving, and it left no trail. Additive only: this adds
      // a row, it does not change the refund. recordAdminAction never throws.
      if (admin) {
        await recordAdminAction({
          adminUserId: userId,
          action: "refund_rejected_by_admin",
          context: {
            orderId: order.id,
            refundRequestId,
            requesterType: refundReqForAuthz.requester_type,
          },
        });
      }

      return NextResponse.json({ success: true, status: "rejected" });
    }

    // ─── Approve ───
    const paymentIntentId = order.stripe_payment_intent_id;
    if (!paymentIntentId) {
      await releaseClaim(db, "refund_requests", refundRequestId);
      return NextResponse.json(
        { error: "No payment intent found for this order. Refund cannot be processed automatically." },
        { status: 422 },
      );
    }

    const refundAmountCents = Math.round((refundReq.amount as number) * 100);
    const isFullRefund = refundReq.type === "full";

    // D16 guard: never reverse or refund more than the order was worth. The
    // request route enforces this at submission time, but the order total can be
    // re-read between request and process, so re-assert here. Release the claim
    // so the row returns to 'pending' rather than being stranded in 'processing'.
    const orderTotalCents = Math.round(Number(order.total) * 100);
    if (refundAmountCents > orderTotalCents) {
      await releaseClaim(db, "refund_requests", refundRequestId);
      return NextResponse.json(
        { error: "Refund amount exceeds the order total." },
        { status: 400 },
      );
    }

    // D16: shipping is NOT shared revenue. The artist keeps 100% of it and pays
    // the courier from it (webhooks/stripe adds shippingCost straight to
    // artistRevenue), so a partial reversal must pro-rate against the SUBTOTAL,
    // not order.total. Reversing against total would claw back a slice of the
    // shipping the artist already spent. A shipping-inclusive partial refund
    // reverses the shipping portion against the artist leg only.
    const subtotalPence = Math.round(Number(order.subtotal) * 100);
    const artworkRefundPence = Math.min(refundAmountCents, subtotalPence);
    const shippingRefundPence = Math.max(0, refundAmountCents - subtotalPence);

    // Look up transfers for this order
    const { data: transfers } = await db
      .from("stripe_transfers")
      .select("*")
      .eq("order_id", order.id)
      .in("status", ["pending", "paid"]);

    // 1. Cancel or reverse transfers
    // F32: if a transfer reversal fails we must NOT proceed to refund the
    // buyer, because then the platform eats the difference. Abort with 502
    // so the admin can investigate manually.
    const failedReversals: string[] = [];
    if (transfers && transfers.length > 0) {
      for (const transfer of transfers) {
        if (transfer.status === "pending") {
          // Transfer hasn't been sent yet, cancel it
          await db
            .from("stripe_transfers")
            .update({ status: "cancelled" })
            .eq("id", transfer.id);
        } else if (transfer.status === "paid" && transfer.stripe_transfer_id) {
          // Transfer was already sent to Connect account, reverse it
          try {
            const reverseAmount = isFullRefund
              ? transfer.amount_cents
              : (() => {
                  const base = subtotalPence > 0
                    ? Math.round(transfer.amount_cents * (artworkRefundPence / subtotalPence))
                    : 0;
                  // Only the artist leg carries shipping.
                  const ship = transfer.recipient_type === "artist" ? shippingRefundPence : 0;
                  return Math.min(transfer.amount_cents, base + ship);
                })();

            // Idempotency key scoped per transfer so retries dedupe safely.
            await stripe.transfers.createReversal(
              transfer.stripe_transfer_id,
              { amount: reverseAmount },
              { idempotencyKey: `refund:${refundRequestId}:reversal:${transfer.id}` },
            );

            await db
              .from("stripe_transfers")
              .update({ status: "reversed" })
              .eq("id", transfer.id);
          } catch (reverseErr) {
            console.error(`Transfer reversal error for ${transfer.stripe_transfer_id}:`, reverseErr);
            failedReversals.push(transfer.stripe_transfer_id as string);
          }
        }
      }
    }

    if (failedReversals.length > 0) {
      await releaseClaim(db, "refund_requests", refundRequestId);
      return NextResponse.json(
        {
          error: "Could not reverse one or more artist/venue transfers. Refund aborted to avoid negative platform balance. Investigate in Stripe dashboard.",
          failedTransfers: failedReversals,
        },
        { status: 502 },
      );
    }

    // 2. Create the Stripe refund to the buyer
    let stripeRefund;
    try {
      const refundParams: { payment_intent: string; amount?: number } = {
        payment_intent: paymentIntentId as string,
      };
      // For partial refunds, specify the amount; for full, let Stripe handle it.
      if (!isFullRefund) {
        refundParams.amount = refundAmountCents;
      }
      // Idempotency key scoped to this refund request so retries dedupe safely.
      stripeRefund = await stripe.refunds.create(
        refundParams,
        { idempotencyKey: `refund:${refundRequestId}:refund` },
      );
    } catch (stripeErr) {
      console.error("Stripe refund error:", stripeErr);
      await releaseClaim(db, "refund_requests", refundRequestId);
      return NextResponse.json(
        { error: "Stripe refund failed. The transfers may have been cancelled/reversed, check manually." },
        { status: 502 },
      );
    }

    // 3. Update order status
    const newStatus = isFullRefund ? "refunded" : "partially_refunded";
    const history = Array.isArray(order.status_history) ? order.status_history : [];
    history.push({
      status: newStatus,
      timestamp: new Date().toISOString(),
      refund_request_id: refundRequestId,
    });

    await db
      .from("orders")
      .update({
        status: newStatus,
        // status_history is jsonb — pass the array raw, not stringified.
        // Stringifying here results in a quoted JSON string in Postgres,
        // which subsequent code paths trying to read history.length on
        // an Array will silently see 0 entries.
        status_history: history,
      })
      .eq("id", order.id);

    // D17: a full refund returns the piece(s) to sale, so restock each work.
    // Only full refunds restock — a partial refund is a price adjustment, the
    // buyer keeps the artwork. Best-effort: the money has already moved, so a
    // restock failure is logged, never fatal (blocking here would strand the
    // refund). Two item shapes exist in prod: cart orders carry a work id per
    // line (workId, persisted since D17); offer orders carry a work_ids array on
    // a single synthetic item. Handle both; legacy cart orders predating the
    // persisted workId simply have nothing to key on and are skipped.
    if (isFullRefund) {
      const items = Array.isArray(order.items) ? order.items : [];
      const restocks: Array<{ workId: string; qty: number }> = [];
      for (const raw of items as Array<Record<string, unknown>>) {
        if (Array.isArray(raw.work_ids)) {
          for (const id of raw.work_ids as unknown[]) {
            if (typeof id === "string" && id) restocks.push({ workId: id, qty: 1 });
          }
          continue;
        }
        const workId = (raw.workId || raw.id) as string | undefined;
        const qty = Number((raw.quantity ?? raw.qty) ?? 1);
        if (workId && Number.isFinite(qty) && qty > 0) restocks.push({ workId, qty });
      }
      for (const { workId, qty } of restocks) {
        const { error: restockErr } = await db.rpc("restock_work", {
          p_work_id: workId,
          p_qty: qty,
        });
        if (restockErr) console.error("[refunds/process] restock failed", { workId, restockErr });
      }
    }

    // Phase 2.3 J1: full refunds drop a lifecycle event so the K3
    // stepper / future order-events consumers see the state change.
    // Partial refunds don't currently produce a lifecycle event —
    // there is no order.partially_refunded type. Best-effort, swallow
    // errors so the refund itself isn't undone if logging fails.
    if (isFullRefund) {
      try {
        const { recordOrderEvent } = await import("@/lib/orders/lifecycle");
        await recordOrderEvent({
          orderId: order.id,
          newStatus: "refunded",
          actorUserId: userId,
          buyerEmail: order.buyer_email ?? null,
          data: {
            firstName: order.buyer_email
              ? (order.buyer_email as string).split("@")[0]
              : "there",
            orderNumber: order.id,
            orderUrl: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://wallplace.co.uk"}/orders/${order.id}`,
          },
          metadata: { refund_request_id: refundRequestId },
        });
      } catch (err) {
        console.error("[refunds/process] lifecycle hook:", err);
      }
    }

    // 4. Update refund request status (terminal — claim becomes 'approved')
    await db
      .from("refund_requests")
      .update({
        status: "approved",
        processed_by: userId,
        processed_at: new Date().toISOString(),
        stripe_refund_id: stripeRefund.id,
      })
      .eq("id", refundRequestId);

    // 5. Notify the buyer (legacy helper, retained as safety net) + send
    // the polished CustomerRefundConfirmation via the new pipeline so the
    // email lands in email_events and respects preferences.
    const refundRequesterEmail = refundReq.requester_email as string | null | undefined;
    const orderBuyerEmail = order.buyer_email as string | null | undefined;
    if (refundRequesterEmail || orderBuyerEmail) {
      const buyerEmail = (refundRequesterEmail || orderBuyerEmail) as string;
      await notifyRefundDecision({
        buyerEmail,
        orderId: order.id,
        approved: true,
        amount: refundReq.amount as number,
      }).catch((err) => { if (err) console.error("notifyRefundDecision error:", err); });

      // In-app bell for the buyer if they're an account holder. The
      // refund_requests row carries the requester's user id, fall back
      // to the order's buyer_user_id so we don't miss the cases where
      // the buyer is the same person as the requester. Pure best
      // effort, a missing bell shouldn't break the refund.
      const buyerUserId = (refundReq.requester_user_id || order.buyer_user_id) as string | null ?? null;
      if (buyerUserId) {
        createNotification({
          userId: buyerUserId,
          kind: "refund_approved",
          title: `Refund approved, £${Number(refundReq.amount).toFixed(2)}`,
          body: `Your refund on ${order.id} has been processed and should arrive within 5 business days.`,
          link: `/customer-portal/orders?id=${encodeURIComponent(order.id as string)}`,
        }).catch((err) => { if (err) console.error("Buyer refund bell error:", err); });
      }

      const shippingFullName = (order.shipping as { fullName?: string } | null)?.fullName || "";
      const buyerFirstName = shippingFullName.split(" ")[0] || "there";
      await sendEmail({
        idempotencyKey: `customer_refund:${refundRequestId}`,
        template: "customer_refund_confirmation",
        category: "orders_and_payouts",
        to: buyerEmail,
        subject: `Refund on the way for order ${order.id}`,
        react: CustomerRefundConfirmation({
          firstName: buyerFirstName,
          orderNumber: order.id as string,
          refundAmount: { amount: refundAmountCents, currency: "GBP" },
          refundReason: (refundReq.reason as string | undefined) || undefined,
          expectedArrival: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
          supportUrl: `${SITE}/support`,
        }),
        metadata: { orderId: order.id, refundRequestId },
      });
    }

    // Artist-side refund notification, so they can track what's owed back.
    if (order.artist_user_id) {
      try {
        const { data: { user: artistUser } } = await db.auth.admin.getUserById(order.artist_user_id as string);
        const { data: artistProfile } = await db.from("artist_profiles").select("name").eq("user_id", order.artist_user_id).single();
        if (artistUser?.email) {
          const items = Array.isArray(order.items) ? order.items : [];
          const workTitle = (items[0] as { title?: string })?.title || "Artwork";
          await sendEmail({
            idempotencyKey: `artist_refund:${refundRequestId}`,
            template: "artist_refund_notification",
            category: "orders_and_payouts",
            to: artistUser.email,
            subject: `Refund issued on order ${order.id}`,
            userId: order.artist_user_id as string,
            react: ArtistRefundNotification({
              firstName: ((artistProfile?.name as string | null | undefined) || "there").split(" ")[0],
              orderNumber: order.id as string,
              workTitle,
              refundAmount: { amount: refundAmountCents, currency: "GBP" },
              reason: (refundReq.reason as string | undefined) || undefined,
              supportUrl: `${SITE}/support`,
            }),
            metadata: { orderId: order.id, refundRequestId },
          });
        }
      } catch (err) {
        console.error("Artist refund email error:", err);
      }

      // In-app bell on the artist side mirroring the email, so the
      // refund event surfaces in their notifications drawer instead
      // of being email-only. ArtistRefundNotification's
      // hasInAppEquivalent flag was already set; this is the missing
      // half of that contract.
      createNotification({
        userId: order.artist_user_id as string,
        kind: "refund_approved",
        title: `Refund issued, £${Number(refundReq.amount).toFixed(2)}`,
        body: `Order ${order.id} was refunded. Any payout already transferred will be reversed.`,
        link: `/artist-portal/orders?id=${encodeURIComponent(order.id as string)}`,
      }).catch((err) => { if (err) console.error("Artist refund bell error:", err); });
    }

    // E30a / G3. This is the only path by which an artist-initiated refund gets
    // approved, it moves real money through Stripe, and it left no trail.
    // 03 §2.1 says explicitly not to force this route through withAdmin, because
    // artists legitimately call it too; the audit belongs inside the admin
    // branch. Additive only: it adds a row, it does not change the refund, and
    // recordAdminAction never throws.
    if (admin) {
      await recordAdminAction({
        adminUserId: userId,
        action: "refund_approved_by_admin",
        context: {
          orderId: order.id,
          refundRequestId,
          amount: refundReq.amount,
          stripeRefundId: stripeRefund.id,
          orderStatus: newStatus,
          requesterType: refundReqForAuthz.requester_type,
        },
      });
    }

    return NextResponse.json({
      success: true,
      status: "approved",
      stripeRefundId: stripeRefund.id,
      orderStatus: newStatus,
    });
  } catch (err) {
    // An unexpected throw after a successful claim (e.g. the order-status update
    // or getUserById) would otherwise leave the row stuck in 'processing'. Log
    // it, best-effort release any claim we took, and return a 500 (not a
    // misleading 400). The explicit error paths above each handle their own
    // releaseClaim and return before reaching here, so we never double-release.
    console.error("[refunds/process] unexpected error", err);
    if (claimedRefundId) {
      await releaseClaim(db, "refund_requests", claimedRefundId).catch(() => {});
    }
    return NextResponse.json({ error: "Failed to process refund" }, { status: 500 });
  }
}
