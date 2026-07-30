// Phase 2 chunk G3. Monthly paid-loan billing on top of Stripe
// subscriptions. Gated by feature flag PAID_LOAN_V2: when the flag is
// off, every helper here short-circuits to a no-op so existing
// placement create / accept paths keep their pre-Phase-2 behaviour.
//
// Data shape:
//   - placements row carries arrangement_type, monthly_fee_gbp, qr_enabled.
//   - venue_profiles row carries stripe_customer_id (Phase 2.0a) and the
//     billing portal email.
//   - placement_recurring_billings row holds the Stripe subscription id,
//     period bounds, status, and the payer/payee user ids (Phase 1g).
//
// Webhook hand-off:
//   - invoice.paid:        update period bounds + trigger artist payout via
//                          Stripe Connect.
//   - invoice.payment_failed (final attempt): mark past_due/paused,
//                          notify both parties, pause placement display.
//   - customer.subscription.deleted: mark cancelled and stop dispatch.
//
// What this file does NOT own:
//   - The Setup Intent flow that collects a venue's card the first time
//     they accept a paid loan. The placement-acceptance route owns that
//     because it has the user session already; this module just reads
//     the resulting payment method back from Stripe.
//   - Stripe webhook signature verification. The webhook route already
//     verifies signatures; this module assumes inputs are trusted.
//
// Flag gating, after E11: PAID_LOAN_V2 gates CREATION only
// (startPaidLoanBilling). The webhook reconcilers (invoice.paid,
// invoice.payment_failed, customer.subscription.deleted) and cancellation run
// regardless, because a subscription that already exists in Stripe has to be
// reconciled and has to be cancellable whatever the flag says. Gating them was
// how a failed venue card came to do nothing at all.

import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isFlagOn } from "@/lib/feature-flags";
import { scheduleTransfer } from "@/lib/stripe-connect";
import { platformFeePercentForArtist } from "@/lib/platform-fee";
// E11b: moved to a neutral home once the artist-subscription webhook branch needed
// the same item-level read. Re-exported because callers already import it from here.
import { periodFromSubscription, epochToIso } from "@/lib/stripe-subscription-period";

export { periodFromSubscription };

// ── Types ──────────────────────────────────────────────────────────────

export interface StartBillingInput {
  placementId: string;
  venueUserId: string;
  artistUserId: string;
  arrangementType: string;
  monthlyFeePence: number;
}

export interface StartBillingResult {
  status: "skipped" | "started" | "already_started" | "missing_payment_method";
  subscriptionId?: string;
  customerId?: string;
  /** Stripe Setup Intent client secret, set when the venue needs to
   *  attach a card before billing can begin. The placement-acceptance
   *  UI presents Stripe Elements with this secret. */
  setupIntentClientSecret?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────

const PAID_LOAN_TYPES = new Set(["paid_loan", "mixed"]);

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

function isPaidLoan(arrangementType: string | null | undefined): boolean {
  return PAID_LOAN_TYPES.has((arrangementType ?? "").toLowerCase());
}

/**
 * Stripe SDK 22 moved Invoice.subscription off the root and onto
 * `parent.subscription_details.subscription`. The line-item shape
 * still carries it as a fallback for upcoming invoices. This reader
 * tolerates both shapes so the helper works against current and
 * legacy webhook payloads.
 */
function readSubscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  // SDK 22+ canonical path.
  const parent = (invoice as { parent?: { subscription_details?: { subscription?: string | Stripe.Subscription } } }).parent;
  const detailSub = parent?.subscription_details?.subscription;
  if (typeof detailSub === "string") return detailSub;
  if (detailSub && typeof detailSub === "object" && "id" in detailSub) return detailSub.id;
  // Pre-22 fallback.
  const legacy = (invoice as { subscription?: string | Stripe.Subscription }).subscription;
  if (typeof legacy === "string") return legacy;
  if (legacy && typeof legacy === "object" && "id" in legacy) return legacy.id;
  // Last fallback: the line-item carries it for upcoming/preview
  // invoices.
  const line = invoice.lines?.data?.[0] as
    | { subscription?: string | { id?: string } }
    | undefined;
  if (typeof line?.subscription === "string") return line.subscription;
  if (line?.subscription && typeof line.subscription === "object") {
    return line.subscription.id ?? null;
  }
  return null;
}

