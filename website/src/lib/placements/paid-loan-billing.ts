// Paid-loan monthly billing: everything that happens to a Stripe subscription
// AFTER one exists. This module deliberately creates none.
//
// K2 (07 §2). There used to be two implementations that could each start a
// monthly charge for the same placement:
//
//   A  api/placements/[id]/payment/setup  — venue clicks "Set up payment",
//      Stripe Checkout in subscription mode collects the card. Never
//      flag-gated, live in production.
//   B  startPaidLoanBilling() here        — fired automatically on placement
//      acceptance, gated by PAID_LOAN_V2, created the subscription
//      server-side after a SetupIntent dance to attach a card.
//
// B is deleted. With PAID_LOAN_V2 flipped on, an accepted placement whose venue
// then clicked "Set up payment" would have produced two live Stripe
// subscriptions billing the same venue for the same placement. The doc calls it
// the most dangerous knot in the codebase and it is right.
//
// A survives because it is what runs in production, because Checkout collects
// the card itself (so B's ensureVenueCustomer + hasAttachedCard + SetupIntent
// machinery is redundant, not merely duplicated), and because it is a fraction
// of the code. Both paths already shared one money model — the platform
// collects in full and the artist is paid by a separate transfer through the
// stripe_transfers ledger — since §B6 deleted the destination charge, so this
// collapse changes no money flow.
//
// What survives here, and why it is not flag-gated (E11): a subscription that
// exists in Stripe has to be reconciled and has to be cancellable whatever a
// flag says. Gating these was how a failed venue card came to do nothing at all.
//
//   recordPaidLoanSubscription   the webhook's paid_loan_monthly branch calls
//                                this to record A's subscription
//   cancelPaidLoanBilling        placement leaves 'active'
//   handleInvoicePaid            update period bounds, transfer the artist's
//                                share through the ledger
//   handleInvoicePaymentFailed   dunning: past_due/paused, notify both parties
//   handleSubscriptionDeleted    mark cancelled and stop dispatch
//
// Data shape:
//   - placements carries arrangement_type, monthly_fee_gbp, qr_enabled and a
//     stripe_subscription_id mirror.
//   - placement_recurring_billings holds the authoritative subscription id,
//     period bounds, status, and the payer/payee user ids.
//
// Stripe webhook signature verification is the webhook route's job; this module
// assumes its inputs are trusted.

import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { scheduleTransfer, recordBlockedLeg } from "@/lib/stripe-connect";
import { canReceivePayout } from "@/lib/payouts/capability";
import { sendEmail } from "@/lib/email/send";
import { VenuePaidLoanInvoice } from "@/emails/templates/payments/VenuePaidLoanInvoice";
import { PaidLoanPaymentFailed } from "@/emails/templates/payments/PaidLoanPaymentFailed";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";
import { platformFeePercentForArtist } from "@/lib/platform-fee";
// E11b: moved to a neutral home once the artist-subscription webhook branch needed
// the same item-level read. Re-exported because callers already import it from here.
import { periodFromSubscription, epochToIso, readSubscriptionIdFromInvoice } from "@/lib/stripe-subscription-period";

export { periodFromSubscription };

// ── Types ──────────────────────────────────────────────────────────────

export interface RecordSubscriptionInput {
  placementId: string;
  subscriptionId: string;
  customerId: string;
  payerUserId: string;
  payeeUserId: string;
  monthlyAmountPence: number;
  cpStart: number | null;
  cpEnd: number | null;
}

/**
 * Record a live paid-loan subscription: one row in
 * `placement_recurring_billings`, mirrored onto `placements` (E7a).
 *
 * Shared by `startPaidLoanBilling` and the webhook's `paid_loan_monthly` branch.
 * Two callers, one ledger, because a second copy of this upsert is how the two
 * paths would drift, and E7a exists precisely because the webhook path had no
 * copy at all.
 *
 * NOT flag-gated, unlike `startPaidLoanBilling`. The flag decides whether we
 * *start* billing; once Stripe has a live subscription, recording it is always
 * correct. `api/placements/[id]/payment/setup` is not flag-gated either, so a
 * venue can already be on a monthly subscription with the flag off, and refusing
 * to record that would leave them billed with nothing to cancel.
 *
 * Returns `newlyLinked: false` when this placement already pointed at this
 * subscription, which lets a caller avoid re-notifying on a Stripe redelivery.
 */
