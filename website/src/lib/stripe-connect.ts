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
export interface ScheduleTransferParams {
  orderId: string;
  recipientType: "venue" | "artist";
  recipientUserId: string;
  connectAccountId: string;
  amountCents: number;
  /** Skip the 14-day hold and fire the transfer right away. Used for
   *  collection-fulfilment orders (in-store handover). */
  immediate?: boolean;
}

export async function scheduleTransfer(params: ScheduleTransferParams): Promise<string> {
  const db = getSupabaseAdmin();

  // C3: the ledger insert MUST NOT vanish. The old code discarded the insert
  // error, so a failed insert (RLS, connection blip, bad column) returned
  // normally and the caller believed the payout was scheduled — nobody paid, no
  // trace (E37). Validate the inputs, and throw on any insert failure the caller
  // must not swallow.
  if (!params.connectAccountId) {
    throw new Error(`scheduleTransfer: empty connectAccountId for order ${params.orderId}`);
  }
  if (!Number.isInteger(params.amountCents) || params.amountCents <= 0) {
    throw new Error(`scheduleTransfer: bad amountCents ${params.amountCents} for order ${params.orderId}`);
  }

  // Hold window. Default 14 days for shipped orders; immediate (now) for in-store
  // collection where there's no shipment to worry about.
  const holdMs = params.immediate ? 0 : 14 * 24 * 60 * 60 * 1000;
  const payoutAfter = new Date(Date.now() + holdMs).toISOString();

  const { data: inserted, error } = await db
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

  if (error) {
    // UNIQUE (order_id, recipient_user_id) — a webhook replay. Return the
    // existing row's id so the caller's flow is unchanged and idempotent.
    if ((error as { code?: string }).code === "23505") {
      const { data: existing } = await db
        .from("stripe_transfers")
        .select("id")
        .eq("order_id", params.orderId)
        .eq("recipient_user_id", params.recipientUserId)
        .maybeSingle();
      if (existing?.id) return existing.id;
    }
    // Anything else is a lost payout. The caller MUST NOT swallow this.
    throw new Error(
      `scheduleTransfer: ledger insert failed for order=${params.orderId} ` +
        `recipient=${params.recipientUserId}: ${error.message}`,
    );
  }
  if (!inserted?.id) {
    throw new Error(`scheduleTransfer: ledger insert returned no row for order ${params.orderId}`);
  }

  // For immediate payouts, execute the transfer right now so the recipient
  // doesn't wait for the next cron sweep. If the execute call fails the row stays
  // `pending` and the sweep retries; the ledger row exists either way, so this is
  // recoverable and NOT fatal, unlike a missing row.
  if (params.immediate) {
    try {
      await executeTransfer(inserted.id);
    } catch (err) {
      console.error("[stripe-connect] immediate transfer execution failed:", err);
    }
  }
  return inserted.id;
}

/**
 * A payout we owe but cannot yet send (recipient's Connect account not payout-
 * ready). Written to the ledger as 'blocked' so it appears in reconciliation
 * instead of vanishing into a log line (C3, referenced by the webhook B2/B3 legs).
 *
 * Takes the amount in integer pence (the ledger's native unit) to avoid a lossy
 * pounds round-trip; the doc drafted it as `netGbp`. Idempotent: a duplicate
 * (order_id, recipient_user_id) is the same blocked leg, so a 23505 is swallowed.
 */
export async function recordBlockedLeg(
  db: ReturnType<typeof getSupabaseAdmin>,
  args: { orderId: string; recipientType?: "artist" | "venue"; recipientUserId: string; amountCents: number; reason: string },
): Promise<void> {
  const { error } = await db.from("stripe_transfers").insert({
    order_id: args.orderId,
    recipient_type: args.recipientType ?? "artist",
    recipient_user_id: args.recipientUserId,
    stripe_transfer_id: "",
    stripe_connect_account_id: "",
    amount_cents: args.amountCents,
    status: "blocked",
    last_error: `payout_capability:${args.reason}`,
    payout_after: null,
  });
  if (error && (error as { code?: string }).code !== "23505") {
    throw new Error(`recordBlockedLeg failed for order ${args.orderId}: ${error.message}`);
  }
}

/**
 * Execute a transfer immediately (e.g. when an order is delivered, or from the
 * retry sweep). Accepts both `pending` and `failed` rows: `failed` is no longer
 * terminal (C4), it is a retryable state the sweep re-attempts with backoff. The
 * Stripe idempotency key is stable across attempts, so a retry after a timeout
 * returns the original transfer rather than creating a second one.
 */
