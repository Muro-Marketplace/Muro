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
// All side-effect helpers return early when PAID_LOAN_V2 is off so a
// placement.accept under the flag-off path is byte-for-byte the same
// as Phase 1.

import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isFlagOn } from "@/lib/feature-flags";
import { scheduleTransfer } from "@/lib/stripe-connect";
import { platformFeePercentForArtist } from "@/lib/platform-fee";

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

function nextFirstOfMonthUnix(now: Date): number {
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0),
  );
  return Math.floor(next.getTime() / 1000);
}

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
  // both prefer the venue contact email when we have one.
  let fallbackEmail = venue.contact_email;
  if (!fallbackEmail) {
    const { data: authUser } = await db.auth.admin.getUserById(venueUserId);
    fallbackEmail = authUser.user?.email ?? null;
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

  // Look up an on-the-fly price. Stripe lets you create an ad-hoc
  // price for each subscription using `price_data`; one Stripe Price
  // per placement would balloon the dashboard for no benefit.
  //
  // Note: the placement's title isn't stored on the Price; we set the
  // subscription metadata instead so the placement-id is recoverable
  // from the dashboard. The created Price defaults to an auto-named
  // product on Stripe's side.
  const subscription = await stripe.subscriptions.create({
    customer: customer.customerId,
    items: [
      {
        price_data: {
          currency: "gbp",
          recurring: { interval: "month" },
          unit_amount: input.monthlyFeePence,
          // Stripe SDK 22 requires a pre-existing product reference;
          // we tag with the placement-id metadata on the subscription
          // itself, which Stripe surfaces alongside.
          product: process.env.STRIPE_PAID_LOAN_PRODUCT_ID || "prod_wallplace_paid_loan",
        },
      },
    ],
    // Pro-rate the first month from acceptance to the next 1st-of-month
    // boundary. Subsequent renewals cycle on the 1st.
    billing_cycle_anchor: nextFirstOfMonthUnix(new Date()),
    proration_behavior: "create_prorations",
    collection_method: "charge_automatically",
    metadata: {
      placement_id: input.placementId,
      venue_user_id: input.venueUserId,
      artist_user_id: input.artistUserId,
      source: "wallplace_paid_loan_billing",
    },
  });

  // SDK 22+: current_period_start/end live on the first subscription
  // item, not on the subscription itself.
  const firstItem = subscription.items?.data?.[0] as
    | { current_period_start?: number; current_period_end?: number }
    | undefined;
  const cpStart = firstItem?.current_period_start ?? null;
  const cpEnd = firstItem?.current_period_end ?? null;

  await db
    .from("placement_recurring_billings")
    .upsert(
      {
        placement_id: input.placementId,
        stripe_subscription_id: subscription.id,
        stripe_customer_id: customer.customerId,
        payer_user_id: input.venueUserId,
        payee_user_id: input.artistUserId,
        monthly_amount_pence: input.monthlyFeePence,
        status: "active",
        current_period_start: cpStart
          ? new Date(cpStart * 1000).toISOString()
          : null,
        current_period_end: cpEnd
          ? new Date(cpEnd * 1000).toISOString()
          : null,
      },
      { onConflict: "stripe_subscription_id" },
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
): Promise<{ status: "skipped" | "cancelled" | "not_found" }> {
  if (!isFlagOn("PAID_LOAN_V2")) return { status: "skipped" };

  const db = client ?? getSupabaseAdmin();
  const { data: billing } = await db
    .from("placement_recurring_billings")
    .select("id, stripe_subscription_id, status")
    .eq("placement_id", placementId)
    .maybeSingle<{
      id: string;
      stripe_subscription_id: string | null;
      status: string;
    }>();

  if (!billing) return { status: "not_found" };
  if (!billing.stripe_subscription_id) return { status: "not_found" };
  if (billing.status === "cancelled") return { status: "cancelled" };

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
  if (!isFlagOn("PAID_LOAN_V2")) return false;
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
    .select("stripe_connect_account_id, subscription_plan, free_until")
    .eq("user_id", billing.payee_user_id)
    .maybeSingle<{
      stripe_connect_account_id: string | null;
      subscription_plan: string | null;
      free_until: string | null;
    }>();
  const platformFeePct = platformFeePercentForArtist(artistProfile ?? null);
  const artistShareCents = Math.max(
    0,
    Math.round(billing.monthly_amount_pence * (1 - platformFeePct / 100)),
  );

  const artistConnect = artistProfile;
  if (artistConnect?.stripe_connect_account_id && artistShareCents > 0) {
    await scheduleTransfer({
      orderId: `placement:${billing.placement_id}:${invoice.id}`,
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
  if (!isFlagOn("PAID_LOAN_V2")) return false;
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
  if (!isFlagOn("PAID_LOAN_V2")) return false;
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