export async function recordPaidLoanSubscription(
  input: RecordSubscriptionInput,
  client?: SupabaseClient,
): Promise<{ ok: boolean; newlyLinked: boolean; error?: string }> {
  const db = client ?? getSupabaseAdmin();

  // monthly_amount_pence carries a CHECK (> 0). Writing a zero would raise
  // 23514, the webhook would answer 500, and Stripe would retry a request that
  // can never succeed. The setup route already refuses a placement with no fee,
  // so this is defence against the fee being cleared afterwards.
  if (!Number.isFinite(input.monthlyAmountPence) || input.monthlyAmountPence <= 0) {
    console.error("[paid-loan] refusing to record a subscription with no monthly amount", {
      placementId: input.placementId,
      subscriptionId: input.subscriptionId,
      monthlyAmountPence: input.monthlyAmountPence,
    });
    return { ok: false, newlyLinked: false, error: "monthly_amount_missing" };
  }

  const { data: existing } = await db
    .from("placements")
    .select("stripe_subscription_id")
    .eq("id", input.placementId)
    .maybeSingle<{ stripe_subscription_id: string | null }>();
  const newlyLinked = existing?.stripe_subscription_id !== input.subscriptionId;

  const { error: billErr } = await db.from("placement_recurring_billings").upsert(
    {
      placement_id: input.placementId,
      stripe_subscription_id: input.subscriptionId,
      stripe_customer_id: input.customerId,
      payer_user_id: input.payerUserId,
      payee_user_id: input.payeeUserId,
      monthly_amount_pence: input.monthlyAmountPence,
      status: "active",
      current_period_start: epochToIso(input.cpStart),
      current_period_end: epochToIso(input.cpEnd),
    },
    { onConflict: "stripe_subscription_id" },
  );
  if (billErr) {
    // 23505 on the partial unique index from migration 083: this placement already
    // has a live billing row for a DIFFERENT subscription. onConflict targets
    // stripe_subscription_id, which cannot resolve that, and retrying never will,
    // so it is reported as permanent. Two live subscriptions for one placement
    // means the venue is being charged twice and a human has to pick one.
    if (billErr.code === "23505") {
      console.error(
        "[paid-loan] a live billing row already exists for this placement with a different subscription",
        {
          placementId: input.placementId,
          incomingSubscriptionId: input.subscriptionId,
          detail: billErr.details,
        },
      );
      return { ok: false, newlyLinked, error: "duplicate_live_billing" };
    }
    console.error("[paid-loan] placement_recurring_billings upsert failed", billErr);
    return { ok: false, newlyLinked, error: billErr.message };
  }

  // Mirror onto placements. Until E7a nothing wrote this column, so the setup
  // route's "already set up" guard was permanently false and a venue could mint
  // a second subscription for the same placement.
  const { error: mirrorErr } = await db
    .from("placements")
    .update({
      stripe_subscription_id: input.subscriptionId,
      subscription_status: "active",
      subscription_current_period_end: epochToIso(input.cpEnd),
    })
    .eq("id", input.placementId);
  if (mirrorErr) {
    // The ledger row is the one that matters for billing and cancellation, so a
    // failed mirror is logged rather than treated as a failure.
    console.error("[paid-loan] placement subscription mirror failed", mirrorErr);
  }

  return { ok: true, newlyLinked };
}

/**
 * Cancel an active paid-loan subscription. Called when the placement
 * is cancelled. Spec: no refund for the current month — Stripe's
 * default `cancel_at_period_end` honours that.
 */
