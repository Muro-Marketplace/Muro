import { stripe } from "./stripe";
import { getSupabaseAdmin } from "./supabase-admin";
import { poundsToPence } from "@/lib/finance/order-money";

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

  // WS2.4 (audit R6.F13): claim the row BEFORE calling Stripe, so two
  // concurrent invocations (cron overlap, manual retry racing the sweep)
  // cannot both attempt it. The claim is a conditional bump of
  // next_attempt_at ten minutes ahead: the loser's conditional update
  // matches no row and backs off. Stripe's stable idempotency key remains
  // the second line of defence within its 24h window.
  if (pending.next_attempt_at && new Date(pending.next_attempt_at) > new Date()) {
    return null; // another attempt owns the row (or backoff not elapsed)
  }
  const claimUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  let claimQuery = db
    .from("stripe_transfers")
    .update({ next_attempt_at: claimUntil, updated_at: new Date().toISOString() })
    .eq("id", transferId)
    .eq("status", pending.status);
  claimQuery = pending.next_attempt_at
    ? claimQuery.eq("next_attempt_at", pending.next_attempt_at)
    : claimQuery.is("next_attempt_at", null);
  const { data: claimed } = await claimQuery.select("id");
  if (!claimed || claimed.length === 0) return null;

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
export interface ReconcileResult {
  /** Owed orders with no ledger row, now recorded as a blocked leg. */
  flagged: number;
  /**
   * Ids of owed orders with no resolvable artist recipient (null
   * artist_user_id). D55.3: this used to be a bare count, so an operator saw
   * "unresolved: 5" with no way to learn which orders to chase. Nearly half the
   * flagged population lands here, so the ids are the deliverable, not a nicety.
   */
  unresolved: string[];
  errors: string[];
}

/** Order statuses that mean the buyer has paid and money is owed to the artist. */
const OWED_ORDER_STATUSES = ["confirmed", "processing", "shipped", "delivered"];

/**
 * Reconcile orders that have money owed to an artist but NO stripe_transfers row
 * at all (D52.3). The retry sweep only re-tries rows that EXIST, so it is blind to
 * the failure that produces nothing: a ledger INSERT that threw, a webhook that
 * never ran, or a duplicate redelivery that early-returned.
 *
 * D55.2: keyed on "money came in and nothing went out" (total > 0 + owed status +
 * no ledger row), NOT on artist_revenue. Keying on artist_revenue was blind to the
 * order it most needed to find: `artist_revenue = 0` is the SIGNATURE of the D4
 * attribution failure (WP-WSP06D, £64.49 taken, nothing attributed), not evidence
 * nothing is owed, and `.gt("artist_revenue", 0)` filtered exactly those out.
 *
 * Records the owed amount as a 'blocked' ledger row (reason
 * `reconciliation:missing_ledger`) rather than auto-scheduling a payout: a blocked
 * row SURFACES the owed money for an operator without paying it, which keeps the
 * manual Stripe reconciliation (D11) the human's call. Idempotent via the
 * (order_id, recipient_user_id) unique index, so it is safe to run every sweep. An
 * order with no resolvable recipient OR no computed owed amount (artist_revenue 0,
 * the D4 shape — a £0 leg would violate the amount_cents > 0 CHECK anyway) goes to
 * `unresolved` with its id for an operator to resolve (D42.4).
 */