export async function executeTransfer(transferId: string) {
  const db = getSupabaseAdmin();

  const { data: pending } = await db
    .from("stripe_transfers")
    .select("*")
    .eq("id", transferId)
    .in("status", ["pending", "failed"])
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
const MAX_RETRIES = 6;
/** Exponential backoff in minutes between attempts: 1, 4, 15, 60, 240, 960 (16h). */
const BACKOFF_MINUTES = [1, 4, 15, 60, 240, 960];

export interface SweepResult {
  processed: number;
  retried: number;
  exhausted: number;
  errors: string[];
}

/**
 * Alert an operator that a payout has exhausted its retries (C4). Email only,
 * matching the codebase's admin-notify pattern (notifyAdminBillingStalled).
 * Best-effort: a mail failure must not break the sweep. Imported lazily so the
 * transfer module does not pull the email stack into every caller.
 */
async function alertExhaustedPayout(
  record: { id: string; order_id: string; recipient_type: string; recipient_user_id: string; amount_cents: number },
  lastError: string,
): Promise<void> {
  try {
    const { notifyAdminPayoutExhausted } = await import("@/lib/email");
    await notifyAdminPayoutExhausted({
      transferId: record.id,
      orderId: record.order_id,
      recipientType: record.recipient_type,
      recipientUserId: record.recipient_user_id,
      amountCents: record.amount_cents,
      lastError,
    });
  } catch (err) {
    console.error("[stripe-connect] exhausted-payout alert failed:", err);
  }
}

/**
 * Process transfers due for payout: 'pending' (hold expired, never attempted)
 * and retryable 'failed' (a transient error whose backoff has elapsed). 'failed'
 * is no longer terminal (C4) — the old sweep wrote it once and never looked
 * again, so a Stripe rate-limit or a 30-second blip permanently killed a payout.
 * On failure a row is re-scheduled with exponential backoff up to MAX_RETRIES,
 * after which it is left 'failed' and an operator is alerted.
 *
 * Called by /api/stripe-connect/process-pending (cron or manual).
 */
export async function processPendingTransfers(): Promise<SweepResult> {
  const db = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  const { data: due, error: selErr } = await db
    .from("stripe_transfers")
    .select("*")
    .in("status", ["pending", "failed"])
    .lt("retry_count", MAX_RETRIES)
    .lte("payout_after", nowIso)
    .order("payout_after", { ascending: true })
    .limit(200);

  if (selErr) throw new Error(`transfer sweep select failed: ${selErr.message}`);
  if (!due || due.length === 0) return { processed: 0, retried: 0, exhausted: 0, errors: [] };

  const result: SweepResult = { processed: 0, retried: 0, exhausted: 0, errors: [] };

  for (const record of due) {
    // Respect the backoff. A failed row is retryable only once next_attempt_at
    // has elapsed; a pending row has next_attempt_at null and is always due. This
    // is a code-side check rather than a PostgREST .or() filter because a
    // timestamp value cannot pass the orFilter injection guard (colons).
    if (record.next_attempt_at && new Date(record.next_attempt_at as string) > new Date()) continue;
    try {
      const { data: order } = await db
        .from("orders")
        .select("status")
        .eq("id", record.order_id)
        .maybeSingle();
      // Placement payouts use a synthetic order_id with no orders row; a missing
      // order is only a cancellation signal for real order ids.
      if (order?.status === "cancelled" || order?.status === "refunded") {
        await db
          .from("stripe_transfers")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("id", record.id);
        continue;
      }

      await executeTransfer(record.id);
      result.processed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const nextCount = (record.retry_count ?? 0) + 1;
      const exhausted = nextCount >= MAX_RETRIES;
      const backoff = BACKOFF_MINUTES[Math.min(nextCount - 1, BACKOFF_MINUTES.length - 1)];

      await db
        .from("stripe_transfers")
        .update({
          // 'failed' is a RETRYABLE state now. Only exhausted rows (retry_count
          // == MAX_RETRIES) need an operator to look.
          status: "failed",
          retry_count: nextCount,
          last_error: msg.slice(0, 500),
          next_attempt_at: new Date(Date.now() + backoff * 60_000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", record.id);

      result.errors.push(`Transfer ${record.id} (attempt ${nextCount}): ${msg}`);
      if (exhausted) {
        result.exhausted++;
        await alertExhaustedPayout(record, msg);
      } else {
        result.retried++;
      }
    }
  }

  return result;
}
