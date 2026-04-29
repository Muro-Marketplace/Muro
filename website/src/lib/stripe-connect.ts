import { stripe } from "./stripe";
import { getSupabaseAdmin } from "./supabase-admin";

/**
 * Schedule a transfer for later processing (14-day payout delay).
 * Records a "pending" entry in stripe_transfers. The transfer is
 * executed when the order is delivered or after 14 days via
 * /api/stripe-connect/process-pending.
 */
export async function scheduleTransfer(params: {
  orderId: string;
  recipientType: "venue" | "artist";
  recipientUserId: string;
  connectAccountId: string;
  amountCents: number;
}) {
  const db = getSupabaseAdmin();

  // Calculate payout date, 14 days from now
  const payoutAfter = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  await db.from("stripe_transfers").insert({
    order_id: params.orderId,
    recipient_type: params.recipientType,
    recipient_user_id: params.recipientUserId,
    stripe_transfer_id: "", // Empty until actually transferred
    stripe_connect_account_id: params.connectAccountId,
    amount_cents: params.amountCents,
    status: "pending",
    payout_after: payoutAfter,
  });
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

  const transfer = await stripe.transfers.create({
    amount: pending.amount_cents,
    currency: pending.currency || "gbp",
    destination: pending.stripe_connect_account_id,
    transfer_group: pending.order_id,
  });

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
