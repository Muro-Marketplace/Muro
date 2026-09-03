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
// Email audit, 2026-09-04: the venue paying for the subscription now hears
// about all three lifecycle events, not just the admin. A renewal sends a
// receipt (CurationRenewalReceipt), a failed payment sends dunning
// (CurationPaymentFailed, retry and final variants, mirroring the paid-loan
// sibling), and a confirmed cancellation sends a confirmation
// (CurationSubscriptionCancelled). Each is keyed on the Stripe object that
// caused it, so a webhook redelivery cannot double it, and each sits in its
// own try/catch so a mail failure never reaches the reconciler. The admin
// alerts are unchanged. Still out of scope: the curation refund path
// (D57.4 / D56.3).
//
// Review fix: because checkout.session.completed never fires for a programme
// (this file's header above), a programme's FIRST payment used to trigger
// neither of the two things that branch does for every other tier -- no
// admin alert, no customer receipt email. The row still flipped to
// in_progress, silently: nobody at Wallplace was told to start curating, and
// the client who had just committed to a year got no confirmation.
// handleCurationInvoicePaid below now alerts the admin and emails the client
// when `row.tier === "programme"` on billing_reason "subscription_create" --
// the one case where there is no earlier send to double up on, unlike the
// subscription_cycle guard just below, which still deliberately skips a
// renewal's first invoice for exactly that reason.

import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { epochToUkDate, readSubscriptionIdFromInvoice } from "@/lib/stripe-subscription-period";
import { sendAdminAlert } from "@/lib/email/admin-alert";
import { sendEmail } from "@/lib/email/send";
import { CurationProgrammeConfirmed } from "@/emails/templates/venue-lifecycle/CurationProgrammeConfirmed";
import {
  CurationPaymentFailed,
  curationKindLabel,
  type CurationSubscriptionKind,
} from "@/emails/templates/payments/CurationPaymentFailed";
import { CurationRenewalReceipt } from "@/emails/templates/payments/CurationRenewalReceipt";
import { CurationSubscriptionCancelled } from "@/emails/templates/payments/CurationSubscriptionCancelled";
import { CURATION_TIERS, type CurationTierKey } from "@/lib/curation-tiers";
import { accrueProgrammeRent } from "@/lib/curation/programme-rent";

interface CurationRow {
  id: string;
  status: string;
  /** The requester's auth user id when they were signed in at enquiry time; null for an anonymous enquiry. */
  requester_user_id: string | null;
  contact_email: string | null;
  contact_name: string | null;
  venue_name: string | null;
  tier: string | null;
  // Review fix: a programme's first invoice.paid is the only place its admin
  // alert and customer receipt are ever built (see this file's header), so
  // these Task-4-quoted fields need to travel with the row from here, not
  // just from the checkout route that (for every other tier) already had them.
  quoted_amount_gbp: number | null;
  billing_interval: "month" | "quarter" | null;
  pieces_estimate: number | null;
  rotation_cadence: string | null;
  term_months: number | null;
}

async function findBySubscription(
  db: SupabaseClient,
  subId: string,
): Promise<CurationRow | null> {
  const { data, error } = await db
    .from("curation_requests")
    .select(
      "id, status, requester_user_id, contact_email, contact_name, venue_name, tier, quoted_amount_gbp, " +
        "billing_interval, pieces_estimate, rotation_cadence, term_months",
    )
    .eq("stripe_subscription_id", subId)
    .maybeSingle<CurationRow>();
  // PostgREST rejects a `.select()` wholesale if any named column is unknown, so an
  // error here usually means a schema mismatch, not "no such row" -- log it loudly
  // rather than let the `?? null` fallback below make the two indistinguishable
  // (see tests/integration/phantom-columns.test.ts). Still returns null rather than
  // throwing: callers are webhook handlers whose contract is a boolean, and throwing
  // would change reconciliation control flow.
  if (error) {
    console.error("[curation billing] findBySubscription query failed", {
      subId,
      error: error.message,
    });
    return null;
  }
  return data ?? null;
}