export async function reconcileOrdersWithoutLegs(): Promise<ReconcileResult> {
  const db = getSupabaseAdmin();

  const { data: owed, error } = await db
    .from("orders")
    .select("id, artist_user_id, artist_revenue, status, total")
    .gt("total", 0)
    .in("status", OWED_ORDER_STATUSES)
    .limit(500);

  if (error) throw new Error(`reconcile select failed: ${error.message}`);
  if (!owed || owed.length === 0) return { flagged: 0, unresolved: [], errors: [] };

  const orderIds = owed.map((o) => o.id);
  const { data: existing } = await db
    .from("stripe_transfers")
    .select("order_id")
    .in("order_id", orderIds);
  const haveLegs = new Set((existing || []).map((r) => r.order_id));

  const result: ReconcileResult = { flagged: 0, unresolved: [], errors: [] };
  for (const o of owed) {
    if (haveLegs.has(o.id)) continue; // a ledger row exists; the sweep/webhook owns it
    // K6: was `Math.round(Number(o.artist_revenue) * 100)`, a fifth copy of the
    // pounds→pence conversion. Identical for every finite value; safer for a
    // NaN, which used to survive as NaN (and `NaN <= 0` is false, so it passed
    // the guard below and would have been recorded as a NaN-cent leg) and now
    // becomes 0 and is routed to `unresolved` for an operator, which is where
    // an amount nobody can compute belongs.
    const owedCents = poundsToPence(o.artist_revenue);
    if (!o.artist_user_id || owedCents <= 0) {
      // No recipient, OR no computed owed amount (artist_revenue 0 on a total > 0
      // order — the D4 attribution-failure signature). A £0 blocked leg would
      // violate the amount_cents > 0 CHECK, so there is nothing valid to record:
      // an operator must resolve it. D55.3: keep the id, not just a count.
      result.unresolved.push(o.id);
      continue;
    }
    try {
      await recordBlockedLeg(db, {
        orderId: o.id,
        recipientUserId: o.artist_user_id,
        amountCents: owedCents,
        reason: "reconciliation:missing_ledger",
      });
      result.flagged++;
    } catch (err) {
      result.errors.push(`Order ${o.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return result;
}

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
    // K1: was notifyAdminPayoutExhausted in the legacy module. Still a dynamic
    // import so the transfer module does not pull the email stack into every
    // caller. Keyed on the transfer id, so a re-run of the sweep over the same
    // exhausted record does not re-alert.
    const { sendAdminAlert } = await import("@/lib/email/admin-alert");
    await sendAdminAlert({
      idempotencyKey: `admin_payout_exhausted:${record.id}`,
      subject: `Payout exhausted its retries: ${record.order_id}`,
      summary:
        "A Stripe Connect transfer failed on every attempt and will not be retried again. It needs a person.",
      fields: [
        { label: "Order", value: record.order_id },
        { label: "Transfer", value: record.id },
        { label: "Recipient", value: `${record.recipient_type} ${record.recipient_user_id}` },
        { label: "Amount", value: `£${(record.amount_cents / 100).toFixed(2)}` },
        { label: "Last error", value: lastError },
      ],
      actionPath: "/admin/financials",
      actionLabel: "Open financials",
    });
  } catch (err) {
    console.error("[stripe-connect] exhausted-payout alert failed:", err);
  }

  // Email audit 2026-09-03 (6c). The artist whose money is stuck heard
  // nothing: this alerted an operator and stopped there, so the first they
  // knew was the payout not arriving. Best-effort and after the admin alert,
  // which is the one that must not be lost.
  if (record.recipient_type === "artist") {
    await notifyArtist(record.recipient_user_id, async (artist) => {
      const { sendEmail } = await import("@/lib/email/send");
      const { ArtistPayoutRetriesExhausted } = await import(
        "@/emails/templates/payments/ArtistPayoutRetriesExhausted"
      );
      const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";
      await sendEmail({
        // Keyed on the transfer, so a re-run of the sweep over the same
        // exhausted record does not re-send.
        idempotencyKey: `artist_payout_exhausted:${record.id}`,
        template: "artist_payout_retries_exhausted",
        category: "orders_and_payouts",
        to: artist.email,
        userId: artist.userId,
        subject: `We could not send your payout for ${record.order_id}`,
        react: ArtistPayoutRetriesExhausted({
          firstName: artist.firstName,
          orderNumber: record.order_id,
          payoutAmount: { amount: record.amount_cents, currency: "GBP" },
          payoutDetailsUrl: `${SITE}/artist-portal/billing`,
          supportUrl: `${SITE}/support`,
        }),
        metadata: { transferId: record.id, orderId: record.order_id },
      });
    });
  }
}

/**
 * Resolve an artist's email and greeting, then run `send`. Every failure is
 * swallowed and logged: these are courtesy notices attached to money paths
 * whose real work has already happened, and a mail fault must not break the
 * sweep. Imported lazily for the same reason the admin alert is, so the
 * transfer module does not pull the email stack into every caller.
 */
async function notifyArtist(
  recipientUserId: string,
  send: (artist: { userId: string; email: string; firstName: string }) => Promise<void>,
): Promise<void> {
  try {
    if (!recipientUserId) return;
    const db = getSupabaseAdmin();
    const [{ data: authData }, { data: profile }] = await Promise.all([
      db.auth.admin.getUserById(recipientUserId),
      db
        .from("artist_profiles")
        .select("name")
        .eq("user_id", recipientUserId)
        .maybeSingle<{ name: string | null }>(),
    ]);
    const email = authData?.user?.email;
    if (!email) return;
    await send({
      userId: recipientUserId,
      email,
      firstName: (profile?.name ?? "").trim().split(" ")[0] || "there",
    });
  } catch (err) {
    console.error("[stripe-connect] artist payout notice failed:", err);
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

      // WS2.6 (audit gap 5): the 14-day hold used to be pure wall clock. A
      // paid order that never shipped still paid the artist on day 14, and an
      // open refund request did not pause the clock. A real order's leg now
      // needs shipping progress (shipped/delivered; collection modes book
      // delivered at purchase), and any open refund request holds it.
      if (order && order.status !== "shipped" && order.status !== "delivered") {
        const { sendAdminAlert } = await import("@/lib/email/admin-alert");
        await sendAdminAlert({
          idempotencyKey: `stale_unshipped_payout:${record.id}`,
          subject: `Payout held: ${record.order_id} unshipped past its hold date`,
          summary:
            "The payout hold elapsed but the order has not been shipped, so the artist leg was NOT paid. Chase the artist or cancel the order; the leg pays automatically once the order ships.",
          fields: [
            { label: "Order", value: String(record.order_id) },
            { label: "Order status", value: String(order.status) },
            { label: "Leg", value: String(record.id) },
          ],
          actionPath: "/admin/financials",
          actionLabel: "Open financials",
        }).catch(() => {});

        // Email audit 2026-09-03 (6c). The hold is correct, but only an
        // operator was told, so the one person who can clear it, by shipping
        // or by cancelling, was the one person not asked. Keyed on the leg, so
        // the daily sweep asks once rather than every day.
        if (record.recipient_type === "artist") {
          await notifyArtist(record.recipient_user_id as string, async (artist) => {
            const { sendEmail } = await import("@/lib/email/send");
            const { ArtistOrderUnshippedPayoutHeld } = await import(
              "@/emails/templates/orders/ArtistOrderUnshippedPayoutHeld"
            );
            const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";
            await sendEmail({
              idempotencyKey: `unshipped_payout_artist:${record.id}`,
              template: "artist_order_unshipped_payout_held",
              category: "orders_and_payouts",
              to: artist.email,
              userId: artist.userId,
              subject: `Order ${record.order_id} needs to ship before we can pay you`,
              react: ArtistOrderUnshippedPayoutHeld({
                firstName: artist.firstName,
                orderNumber: String(record.order_id),
                payoutAmount: { amount: record.amount_cents as number, currency: "GBP" },
                ordersUrl: `${SITE}/artist-portal/orders`,
                supportUrl: `${SITE}/support`,
              }),
              metadata: { transferId: record.id, orderId: record.order_id },
            });
          });
        }
        continue;
      }
      if (order) {
        const { data: openRefunds } = await db
          .from("refund_requests")
          .select("id")
          .eq("order_id", record.order_id)
          .eq("status", "pending")
          .limit(1);
        if (openRefunds && openRefunds.length > 0) {
          // An open refund request pauses the payout; the refund decision
          // settles the leg one way or the other.
          continue;
        }
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