export async function cancelPaidLoanBilling(
  placementId: string,
  client?: SupabaseClient,
): Promise<{ status: "cancelled" | "not_found" }> {
  // E11: no flag check. Refusing to cancel a subscription that already exists,
  // because the flag that would create new ones is off, is exactly the
  // uncancellable-subscription failure mode: the venue keeps being charged for a
  // placement they have ended. "skipped" is gone from the return type with it,
  // since nothing else produced it.
  const db = client ?? getSupabaseAdmin();
  // E7c: find the LIVE row, and do it without .maybeSingle().
  //
  // Cancelled rows are archived rather than deleted, and migration 083's partial
  // unique index deliberately allows a cancelled row to sit alongside a live one so
  // a venue can restart after cancelling. So two rows for one placement_id is a
  // normal state, and maybeSingle() would fail with PGRST116, hand back null, and
  // this would return not_found while the subscription kept billing the venue.
  const { data: billings } = await db
    .from("placement_recurring_billings")
    .select("id, stripe_subscription_id, status")
    .eq("placement_id", placementId)
    .neq("status", "cancelled")
    .limit(2);
  const billing = ((billings || []) as Array<{
    id: string;
    stripe_subscription_id: string | null;
    status: string;
  }>).find((b) => b.stripe_subscription_id);

  if (!billing?.stripe_subscription_id) return { status: "not_found" };

  await stripe.subscriptions.update(billing.stripe_subscription_id, {
    cancel_at_period_end: true,
  });
  // The DB row keeps "active" until the webhook confirms cancellation
  // — that way a webhook race doesn't tear down the period that the
  // venue has already paid for.
  return { status: "cancelled" };
}

// ── Webhook handlers ────────────────────────────────────────────────────

/**
 * Idempotent invoice.paid handler. Returns true when the invoice was
 * for a paid-loan placement (so the webhook router knows it was
 * handled here and shouldn't fall through to other paths).
 */