// nextFirstOfMonthUnix was used by the previous billing_cycle_anchor
// path; dropped during the audit. Phase 3 will bring back proper 1st-
// of-month anchoring with an immediate proration invoice.

/**
 * Resolve a Stripe customer for the venue, creating one if absent.
 * Persists the id back to venue_profiles.stripe_customer_id.
 */
async function ensureVenueCustomer(
  db: SupabaseClient,
  venueUserId: string,
): Promise<{ customerId: string; email: string | null } | null> {
  const { data: venue } = await db
    .from("venue_profiles")
    .select("user_id, stripe_customer_id, contact_email, name")
    .eq("user_id", venueUserId)
    .maybeSingle<{
      user_id: string;
      stripe_customer_id: string | null;
      contact_email: string | null;
      name: string | null;
    }>();

  if (!venue) {
    console.warn("[paid-loan-billing] venue_profiles missing for", venueUserId);
    return null;
  }

  if (venue.stripe_customer_id) {
    return { customerId: venue.stripe_customer_id, email: venue.contact_email };
  }

  // Look up the auth user's email as a fallback. Resend / Stripe receipts
  // both prefer the venue contact email when we have one. Guarded
  // against empty/invalid venueUserId so the admin client doesn't
  // throw "Expected parameter to be UUID".
  let fallbackEmail = venue.contact_email;
  if (!fallbackEmail && venueUserId) {
    try {
      const { data: authUser } = await db.auth.admin.getUserById(venueUserId);
      fallbackEmail = authUser.user?.email ?? null;
    } catch {
      fallbackEmail = null;
    }
  }

  const customer = await stripe.customers.create({
    email: fallbackEmail ?? undefined,
    name: venue.name ?? undefined,
    metadata: {
      venue_user_id: venueUserId,
      source: "wallplace_paid_loan_billing",
    },
  });

  await db
    .from("venue_profiles")
    .update({ stripe_customer_id: customer.id })
    .eq("user_id", venueUserId);

  return { customerId: customer.id, email: fallbackEmail };
}

/**
 * Whether the Stripe customer has at least one attached payment method
 * (card). If not, the caller mints a Setup Intent so the venue can
 * attach one before billing starts.
 */
async function hasAttachedCard(customerId: string): Promise<boolean> {
  const list = await stripe.paymentMethods.list({
    customer: customerId,
    type: "card",
    limit: 1,
  });
  return list.data.length > 0;
}

/**
 * Start monthly billing for a paid-loan / mixed placement. Idempotent
 * by placement_id, repeat calls return `already_started`.
 *
 * Returns `missing_payment_method` along with a Setup Intent client
 * secret when the venue hasn't given us a card yet. The
 * placement-acceptance UI shows Stripe Elements with this secret, then
 * re-invokes the flow after `setup_intent.succeeded` lands on the
 * webhook.
 */