/** Task 5: the metadata fallback. Same row shape, looked up by primary key. */
async function findByRequestId(
  db: SupabaseClient,
  curationRequestId: string,
): Promise<CurationRow | null> {
  const { data, error } = await db
    .from("curation_requests")
    .select(
      "id, status, requester_user_id, contact_email, contact_name, venue_name, tier, quoted_amount_gbp, " +
        "billing_interval, pieces_estimate, rotation_cadence, term_months",
    )
    .eq("id", curationRequestId)
    .maybeSingle<CurationRow>();
  // See findBySubscription above: a missing column fails the whole select, so this
  // is logged rather than swallowed into a false "no row" result.
  if (error) {
    console.error("[curation billing] findByRequestId query failed", {
      curationRequestId,
      error: error.message,
    });
    return null;
  }
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

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk").replace(/\/$/, "");

/** Which of the two subscription products a row is, for the venue-facing copy. */
function kindOf(row: CurationRow): CurationSubscriptionKind {
  return row.tier === "programme" ? "programme" : "managed";
}

/** Today as the UK date the venue emails print, for a Stripe timestamp that is missing. */
function todayUk(): string {
  return new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function contactFirstName(row: CurationRow): string {
  return (row.contact_name || "there").trim().split(" ")[0] || "there";
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

  // Task 6: rent accrues to every artist placed under this programme on
  // EVERY paid invoice, not just the first -- unlike the two notification
  // blocks below, this is not gated on billing_reason. Own try/catch,
  // deliberately: this runs before the subscription_cycle and
  // subscription_create blocks further down, and an uncaught throw here
  // would abort the rest of this function, silently skipping the renewal
  // alert or the first-payment alert + client receipt below it. The status
  // reconcile above has already landed by this point regardless, since it is
  // its own awaited call with nothing left to roll back.
  if (row.tier === "programme") {
    try {
      await accrueProgrammeRent(db, {
        curationRequestId: row.id,
        invoiceId: invoice.id,
        periodMonths: row.billing_interval === "quarter" ? 3 : 1,
        quotedAmountPence: Math.round((row.quoted_amount_gbp ?? 0) * 100),
        venueName: row.venue_name,
      });
    } catch (err) {
      console.error("[curation billing] programme rent accrual failed", {
        requestId: row.id,
        invoiceId: invoice.id,
        err,
      });
    }
  }

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
        // Review fix: this literal used to read "Managed subscription renewal"
        // unconditionally, which was wrong for a programme row (this same
        // reconciler services both). Reflects the row it is actually about.
        {
          label: "Kind",
          value: row.tier === "programme" ? "Programme renewal" : "Managed subscription renewal",
        },
      ],
      actionPath: "/admin/curation",
      actionLabel: "View in admin",
    });

    // The venue's own receipt. Until this existed the alert above was the
    // only send on a renewal, so a venue paying every month or quarter heard
    // nothing after their first invoice. Keyed on the invoice, like the
    // alert; own try/catch, since the two are separate failure domains.
    if (row.contact_email) {
      try {
        await sendEmail({
          idempotencyKey: `curation_renewal_receipt:${invoice.id}`,
          template: "curation_renewal_receipt",
          category: "orders_and_payouts",
          to: row.contact_email,
          userId: row.requester_user_id ?? undefined,
          subject: `Payment received for ${row.venue_name ?? "your venue"}`,
          react: CurationRenewalReceipt({
            contactFirstName: contactFirstName(row),
            venueName: row.venue_name ?? "your venue",
            kind: kindOf(row),
            invoiceNumber: invoice.number || invoice.id || "invoice",
            amountPaid: { amount: invoice.amount_paid ?? 0, currency: "GBP" },
            paidOn: epochToUkDate(invoice.status_transitions?.paid_at, todayUk()),
            billingInterval: row.billing_interval === "quarter" ? "quarter" : "month",
            invoiceUrl: invoice.hosted_invoice_url || `${SITE}/curated`,
            supportUrl: `${SITE}/support`,
          }),
          metadata: { curationRequestId: row.id, invoiceId: invoice.id ?? "" },
        });
      } catch (err) {
        console.error("[curation billing] renewal receipt failed", { requestId: row.id, err });
      }
    }
  }

  // Review fix: a programme's checkout session never carries
  // `kind: "curation_request"` (this file's header comment), so its first
  // invoice is the only event anyone is ever told about it. Unlike the
  // subscription_cycle guard above, there is no earlier send to double up on
  // here — this IS the first send, for this one tier only.
  if (row.tier === "programme" && invoice.billing_reason === "subscription_create") {
    const intervalLabel = row.billing_interval === "quarter" ? "quarter" : "month";

    // Independent try/catches: the admin alert and the customer receipt are
    // two unrelated failure domains (one admin inbox, one client inbox), so
    // one must not stop the other being attempted, and neither may throw back
    // into the reconciler — the status write above already landed and must
    // stand regardless of whether either send succeeds. Mirrors the pattern
    // the venue/artist payout legs use in the webhook route for the same
    // reason, and matches how sendEmail is guarded on the equivalent send in
    // ../../app/api/admin/curation/quote/route.ts.
    try {
      await sendAdminAlert({
        idempotencyKey: `admin_curation_paid:programme_first:${invoice.id}`,
        subject: `Programme confirmed, first payment (£${((invoice.amount_paid ?? 0) / 100).toFixed(2)}): ${row.venue_name ?? ""}`,
        summary: `${row.venue_name ?? "A venue"} paid their first Wallplace Programme invoice. Time to arrange curation and installation.`,
        fields: [
          { label: "Venue", value: row.venue_name ?? "" },
          {
            label: "Quote",
            value:
              row.quoted_amount_gbp != null
                ? `£${row.quoted_amount_gbp.toFixed(2)} per ${intervalLabel}`
                : "",
          },
          { label: "Pieces", value: row.pieces_estimate != null ? String(row.pieces_estimate) : "" },
          { label: "Rotation", value: row.rotation_cadence ?? "" },
          { label: "Request", value: row.id },
          {
            label: "Contact",
            value: `${row.contact_name ?? ""}${row.contact_email ? ` <${row.contact_email}>` : ""}`,
          },
        ],
        actionPath: "/admin/curation",
        actionLabel: "View in admin",
      });
    } catch (err) {
      console.error("[curation billing] programme first-payment admin alert failed", { requestId: row.id, err });
    }

    if (row.contact_email) {
      try {
        await sendEmail({
          idempotencyKey: `curation_programme_confirmed:${row.id}`,
          template: "curation_programme_confirmed",
          category: "orders_and_payouts",
          to: row.contact_email,
          subject: "Your Wallplace programme is confirmed",
          react: CurationProgrammeConfirmed({
            contactFirstName: (row.contact_name || "there").split(" ")[0],
            venueName: row.venue_name ?? "",
            quotedAmount: { amount: Math.round((row.quoted_amount_gbp ?? 0) * 100), currency: "GBP" },
            billingInterval: intervalLabel,
            rotationCadence: row.rotation_cadence,
            termMonths: row.term_months ?? CURATION_TIERS.programme.termMonths,
          }),
          metadata: { curationRequestId: row.id },
        });
      } catch (err) {
        console.error("[curation billing] programme first-payment receipt failed", { requestId: row.id, err });
      }
    }
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

  // The venue's confirmation. customer.subscription.deleted means the
  // subscription has actually ended (Stripe fires it at the end of the period
  // for a scheduled cancellation, and immediately otherwise), so the copy is
  // past tense: it is over and no further payment will be taken. Keyed on the
  // subscription, so a redelivery cannot double it.
  if (row.contact_email) {
    try {
      const kind = kindOf(row);
      await sendEmail({
        idempotencyKey: `curation_subscription_cancelled:${subscription.id}`,
        template: "curation_subscription_cancelled",
        category: "orders_and_payouts",
        to: row.contact_email,
        userId: row.requester_user_id ?? undefined,
        subject:
          kind === "programme"
            ? "Your Wallplace programme has ended"
            : "Your Wallplace curation subscription has ended",
        react: CurationSubscriptionCancelled({
          contactFirstName: contactFirstName(row),
          venueName: row.venue_name ?? "your venue",
          kind,
          endedOn: epochToUkDate(subscription.ended_at ?? subscription.canceled_at, todayUk()),
          restartUrl: `${SITE}/curated`,
          supportUrl: `${SITE}/support`,
        }),
        metadata: { curationRequestId: row.id, subscriptionId: subscription.id },
      });
    } catch (err) {
      console.error("[curation billing] cancellation confirmation failed", { requestId: row.id, err });
    }
  }
  return true;
}