export async function handleInvoicePaid(
  invoice: Stripe.Invoice,
  client?: SupabaseClient,
): Promise<boolean> {
  // E11: deliberately NOT gated on PAID_LOAN_V2. The flag decides whether we
  // CREATE a subscription; a subscription that already exists in Stripe must be
  // reconciled either way. Gating this meant a failed venue card did nothing at
  // all: no past_due, no paused, no notification, and the placement kept
  // displaying while nobody was paying for it.
  const subscriptionId = readSubscriptionIdFromInvoice(invoice);
  if (!subscriptionId) return false;

  const db = client ?? getSupabaseAdmin();
  const { data: billing } = await db
    .from("placement_recurring_billings")
    .select(
      "id, placement_id, payer_user_id, payee_user_id, monthly_amount_pence, current_period_end",
    )
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle<{
      id: string;
      placement_id: string;
      payer_user_id: string;
      payee_user_id: string;
      monthly_amount_pence: number;
      current_period_end: string | null;
    }>();
  if (!billing) return false;

  // Idempotency by Stripe invoice id. Re-run is a no-op via UNIQUE
  // constraint on (placement_recurring_billings.id, invoice_id) — we
  // don't track invoices per-row yet, but the artist payout side uses
  // stripe_transfers idempotency on order_id so a second `invoice.paid`
  // with the same invoice can't double-charge.
  const linePeriod = invoice.lines?.data?.[0]?.period as
    | { start?: number; end?: number }
    | undefined;
  const periodEndUnix = invoice.period_end ?? linePeriod?.end ?? null;
  const periodStartUnix = invoice.period_start ?? linePeriod?.start ?? null;
  await db
    .from("placement_recurring_billings")
    .update({
      status: "active",
      current_period_start: periodStartUnix
        ? new Date(periodStartUnix * 1000).toISOString()
        : null,
      current_period_end: periodEndUnix
        ? new Date(periodEndUnix * 1000).toISOString()
        : null,
    })
    .eq("id", billing.id);

  // Trigger payout to the artist (gross venue fee minus platform cut).
  // We re-use the existing scheduleTransfer helper from
  // src/lib/stripe-connect.ts so paid-loan payouts land in the same
  // stripe_transfers ledger as order payouts. The order_id column is
  // repurposed with a `placement:<id>:<invoiceId>` shape so the
  // unique-by-order-id payout pipeline still works.
  const { data: artistProfile } = await db
    .from("artist_profiles")
    .select("stripe_connect_account_id, subscription_plan, subscription_status, trial_end, free_until")
    .eq("user_id", billing.payee_user_id)
    .maybeSingle<{
      stripe_connect_account_id: string | null;
      subscription_plan: string | null;
      subscription_status: string | null;
      trial_end: string | null;
      free_until: string | null;
    }>();
  const platformFeePct = platformFeePercentForArtist(artistProfile ?? null);
  // WS4.6 (audit R3.13/R1.F6): the share comes from what the invoice actually
  // COLLECTED, not the recorded monthly fee. A prorated, discounted or trial
  // £0 invoice used to overpay the artist against money never taken; the
  // recorded fee remains only the fallback for legacy events without a
  // populated amount_paid.
  const collectedPence =
    typeof invoice.amount_paid === "number" && invoice.amount_paid >= 0
      ? invoice.amount_paid
      : billing.monthly_amount_pence;
  const artistShareCents = Math.max(
    0,
    Math.round(collectedPence * (1 - platformFeePct / 100)),
  );

  // R2.13 (audit): cancelPaidLoanBilling failures were swallowed with a
  // comment promising "the webhook reconciler will catch up", and no
  // reconciler existed - so invoices for a COMPLETED placement kept paying
  // the artist share indefinitely. The daily subscription-reconcile cron now
  // exists, and this is the immediate tripwire: an invoice for a non-active
  // placement still pays the share (the venue WAS charged; the artist's cut
  // of real money is owed), but admin hears about it the same minute so the
  // orphaned subscription gets cancelled by a human today, not never.
  try {
    const { data: placementRow } = await db
      .from("placements")
      .select("status")
      .eq("id", billing.placement_id)
      .maybeSingle<{ status: string | null }>();
    if (placementRow && placementRow.status !== "active") {
      const { sendAdminAlert } = await import("@/lib/email/admin-alert");
      await sendAdminAlert({
        idempotencyKey: `paid_loan_nonactive:${invoice.id}`,
        subject: "Paid-loan invoice charged for a non-active placement",
        summary:
          `Invoice ${invoice.id} charged the venue for placement ${billing.placement_id}, ` +
          `whose status is "${placementRow.status}". The Stripe subscription should have been ` +
          `cancelled when the placement ended; cancel it in Stripe or via the placement page.`,
        fields: [
          { label: "Placement", value: billing.placement_id },
          { label: "Placement status", value: String(placementRow.status) },
          { label: "Invoice", value: String(invoice.id) },
        ],
        metadata: { placementId: billing.placement_id, invoiceId: invoice.id },
      });
    }
  } catch (staleAlertErr) {
    console.warn("[paid-loan] non-active placement check failed:", staleAlertErr);
  }

  // Audit fix: explicit idempotency check before scheduleTransfer.
  // The Stripe webhook retries failed events up to 3 days; without
  // this guard each retry inserts another pending transfer and the
  // payout cron pays the artist multiple times. Migration 067 also
  // adds a UNIQUE(order_id, recipient_user_id) index as belt-and-
  // braces, but the soft check here avoids the noisy unique-violation
  // error on a happy-path replay.
  const transferOrderId = `placement:${billing.placement_id}:${invoice.id}`;
  const { data: existingTransfer } = await db
    .from("stripe_transfers")
    .select("id")
    .eq("order_id", transferOrderId)
    .eq("recipient_user_id", billing.payee_user_id)
    .maybeSingle<{ id: string }>();
  if (existingTransfer) {
    return true; // already scheduled, replay is a no-op
  }

  // WS4.6 (audit R2.8/R3.10): gate on real payout capability, and when the
  // artist is NOT payable record a blocked leg so the owed share is a visible
  // IOU instead of silently vanishing month after month.
  if (artistShareCents > 0 && billing.payee_user_id) {
    const cap = await canReceivePayout(db, { kind: "artist", userId: billing.payee_user_id });
    if (cap.ok && cap.accountId) {
      await scheduleTransfer({
        orderId: transferOrderId,
        recipientType: "artist",
        recipientUserId: billing.payee_user_id,
        connectAccountId: cap.accountId,
        amountCents: artistShareCents,
        immediate: false,
      });
    } else {
      await recordBlockedLeg(db, {
        orderId: transferOrderId,
        recipientType: "artist",
        recipientUserId: billing.payee_user_id,
        amountCents: artistShareCents,
        reason: cap.reason ?? "payouts_not_ready",
      });
    }
  }

  // WS4.8 (audit R4.13): the venue gets their monthly receipt. Keyed on the
  // invoice, so Stripe redelivery cannot double it.
  if (billing.payer_user_id && collectedPence > 0) {
    try {
      const { data: { user: venueUser } } = await db.auth.admin.getUserById(billing.payer_user_id);
      const { data: venueProfile } = await db
        .from("venue_profiles")
        .select("name")
        .eq("user_id", billing.payer_user_id)
        .maybeSingle<{ name: string | null }>();
      if (venueUser?.email) {
        await sendEmail({
          idempotencyKey: `paid_loan_invoice:${invoice.id}`,
          template: "venue_paid_loan_invoice",
          category: "orders_and_payouts",
          to: venueUser.email,
          userId: billing.payer_user_id,
          subject: "Your monthly display fee receipt",
          react: VenuePaidLoanInvoice({
            firstName: (venueProfile?.name || "there").split(" ")[0],
            venueName: venueProfile?.name || "your venue",
            invoiceNumber: invoice.number || invoice.id || "invoice",
            amountDue: { amount: collectedPence, currency: "GBP" },
            dueDate: "Paid",
            invoiceUrl: invoice.hosted_invoice_url || `${SITE}/placements/${encodeURIComponent(billing.placement_id)}`,
            supportUrl: `${SITE}/support`,
          }),
          metadata: { placementId: billing.placement_id, invoiceId: invoice.id ?? "" },
        });
      }
    } catch (mailErr) {
      console.warn("[paid-loan] receipt email failed:", mailErr);
    }
  }
  return true;
}

