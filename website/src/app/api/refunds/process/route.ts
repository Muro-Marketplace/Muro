import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { notifyRefundDecision } from "@/lib/email";
import { sendEmail } from "@/lib/email/send";
import { CustomerRefundConfirmation } from "@/emails/templates/orders/CustomerRefundConfirmation";
import { ArtistRefundNotification } from "@/emails/templates/orders/ArtistRefundNotification";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";

export async function POST(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const { refundRequestId, action, reason } = body;

    if (!refundRequestId || !action) {
      return NextResponse.json({ error: "refundRequestId and action are required" }, { status: 400 });
    }

    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
    }

    const db = getSupabaseAdmin();
    const userId = auth.user!.id;

    // Fetch the refund request
    const { data: refundReq, error: reqErr } = await db
      .from("refund_requests")
      .select("*")
      .eq("id", refundRequestId)
      .single();

    if (reqErr || !refundReq) {
      return NextResponse.json({ error: "Refund request not found" }, { status: 404 });
    }

    if (refundReq.status !== "pending") {
      return NextResponse.json({ error: "Refund request has already been processed" }, { status: 409 });
    }

    // Fetch the order
    const { data: order, error: orderErr } = await db
      .from("orders")
      .select("*")
      .eq("id", refundReq.order_id)
      .single();

    if (orderErr || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Verify the user is the artist for this order, or an admin
    const isArtist = order.artist_user_id === userId;
    const { data: adminProfile } = await db
      .from("admin_users")
      .select("id")
      .eq("user_id", userId)
      .limit(1);
    const isAdmin = adminProfile && adminProfile.length > 0;

    if (!isArtist && !isAdmin) {
      return NextResponse.json({ error: "Not authorised to process this refund" }, { status: 403 });
    }

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
        return NextResponse.json({ error: "Failed to reject refund request" }, { status: 500 });
      }

      // Notify the requester (fire-and-forget)
      if (refundReq.requester_email || order.buyer_email) {
        notifyRefundDecision({
          buyerEmail: refundReq.requester_email || order.buyer_email,
          orderId: order.id,
          approved: false,
          reason: reason || undefined,
        }).catch((err) => { if (err) console.error("Fire-and-forget error:", err); });
      }

      return NextResponse.json({ success: true, status: "rejected" });
    }

    // ─── Approve ───
    const paymentIntentId = order.stripe_payment_intent_id;
    if (!paymentIntentId) {
      return NextResponse.json(
        { error: "No payment intent found for this order. Refund cannot be processed automatically." },
        { status: 422 },
      );
    }

    const refundAmountCents = Math.round(refundReq.amount * 100);
    const isFullRefund = refundReq.type === "full";

    // Look up transfers for this order
    const { data: transfers } = await db
      .from("stripe_transfers")
      .select("*")
      .eq("order_id", order.id)
      .in("status", ["pending", "paid"]);

    // 1. Cancel or reverse transfers
    // F32, if a transfer reversal fails we must NOT proceed to refund the
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
              : Math.round(transfer.amount_cents * (refundAmountCents / Math.round(order.total * 100)));

            await stripe.transfers.createReversal(transfer.stripe_transfer_id, {
              amount: reverseAmount,
            });

            await db
              .from("stripe_transfers")
              .update({ status: "reversed" })
              .eq("id", transfer.id);
          } catch (reverseErr) {
            console.error(`Transfer reversal error for ${transfer.stripe_transfer_id}:`, reverseErr);
            failedReversals.push(transfer.stripe_transfer_id);
          }
        }
      }
    }

    if (failedReversals.length > 0) {
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
        payment_intent: paymentIntentId,
      };
      // For partial refunds, specify the amount; for full, let Stripe handle it
      if (!isFullRefund) {
        refundParams.amount = refundAmountCents;
      }
      stripeRefund = await stripe.refunds.create(refundParams);
    } catch (stripeErr) {
      console.error("Stripe refund error:", stripeErr);
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
        status_history: JSON.stringify(history),
      })
      .eq("id", order.id);

    // 4. Update refund request status
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
    if (refundReq.requester_email || order.buyer_email) {
      const buyerEmail = refundReq.requester_email || order.buyer_email;
      notifyRefundDecision({
        buyerEmail,
        orderId: order.id,
        approved: true,
        amount: refundReq.amount,
      }).catch((err) => { if (err) console.error("Fire-and-forget error:", err); });

      const buyerFirstName = (order.shipping?.fullName || "").split(" ")[0] || "there";
      await sendEmail({
        idempotencyKey: `customer_refund:${refundRequestId}`,
        template: "customer_refund_confirmation",
        category: "orders_and_payouts",
        to: buyerEmail,
        subject: `Refund on the way for order ${order.id}`,
        react: CustomerRefundConfirmation({
          firstName: buyerFirstName,
          orderNumber: order.id,
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
        const { data: { user: artistUser } } = await db.auth.admin.getUserById(order.artist_user_id);
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
            userId: order.artist_user_id,
            react: ArtistRefundNotification({
              firstName: (artistProfile?.name || "there").split(" ")[0],
              orderNumber: order.id,
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
    }

    return NextResponse.json({
      success: true,
      status: "approved",
      stripeRefundId: stripeRefund.id,
      orderStatus: newStatus,
    });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