/**
 * invoice.payment_failed for a managed curation subscription. Stripe retries a
 * few times; while attempts remain the row is past_due, and once Stripe gives up
 * (next_payment_attempt === null) it is effectively paused.
 *
 * The venue is told at both intensities (a retryable failure asks for the
 * card to be fixed, the final one says the subscription is paused) and the
 * admin is told on the final one, since that is the point the curator has to
 * stop work. Before this the status flipped and nobody heard.
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

  const kind = kindOf(row);
  const kindWord = kind === "programme" ? "programme" : "curation";
  // Stripe's amount_due is what the card was asked for; the quote is the
  // fallback for an invoice object that arrived without it.
  const amountDuePence = invoice.amount_due ?? Math.round((row.quoted_amount_gbp ?? 0) * 100);

  if (row.contact_email) {
    try {
      await sendEmail({
        // The stage is in the key, like the paid-loan dunning: the retry
        // notice and the final notice are two different emails about the
        // same invoice, and a redelivery of either must not double it.
        idempotencyKey: `curation_dunning:${invoice.id}:${finalAttempt ? "final" : "retry"}`,
        template: "curation_payment_failed",
        category: "orders_and_payouts",
        to: row.contact_email,
        userId: row.requester_user_id ?? undefined,
        subject: finalAttempt
          ? `Your Wallplace ${kindWord} payments are paused`
          : `Your Wallplace ${kindWord} payment failed`,
        react: CurationPaymentFailed({
          contactFirstName: contactFirstName(row),
          venueName: row.venue_name ?? "your venue",
          kind,
          amountDue: { amount: amountDuePence, currency: "GBP" },
          finalAttempt,
          // Stripe's hosted invoice page lets the venue pay the invoice and
          // update the card in one place; there is no Wallplace billing page
          // for a curation subscription.
          payUrl: invoice.hosted_invoice_url || `${SITE}/curated`,
          supportUrl: `${SITE}/support`,
        }),
        metadata: { curationRequestId: row.id, invoiceId: invoice.id ?? "", finalAttempt },
      });
    } catch (err) {
      console.error("[curation billing] dunning email failed", { requestId: row.id, err });
    }
  }

  if (finalAttempt) {
    try {
      await sendAdminAlert({
        idempotencyKey: `admin_curation_payment_failed:${invoice.id}`,
        subject: `Curation payments paused, card failed: ${row.venue_name ?? ""}`,
        summary:
          `Stripe has given up collecting ${row.venue_name ?? "a venue"}'s ${curationKindLabel(kind)} payment ` +
          `(£${(amountDuePence / 100).toFixed(2)}). The row is paused and the curator should stop work until it is paid.`,
        fields: [
          { label: "Request", value: row.id },
          { label: "Venue", value: row.venue_name ?? "" },
          { label: "Tier", value: row.tier ?? "" },
          { label: "Amount due", value: `£${(amountDuePence / 100).toFixed(2)}` },
          {
            label: "Contact",
            value: `${row.contact_name ?? ""}${row.contact_email ? ` <${row.contact_email}>` : ""}`,
          },
        ],
        actionPath: "/admin/curation",
        actionLabel: "View in admin",
      });
    } catch (err) {
      console.error("[curation billing] payment-failed admin alert failed", { requestId: row.id, err });
    }
  }
  return true;
}
