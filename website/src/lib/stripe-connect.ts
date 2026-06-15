import { stripe } from "./stripe";
import { getSupabaseAdmin } from "./supabase-admin";

/**
 * Schedule a transfer for later processing (default: 14-day payout delay).
 * Records a "pending" entry in stripe_transfers. The transfer is
 * executed when the order is delivered or after the hold period via
 * /api/stripe-connect/process-pending.
 *
 * Pass `immediate: true` for in-store/collection sales where the work
 * is handed over at the point of purchase, no shipping risk to insure
 * against, so the venue and artist are paid out at checkout time.
 * Pre-2026-05-15 this was a hard 14-day hold for every transfer, which
 * was the right model for shipped orders but wrong for QR-scan sales
 * at the venue counter.
 */
export async function scheduleTransfer(params: {
  orderId: string;
  recipientType: "venue" | "artist";
  recipientUserId: string;
  connectAccountId: string;
  amountCents: number;
  /** Skip the 14-day hold and fire the transfer right away. Used for
   *  collection-fulfilment orders (in-store handover). */
  immediate?: boolean;
}) {
  const db = getSupabaseAdmin();

  // Hold window. Default 14 days for shipped orders; immediate
  // (now) for in-store collection where there's no shipment to
  // worry about.
  const holdMs = params.immediate ? 0 : 14 * 24 * 60 * 60 * 1000;
  const payoutAfter = new Date(Date.now() + holdMs).toISOString();

  const { data: inserted } = await db
    .from("stripe_transfers")
    .insert({
      order_id: params.orderId,
      recipient_type: params.recipientType,
      recipient_user_id: params.recipientUserId,
      stripe_transfer_id: "", // Empty until actually transferred
      stripe_connect_account_id: params.connectAccountId,
      amount_cents: params.amountCents,
      status: "pending",
      payout_after: payoutAfter,
    })
    .select("id")
    .maybeSingle();

  // For immediate payouts, execute the transfer right now so the
  // recipient doesn't have to wait for the next cron sweep. If the
  // execute call fails the row stays in `pending` and the next cron
  // run will retry; the audit trail in stripe_transfers is preserved
  // either way.
  if (params.immediate && inserted?.id) {
    try {
      await executeTransfer(inserted.id);
    } catch (err) {
      console.error("[stripe-connect] immediate transfer execution failed:", err);
    }
  }
}

/**
 * Execute a pending transfer immediately (e.g. when order is delivered).
 */
export async function executeTransfer(transferId: string) {
  const db = getSupabaseAdmin();

  const { data: pending } = await db
    .from("stripe_transfers")
    .select("*")
    .eq("id", transferId)
    .eq("status", "pending")
    .single();

  if (!pending) return null;

  const transfer = await stripe.transfers.create(
    {
      amount: pending.amount_cents,
      currency: pending.currency || "gbp",
      destination: pending.stripe_connect_account_id,
      transfer_group: pending.order_id,
    },
    { idempotencyKey: `transfer:${transferId}` },
  );

  await db
    .from("stripe_transfers")
    .update({ stripe_transfer_id: transfer.id, status: "paid" })
    .eq("id", transferId);

  return transfer;
}

/**
 * Process all pending transfers that are past their payout_after date.
 * Called by /api/stripe-connect/process-pending (cron or manual).
 */
export async function processPendingTransfers() {
  const db = getSupabaseAdmin();

  const { data: pending } = await db
    .from("stripe_transfers")
    .select("*")
    .eq("status", "pending")
    .lte("payout_after", new Date().toISOString());

  if (!pending || pending.length === 0) return { processed: 0 };

  let processed = 0;
  const errors: string[] = [];

  for (const record of pending) {
    try {
      // Check the order hasn't been cancelled
      const { data: order } = await db
        .from("orders")
        .select("status")
        .eq("id", record.order_id)
        .single();

      if (order?.status === "cancelled") {
        // Cancel the transfer instead of paying out
        await db
          .from("stripe_transfers")
          .update({ status: "cancelled" })
          .eq("id", record.id);
        continue;
      }

      await executeTransfer(record.id);
      processed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Transfer ${record.id}: ${msg}`);
      await db
        .from("stripe_transfers")
        .update({ status: "failed" })
        .eq("id", record.id);
    }
  }

  return { processed, errors };
}
