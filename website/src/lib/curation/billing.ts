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
// paths still run for their own subscriptions. The row is found by
// stripe_subscription_id (migration 099); the state columns come from migration
// 100.
//
// Out of scope (feature, not this reconcile bug): the customer renewal receipt
// and the curation refund path (D57.4 / D56.3). The renewal-paid customer
// notification belongs with D23.

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
  if (!subId) return false;

  const db = client ?? getSupabaseAdmin();
  const row = await findBySubscription(db, subId);
  if (!row) return false;

  await db
    .from("curation_requests")
    .update({
      status: "in_progress",
      last_invoice_paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
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
  const row = await findBySubscription(db, subscription.id);
  if (!row) return false;

  await db
    .from("curation_requests")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
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
  if (!subId) return false;

  const db = client ?? getSupabaseAdmin();
  const row = await findBySubscription(db, subId);
  if (!row) return false;

  const finalAttempt = invoice.next_payment_attempt === null;
  await db
    .from("curation_requests")
    .update({
      status: finalAttempt ? "paused" : "past_due",
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  return true;
}