export async function startPaidLoanBilling(
  input: StartBillingInput,
  client?: SupabaseClient,
): Promise<StartBillingResult> {
  if (!isFlagOn("PAID_LOAN_V2")) return { status: "skipped" };
  if (!isPaidLoan(input.arrangementType)) return { status: "skipped" };
  if (input.monthlyFeePence <= 0) return { status: "skipped" };

  const db = client ?? getSupabaseAdmin();

  // Idempotency: if a billing row already exists for this placement
  // (and the underlying Stripe subscription is still alive), return.
  const { data: existing } = await db
    .from("placement_recurring_billings")
    .select("id, stripe_subscription_id, status")
    .eq("placement_id", input.placementId)
    .maybeSingle<{
      id: string;
      stripe_subscription_id: string | null;
      status: string;
    }>();

  if (existing?.stripe_subscription_id && existing.status !== "cancelled") {
    return {
      status: "already_started",
      subscriptionId: existing.stripe_subscription_id,
    };
  }

  const customer = await ensureVenueCustomer(db, input.venueUserId);
  if (!customer) {
    return { status: "skipped" };
  }

  // If no card on file yet, mint a Setup Intent and tell the caller
  // to collect one before re-invoking.
  if (!(await hasAttachedCard(customer.customerId))) {
    const setupIntent = await stripe.setupIntents.create({
      customer: customer.customerId,
      payment_method_types: ["card"],
      usage: "off_session",
      metadata: {
        placement_id: input.placementId,
        venue_user_id: input.venueUserId,
        source: "wallplace_paid_loan_billing",
      },
    });
    return {
      status: "missing_payment_method",
      customerId: customer.customerId,
      setupIntentClientSecret: setupIntent.client_secret ?? undefined,
    };
  }

  // Stripe SDK 22 requires a pre-existing product reference on
  // price_data; we don't ship a fallback id because Stripe rejects
  // unknown products with "No such product" and the catch upstream
  // would swallow that into a silent "billing didn't start". Audit
  // follow-up: hard-fail when the env is unset so the operator notices.
  const productId = process.env.STRIPE_PAID_LOAN_PRODUCT_ID;
  if (!productId) {
    console.error(
      "[paid-loan-billing] STRIPE_PAID_LOAN_PRODUCT_ID is not set; refusing to create subscription",
    );
    return { status: "skipped" };
  }

  // Audit follow-up on first-month proration: setting
  // billing_cycle_anchor to a future date (next 1st of month) plus
  // proration_behavior: "create_prorations" tells Stripe to wait
  // until the anchor before issuing any invoice, so the venue would
  // pay £0 between acceptance and the next month. The spec wants
  // immediate proration, which requires an immediate first invoice
  // via add_invoice_items + a one-off price; this is a Phase 3
  // follow-up. For now we cycle billing from the acceptance date so
  // the venue is actually charged. Renewals fall on the same day of
  // each month rather than the 1st — acceptable for v1.
  const subscription = await stripe.subscriptions.create({
    customer: customer.customerId,
    items: [
      {
        price_data: {
          currency: "gbp",
          recurring: { interval: "month" },
          unit_amount: input.monthlyFeePence,
          product: productId,
        },
      },
    ],
    proration_behavior: "create_prorations",
    collection_method: "charge_automatically",
    metadata: {
      placement_id: input.placementId,
      venue_user_id: input.venueUserId,
      artist_user_id: input.artistUserId,
      source: "wallplace_paid_loan_billing",
    },
  });

  const { cpStart, cpEnd } = periodFromSubscription(subscription);
  await recordPaidLoanSubscription(
    {
      placementId: input.placementId,
      subscriptionId: subscription.id,
      customerId: customer.customerId,
      payerUserId: input.venueUserId,
      payeeUserId: input.artistUserId,
      monthlyAmountPence: input.monthlyFeePence,
      cpStart,
      cpEnd,
    },
    db,
  );

  return {
    status: "started",
    subscriptionId: subscription.id,
    customerId: customer.customerId,
  };
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
    .select("stripe_connect_account_id, subscription_plan, subscription_status, trial_end")
    .eq("user_id", billing.payee_user_id)
    .maybeSingle<{
      stripe_connect_account_id: string | null;
      subscription_plan: string | null;
      subscription_status: string | null;
      trial_end: string | null;
    }>();
  const platformFeePct = platformFeePercentForArtist(artistProfile ?? null);
  const artistShareCents = Math.max(
    0,
    Math.round(billing.monthly_amount_pence * (1 - platformFeePct / 100)),
  );

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

  const artistConnect = artistProfile;
  if (artistConnect?.stripe_connect_account_id && artistShareCents > 0) {
    await scheduleTransfer({
      orderId: transferOrderId,
      recipientType: "artist",
      recipientUserId: billing.payee_user_id,
      connectAccountId: artistConnect.stripe_connect_account_id,
      amountCents: artistShareCents,
      immediate: false,
    });
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
  return true;
}