/**
 * invoice.payment_failed: Stripe Standard retry handles the first 3
 * attempts. We only mark `past_due` and notify when Stripe gives up
 * (final attempt). On a non-final attempt we just no-op.
 */
export async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
  client?: SupabaseClient,
): Promise<boolean> {
  // E11: deliberately NOT gated on PAID_LOAN_V2. The flag decides whether we
  // CREATE a subscription; a subscription that already exists in Stripe must be
  // reconciled either way. Gating this meant a failed venue card did nothing at
  // all: no past_due, no paused, no notification, and the placement kept
  // displaying while nobody was paying for it.
  const subscriptionId = readSubscriptionIdFromInvoice(invoice);
  if (!subscriptionId) return false;

  const db = client ?? getSupabaseAdmin();
  const { data: billing } = await db
    .from("placement_recurring_billings")
    .select("id, placement_id, payer_user_id, payee_user_id")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle<{
      id: string;
      placement_id: string;
      payer_user_id: string;
      payee_user_id: string;
    }>();
  if (!billing) return false;

  // Spec: Stripe handles up to 3 retries over 14 days. After 14 days
  // unrecoverable we mark `paused` and notify both parties. Stripe's
  // own `next_payment_attempt` is null when retries are exhausted.
  const finalAttempt = invoice.next_payment_attempt === null;
  await db
    .from("placement_recurring_billings")
    .update({ status: finalAttempt ? "paused" : "past_due" })
    .eq("id", billing.id);

  // WS4.3 (audit R2.7/R6.F2): the docstring above promised notification and
  // nothing ever sent one. The VENUE (payer) gets a dunning email keyed per
  // invoice per stage; the ARTIST gets a bell (their money is what stops);
  // the final failure also alerts the admin.
  const { data: placementRow } = await db
    .from("placements")
    .select("work_title, artist_slug, monthly_fee_gbp")
    .eq("id", billing.placement_id)
    .maybeSingle<{ work_title: string | null; artist_slug: string | null; monthly_fee_gbp: number | null }>();
  const feePence = Math.round(Number(placementRow?.monthly_fee_gbp || 0) * 100);
  const workTitle = placementRow?.work_title || "your placed artwork";

  if (billing.payer_user_id) {
    try {
      const { data: { user: venueUser } } = await db.auth.admin.getUserById(billing.payer_user_id);
      const { data: venueProfile } = await db
        .from("venue_profiles")
        .select("name")
        .eq("user_id", billing.payer_user_id)
        .maybeSingle<{ name: string | null }>();
      if (venueUser?.email) {
        await sendEmail({
          idempotencyKey: `paid_loan_dunning:${invoice.id}:${finalAttempt ? "final" : "retry"}`,
          template: "paid_loan_payment_failed",
          category: "orders_and_payouts",
          to: venueUser.email,
          userId: billing.payer_user_id,
          subject: finalAttempt
            ? "Monthly display payments are paused"
            : "Your monthly display fee payment failed",
          react: PaidLoanPaymentFailed({
            venueFirstName: (venueProfile?.name || "there").split(" ")[0],
            workTitle,
            artistName: placementRow?.artist_slug || "the artist",
            monthlyFee: { amount: feePence, currency: "GBP" },
            finalAttempt,
            updatePaymentUrl: `${SITE}/placements/${encodeURIComponent(billing.placement_id)}/payment`,
          }),
          metadata: { placementId: billing.placement_id, invoiceId: invoice.id ?? "" },
        });
      }
    } catch (mailErr) {
      console.warn("[paid-loan] dunning email failed:", mailErr);
    }
  }
  if (billing.payee_user_id) {
    const { createNotification } = await import("@/lib/notifications");
    createNotification({
      userId: billing.payee_user_id,
      kind: "paid_loan_payment_failed",
      title: finalAttempt
        ? `Monthly payments paused for ${workTitle}`
        : `A monthly payment failed for ${workTitle}`,
      body: finalAttempt
        ? "The venue's card could not be charged after several attempts. You are not being paid while billing is paused."
        : "The venue's card was declined. Stripe retries automatically; the venue has been asked to update it.",
      link: `/placements/${encodeURIComponent(billing.placement_id)}`,
      // Webhook-driven: Stripe redelivers, and each invoice attempt is its
      // own event, so the key carries the invoice and the stage (F6).
      idempotencyKey: `paid_loan_payment_failed:${invoice.id}:${finalAttempt ? "final" : "retry"}`,
    }).catch(() => {});
  }
  if (finalAttempt) {
    const { sendAdminAlert } = await import("@/lib/email/admin-alert");
    await sendAdminAlert({
      idempotencyKey: `paid_loan_paused:${billing.id}:${invoice.id}`,
      subject: `Paid-loan billing paused: ${workTitle}`,
      summary: "Stripe exhausted its retries on a monthly display fee. The billing row is paused, both parties were told, and the artist is unpaid until the venue fixes their card or the placement is wound down.",
      fields: [
        { label: "Placement", value: billing.placement_id },
        { label: "Monthly fee", value: `£${(feePence / 100).toFixed(2)}` },
      ],
      actionPath: "/admin/financials",
      actionLabel: "Open financials",
    }).catch(() => {});
  }

  return true;
}

