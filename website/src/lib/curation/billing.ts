// D21. Reconcile managed-curation Stripe subscriptions against
// curation_requests.
//
// A managed curation tier (managed_monthly / managed_quarterly) is a Stripe
// subscription, but nothing here listened to its lifecycle: a renewal, a
// cancellation or a failed payment left curation_requests.status frozen at
// 'in_progress', so a cancelled venue kept receiving curation work unpaid and a
// failed card raised no signal. These three handlers mirror the paid-loan
// reconcilers (src/lib/placements/paid-loan-billing.ts) and are wired into the
// same webhook branches.
//
// Each returns `true` only when the subscription belongs to a curation_requests
// row, so the webhook router knows it was handled here and the paid-loan / SaaS
// paths still run for their own subscriptions. The row is found first by
// stripe_subscription_id (migration 099; the state columns come from migration
// 100), then, if that misses, by the curation_request_id Stripe echoes back
// onto the subscription's own metadata (resolveCurationRow below).
//
// Wallplace Programmes (Task 5): a programme is also a Stripe subscription
// (curation-tiers.ts) and rides these same three reconcilers. But its checkout
// session (src/app/api/curation/[id]/checkout/route.ts, Task 4) carries
// metadata `{ curation_request_id, tier: "programme" }` with no `kind` field,
// so the webhook's OTHER curation branch -- checkout.session.completed's
// `session.metadata?.kind === "curation_request"` check, in
// src/app/api/webhooks/stripe/route.ts -- never matches it and never writes
// stripe_subscription_id onto the row. For a programme, metadata resolution is
// therefore not a defensive fallback for an edge case: it is the ONLY way the
// row is ever found on its first invoice. Once found, the subscription id is
// backfilled onto the row so a later renewal, failure or cancellation can
// resolve the fast way. A managed-tier row always resolves by
// stripe_subscription_id on the first attempt (that column was populated at
// signup, before those checkout routes were retired), so this is a pure
// extension: no existing managed-tier resolution path changed, and
// resolveCurationRow never even attempts the metadata lookup once the
// subscription-id one has already found the row.
//
// Out of scope (feature, not this reconcile bug): the customer renewal receipt
// and the curation refund path (D57.4 / D56.3). The renewal-paid customer
// notification belongs with D23. Also out of scope, and a genuine gap this
// task surfaced rather than fixed: because checkout.session.completed never
// fires for a programme, a programme's FIRST payment (unlike a managed
// tier's) triggers neither of the two things that branch does -- no admin
// alert, no customer receipt email. handleCurationInvoicePaid below still
// deliberately does not alert on billing_reason "subscription_create", for
// the same reason the D23 comment there gives (avoiding a double send) --
// except for a programme there is no first send to double up on. Flagged for
// a follow-up decision, not fixed here: it touches notification copy and an
// idempotency key, not the reconcile logic this task is scoped to.

import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { readSubscriptionIdFromInvoice } from "@/lib/stripe-subscription-period";
import { sendAdminAlert } from "@/lib/email/admin-alert";
import { CURATION_TIERS, type CurationTierKey } from "@/lib/curation-tiers";

interface CurationRow {
  id: string;
  status: string;
  contact_email: string | null;
  contact_name: string | null;
  venue_name: string | null;
  tier: string | null;
}

async function findBySubscription(
  db: SupabaseClient,
  subId: string,
): Promise<CurationRow | null> {
  const { data } = await db
    .from("curation_requests")
    .select("id, status, contact_email, contact_name, venue_name, tier")
    .eq("stripe_subscription_id", subId)
    .maybeSingle<CurationRow>();
  return data ?? null;
}

/** Task 5: the metadata fallback. Same row shape, looked up by primary key. */
async function findByRequestId(
  db: SupabaseClient,
  curationRequestId: string,
): Promise<CurationRow | null> {
  const { data } = await db
    .from("curation_requests")
    .select("id, status, contact_email, contact_name, venue_name, tier")
    .eq("id", curationRequestId)
    .maybeSingle<CurationRow>();
  return data ?? null;
}

/**
 * Resolves the curation_requests row a Stripe subscription-lifecycle event
 * belongs to. Tries stripe_subscription_id first -- the only lookup a managed
 * tier's row ever needs, since that column was populated at its (now retired)
 * checkout -- and only falls back to curation_request_id metadata when that
 * misses, which today only happens for a Wallplace Programme (see this file's
 * header comment). Returns null, never throws, when neither resolves: an
 * invoice or subscription naming no row this codebase knows about is not this
 * reconciler's problem, and the webhook router falls through to try other
 * domains.
 */
async function resolveCurationRow(
  db: SupabaseClient,
  ids: { subId: string | null; curationRequestId: string | null },
): Promise<CurationRow | null> {
  if (ids.subId) {
    const bySub = await findBySubscription(db, ids.subId);
    if (bySub) return bySub;
  }
  if (ids.curationRequestId) {
    const byId = await findByRequestId(db, ids.curationRequestId);
    if (byId) return byId;
  }
  return null;
}

/**
 * curation_request_id off an invoice's SDK-22 subscription snapshot.
 * parent.subscription_details.metadata is Stripe's immutable copy of the
 * subscription's metadata at the time the invoice was finalised (populated
 * for every invoice since June 2023, well before Programmes existed) -- the
 * same subscription_details object readSubscriptionIdFromInvoice reads the
 * subscription id from, so this is the same canonical path, not a new shape
 * to keep in sync.
 */
function readCurationRequestIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const parent = (
    invoice as {
      parent?: { subscription_details?: { metadata?: Record<string, string> | null } };
    }
  ).parent;
  const id = parent?.subscription_details?.metadata?.curation_request_id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/** curation_request_id straight off a Subscription object's own metadata. */
function readCurationRequestIdFromSubscription(subscription: Stripe.Subscription): string | null {
  const id = subscription.metadata?.curation_request_id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/**
 * invoice.paid for a managed curation subscription: the service is being paid
 * for, so keep it in_progress and stamp the payment. Returns false when the
 * subscription is not a curation one, so the webhook router tries other domains.
 */
export async function handleCurationInvoicePaid(
  invoice: Stripe.Invoice,
  client?: SupabaseClient,
): Promise<boolean> {
  const subId = readSubscriptionIdFromInvoice(invoice);
  const curationRequestId = readCurationRequestIdFromInvoice(invoice);
  if (!subId && !curationRequestId) return false;

  const db = client ?? getSupabaseAdmin();
  const row = await resolveCurationRow(db, { subId, curationRequestId });
  if (!row) return false;

  await db
    .from("curation_requests")
    .update({
      status: "in_progress",
      last_invoice_paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      // Task 5: backfills the column for a row only just found via metadata
      // (a programme); a harmless re-write of the same value for a managed
      // row already found by it.
      ...(subId ? { stripe_subscription_id: subId } : {}),
    })
    .eq("id", row.id);

  // D23: a renewal is money landing again, and it was silent. Only ping on a
  // recurring cycle — the first invoice (subscription_create) is already covered
  // by the checkout webhook's notifyAdminCurationPaid, so guarding here avoids a
  // double send at signup.
  if (invoice.billing_reason === "subscription_cycle") {
    // K1: was notifyAdminCurationPaid. Keyed on the invoice, so a Stripe
    // redelivery of the same renewal cannot re-alert.
    await sendAdminAlert({
      idempotencyKey: `admin_curation_paid:renewal:${invoice.id}`,
      subject: `Curation renewal paid (£${((invoice.amount_paid ?? 0) / 100).toFixed(2)}): ${row.venue_name ?? ""}`,
      summary: `${row.venue_name ?? "A venue"} renewed their managed curation subscription.`,
      fields: [
        { label: "Tier", value: CURATION_TIERS[row.tier as CurationTierKey]?.label || row.tier || "" },
        { label: "Amount", value: `£${((invoice.amount_paid ?? 0) / 100).toFixed(2)}` },
        {
          label: "Contact",
          value: `${row.contact_name ?? ""}${row.contact_email ? ` <${row.contact_email}>` : ""}`,
        },
        { label: "Kind", value: "Managed subscription renewal" },
      ],
      actionPath: "/admin/curation",
      actionLabel: "View in admin",
    });
  }
  return true;
}

/**
 * customer.subscription.deleted for a managed curation subscription: Stripe has
 * confirmed cancellation. Mark the row cancelled and tell the admin so the
 * curator stops doing the work unpaid.
 */
export async function handleCurationSubscriptionDeleted(
  subscription: Stripe.Subscription,
  client?: SupabaseClient,
): Promise<boolean> {
  const db = client ?? getSupabaseAdmin();
  const curationRequestId = readCurationRequestIdFromSubscription(subscription);
  const row = await resolveCurationRow(db, { subId: subscription.id, curationRequestId });
  if (!row) return false;

  await db
    .from("curation_requests")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      // Task 5: subscription.id is always present on a Subscription object,
      // unlike an invoice's subId, so this is never conditional.
      stripe_subscription_id: subscription.id,
    })
    .eq("id", row.id);

  // K1: was notifyAdminCurationCancelled.
  await sendAdminAlert({
    idempotencyKey: `admin_curation_cancelled:${row.id}`,
    subject: `Curation subscription cancelled: ${row.venue_name ?? ""}`,
    summary:
      "Stripe has confirmed the cancellation. The curator should stop work, which is now unpaid.",
    fields: [
      { label: "Request", value: row.id },
      { label: "Venue", value: row.venue_name ?? "" },
      { label: "Tier", value: row.tier ?? "" },
    ],
    actionPath: "/admin/curation",
    actionLabel: "View in admin",
  });
  return true;
}

/**
 * invoice.payment_failed for a managed curation subscription. Stripe retries a
 * few times; while attempts remain the row is past_due, and once Stripe gives up
 * (next_payment_attempt === null) it is effectively paused.
 */
export async function handleCurationInvoiceFailed(
  invoice: Stripe.Invoice,
  client?: SupabaseClient,
): Promise<boolean> {
  const subId = readSubscriptionIdFromInvoice(invoice);
  const curationRequestId = readCurationRequestIdFromInvoice(invoice);
  if (!subId && !curationRequestId) return false;

  const db = client ?? getSupabaseAdmin();
  const row = await resolveCurationRow(db, { subId, curationRequestId });
  if (!row) return false;

  const finalAttempt = invoice.next_payment_attempt === null;
  await db
    .from("curation_requests")
    .update({
      status: finalAttempt ? "paused" : "past_due",
      updated_at: new Date().toISOString(),
      // Task 5: see handleCurationInvoicePaid -- a card can fail before a
      // programme's row has ever been linked by subscription id.
      ...(subId ? { stripe_subscription_id: subId } : {}),
    })
    .eq("id", row.id);
  return true;
}
