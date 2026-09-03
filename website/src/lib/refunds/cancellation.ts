// WS3.1 (missing-events gap 1). The refund that follows a cancellation.
//
// Cancelling a paid order used to keep the buyer's money: the status changed,
// pending payouts were cancelled, and nothing ever refunded. This helper is
// the cancellation's money tail, carrying the refund engine's invariants:
// reversal-BEFORE-refund (a failed clawback aborts the refund so the platform
// never eats the gap), a per-order idempotency key on every Stripe call so a
// retry cannot double-refund, restock, and the buyer's confirmation email.
//
// It deliberately does NOT resurrect the order or change its status: the
// order stays "cancelled" (the human action), and the refund_requests row it
// was handed records the money outcome.

import type { SupabaseClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe";
import { sendEmail } from "@/lib/email/send";
import { CustomerRefundConfirmation } from "@/emails/templates/orders/CustomerRefundConfirmation";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";

/**
 * A book-vs-Stripe mismatch that no code path can repair. Best effort: the
 * money has already moved, so failing to alert must not also throw.
 */
async function alertBookMismatch(key: string, subject: string, summary: string): Promise<void> {
  try {
    const { sendAdminAlert } = await import("@/lib/email/admin-alert");
    await sendAdminAlert({ idempotencyKey: key, subject, summary, metadata: { key } });
  } catch (alertErr) {
    console.error("[cancel-refund] mismatch alert failed:", key, alertErr);
  }
}

export async function processCancellationRefund(
  db: SupabaseClient,
  args: { refundRequestId: string; orderId: string },
): Promise<void> {
  const { data: order, error: orderErr } = await db
    .from("orders")
    .select("id, buyer_email, stripe_payment_intent_id, items")
    .eq("id", args.orderId)
    .single();
  if (orderErr || !order) throw new Error(orderErr?.message || "order not found");
  if (!order.stripe_payment_intent_id) throw new Error("order has no payment intent");

  // Claw back anything already paid out. Reversal failure ABORTS: refunding
  // the buyer while an artist keeps the money would leave the platform
  // holding the difference.
  const { data: paidLegs } = await db
    .from("stripe_transfers")
    .select("id, stripe_transfer_id")
    .eq("order_id", args.orderId)
    .eq("status", "paid");
  for (const leg of (paidLegs || []) as Array<{ id: string; stripe_transfer_id: string | null }>) {
    if (!leg.stripe_transfer_id) continue;
    await stripe.transfers.createReversal(
      leg.stripe_transfer_id,
      {},
      { idempotencyKey: `cancel:${args.orderId}:reversal:${leg.id}` },
    );
    const { error: legErr } = await db
      .from("stripe_transfers")
      .update({ status: "reversed", updated_at: new Date().toISOString() })
      .eq("id", leg.id);
    if (legErr) {
      // Stripe has reversed the transfer but our ledger still calls it paid.
      // Nothing here can undo the Stripe side, so the only correct move is to
      // make the mismatch loud rather than let the books drift quietly.
      await alertBookMismatch(
        `cancel_reversal_unrecorded:${args.orderId}:${leg.id}`,
        "Transfer reversed in Stripe but the ledger row did not update",
        `Order ${args.orderId}: transfer ${leg.stripe_transfer_id} was reversed in Stripe, ` +
          `but stripe_transfers row ${leg.id} could not be marked reversed (${legErr.message}). ` +
          `The ledger still reads 'paid', so earnings and reconciliation are overstated until this row is corrected.`,
      );
    }
  }

  const refund = await stripe.refunds.create(
    { payment_intent: order.stripe_payment_intent_id },
    { idempotencyKey: `cancel:${args.orderId}:refund` },
  );

  // The refund id on this row is what lets the charge.refunded webhook tell
  // this refund (ours, already booked) from a dashboard refund it has to
  // reconcile. Stripe echoes every refund back as charge.refunded, and the
  // order stays `cancelled` rather than `refunded`, so before the webhook
  // checked this row it re-ran its full-refund branch on our own refund: legs
  // reversed a second time, stock restored twice, a second buyer email.
  const { error: reqErr } = await db
    .from("refund_requests")
    .update({
      status: "approved",
      stripe_refund_id: refund.id,
      processed_at: new Date().toISOString(),
    })
    .eq("id", args.refundRequestId);
  if (reqErr) {
    // The buyer HAS been refunded. If this row stays 'pending', the admin
    // refunds queue shows it as outstanding and a second refund is one click
    // away, so this failure has to reach a human.
    await alertBookMismatch(
      `cancel_refund_unrecorded:${args.orderId}`,
      "Buyer refunded but the refund request still reads pending",
      `Order ${args.orderId} was refunded in Stripe (${refund.id}), but refund request ` +
        `${args.refundRequestId} could not be marked approved (${reqErr.message}). ` +
        `It will still appear outstanding in the admin refunds queue: do NOT refund it again, ` +
        `close the row by hand.`,
    );
  }

  // The sale is undone, so the stock comes back.
  for (const item of ((order.items as Array<{ workId?: string; quantity?: number; qty?: number }>) || [])) {
    if (!item.workId) continue;
    const { error: restockErr } = await db.rpc("restock_work", {
      p_work_id: item.workId,
      p_qty: Number(item.qty ?? item.quantity ?? 1),
    });
    if (restockErr) console.warn("[cancel-refund] restock failed:", restockErr);
  }

  if (order.buyer_email) {
    try {
      await sendEmail({
        idempotencyKey: `refund:${args.orderId}:cancelled`,
        template: "customer_refund_confirmation",
        category: "orders_and_payouts",
        to: order.buyer_email,
        subject: `Your refund for order ${args.orderId}`,
        react: CustomerRefundConfirmation({
          firstName: "there",
          orderNumber: args.orderId,
          refundAmount: { amount: refund.amount, currency: "GBP" },
          refundReason: "Order cancelled",
          expectedArrival: "5 to 10 business days",
          supportUrl: `${SITE}/support`,
        }),
        metadata: { orderId: args.orderId },
      });
    } catch (mailErr) {
      console.warn("[cancel-refund] buyer email failed:", mailErr);
    }
  }
}