/**
 * customer.subscription.deleted: Stripe confirms cancellation. Mark
 * the row cancelled so the placement-context panel can drop the
 * "monthly invoice" line.
 */
export async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
  client?: SupabaseClient,
): Promise<boolean> {
  // E11: deliberately NOT gated on PAID_LOAN_V2. The flag decides whether we
  // CREATE a subscription; a subscription that already exists in Stripe must be
  // reconciled either way. Gating this meant a failed venue card did nothing at
  // all: no past_due, no paused, no notification, and the placement kept
  // displaying while nobody was paying for it.
  const db = client ?? getSupabaseAdmin();
  const { data: billing } = await db
    .from("placement_recurring_billings")
    .select("id")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle<{ id: string }>();
  if (!billing) return false;

  await db
    .from("placement_recurring_billings")
    .update({ status: "cancelled" })
    .eq("id", billing.id);

  // WS4 / audit R2.13: the cancellation used to be a silent row write. Both
  // parties get a bell; the placement page's payment banner drops with it.
  const { data: fullRow } = await db
    .from("placement_recurring_billings")
    .select("placement_id, payer_user_id, payee_user_id")
    .eq("id", billing.id)
    .maybeSingle<{ placement_id: string; payer_user_id: string | null; payee_user_id: string | null }>();
  if (fullRow) {
    const { createNotification } = await import("@/lib/notifications");
    for (const [userId, body] of [
      [fullRow.payee_user_id, "The venue's monthly payments for this placement have been cancelled."],
      [fullRow.payer_user_id, "Your monthly payments for this placement have been cancelled."],
    ] as const) {
      if (!userId) continue;
      createNotification({
        userId,
        kind: "paid_loan_cancelled",
        title: "Monthly loan payments cancelled",
        body,
        link: `/placements/${encodeURIComponent(fullRow.placement_id)}`,
        // Webhook-driven (customer.subscription.deleted redelivers).
        idempotencyKey: `paid_loan_cancelled:${subscription.id}:${userId}`,
      }).catch(() => {});
    }
  }
  return true;
}
