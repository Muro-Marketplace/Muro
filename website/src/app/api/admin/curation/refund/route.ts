// 04 D18: the curation refund path. Until this existed, the only "refund" an
// admin could perform was selecting Refunded in the status dropdown, which
// moved no money: the status lied and Stripe kept the payment.
//
// Two shapes, decided by what the row holds:
//
//   - One-off tiers store a real payment intent (D20 guarantees the column only
//     ever holds `pi_...` or NULL, never a subscription id). Full refund of
//     that payment intent.
//   - Managed tiers store a subscription id. "Refund" means: cancel the
//     subscription so no further invoices are raised, then refund the most
//     recent PAID invoice. A managed row that never paid an invoice is
//     cancelled without a refund, and the response says which happened.
//
// Both refunds carry an idempotency key scoped to the request row, so a
// double-clicked button or a retried request cannot refund twice. The status
// write happens AFTER Stripe succeeds: a failed refund leaves the row in its
// truthful pre-refund state.

import { NextResponse } from "next/server";
import { z } from "zod";
import Stripe from "stripe";
import { withAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { stripe } from "@/lib/stripe";
import { sendEmail } from "@/lib/email/send";
import { CurationRefundIssued } from "@/emails/templates/venue-lifecycle/CurationRefundIssued";
import { CURATION_TIERS, type CurationTierKey } from "@/lib/curation-tiers";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";

const bodySchema = z.object({ id: z.string().uuid() });

interface CurationRow {
  id: string;
  venue_name: string;
  contact_name: string | null;
  contact_email: string | null;
  tier: string;
  status: string;
  amount_paid_gbp: number | null;
  stripe_payment_intent_id: string | null;
  stripe_subscription_id: string | null;
  cancelled_at: string | null;
}

export async function POST(request: Request) {
  return withAdmin(request, "curation_refund", async ({ audit }) => {
    const body = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const db = getSupabaseAdmin();
    const { data: row, error: rowErr } = await db
      .from("curation_requests")
      .select(
        "id, venue_name, contact_name, contact_email, tier, status, amount_paid_gbp, stripe_payment_intent_id, stripe_subscription_id, cancelled_at",
      )
      .eq("id", parsed.data.id)
      .maybeSingle<CurationRow>();

    if (rowErr) {
      console.error("curation refund lookup error:", rowErr);
      return NextResponse.json({ error: "Failed to load request" }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: "Curation request not found" }, { status: 404 });
    }
    if (row.status === "refunded") {
      return NextResponse.json({ error: "Already refunded" }, { status: 409 });
    }

    const pi = row.stripe_payment_intent_id;
    const sub = row.stripe_subscription_id;

    // The wound D18 names: refund tooling keyed on a column holding a `sub_...`
    // id would call refunds.create with it and fail. D20 fixed the storage;
    // this refuses at the boundary in case a bad value ever returns.
    if (pi && !pi.startsWith("pi_")) {
      console.error(`curation refund: ${row.id} stripe_payment_intent_id holds a non-pi value`);
      return NextResponse.json(
        { error: "The stored payment reference is not a payment intent. Check the row in Stripe before refunding." },
        { status: 409 },
      );
    }
    if (!pi && !sub) {
      return NextResponse.json(
        { error: "Nothing to refund: this request has no payment on record" },
        { status: 409 },
      );
    }

    let subscriptionCancelled = false;
    let refund: Stripe.Refund | null = null;
    let refundedPence = 0;

    try {
      if (sub) {
        // Managed tier. Stop the billing first: even if the invoice refund
        // below fails, no FURTHER money should be taken.
        try {
          await stripe.subscriptions.cancel(sub);
          subscriptionCancelled = true;
        } catch (cancelErr) {
          // Cancelling an already-cancelled subscription throws; that is the
          // state we wanted, so continue to the refund.
          const msg = cancelErr instanceof Error ? cancelErr.message : String(cancelErr);
          if (/canceled subscription/i.test(msg) || /No such subscription/i.test(msg)) {
            subscriptionCancelled = true;
          } else {
            throw cancelErr;
          }
        }

        const invoices = await stripe.invoices.list({ subscription: sub, status: "paid", limit: 1 });
        const invoice = invoices.data[0] as (Stripe.Invoice & { payment_intent?: string | Stripe.PaymentIntent | null }) | undefined;
        const invoicePi =
          typeof invoice?.payment_intent === "string"
            ? invoice.payment_intent
            : invoice?.payment_intent?.id || null;

        if (invoicePi) {
          refund = await stripe.refunds.create(
            { payment_intent: invoicePi },
            { idempotencyKey: `curation_refund:${row.id}` },
          );
          refundedPence = refund.amount;
        }
      } else if (pi) {
        // One-off tier: full refund (no amount = Stripe refunds the lot).
        refund = await stripe.refunds.create(
          { payment_intent: pi },
          { idempotencyKey: `curation_refund:${row.id}` },
        );
        refundedPence = refund.amount;
      }
    } catch (stripeErr) {
      console.error("curation refund Stripe error:", stripeErr);
      return NextResponse.json(
        {
          error: subscriptionCancelled
            ? "The subscription was cancelled but the refund failed. Refund the last invoice manually in Stripe, then set the status by hand."
            : "Stripe refused the refund. Check the payment in the Stripe dashboard.",
        },
        { status: 502 },
      );
    }

    // Money moved (or billing stopped with nothing refundable). Now the row.
    const nowIso = new Date().toISOString();
    const updates: Record<string, unknown> = {
      status: refund ? "refunded" : "cancelled",
      updated_at: nowIso,
    };
    if (subscriptionCancelled && !row.cancelled_at) updates.cancelled_at = nowIso;

    const { error: updErr } = await db.from("curation_requests").update(updates).eq("id", row.id);
    if (updErr) {
      // The refund is real whatever the row says; surface loudly rather than 500
      // (which would invite a retry of a refund that already happened).
      console.error("curation refund row update error:", updErr);
    }

    audit({
      curationRequestId: row.id,
      mode: sub ? "subscription" : "payment_intent",
      refundId: refund?.id ?? null,
      refundedPence,
      subscriptionCancelled,
    });

    if (row.contact_email && refund) {
      const tierLabel = CURATION_TIERS[row.tier as CurationTierKey]?.label || row.tier;
      try {
        await sendEmail({
          idempotencyKey: `curation_refund_issued:${row.id}`,
          template: "curation_refund_issued",
          category: "orders_and_payouts",
          to: row.contact_email,
          subject: "Your Wallplace curation payment has been refunded",
          react: CurationRefundIssued({
            contactFirstName: (row.contact_name || "there").split(" ")[0],
            venueName: row.venue_name,
            tierLabel,
            amount: { amount: refundedPence, currency: "GBP" },
            subscriptionCancelled,
            supportUrl: `${SITE}/support`,
          }),
          metadata: { curationRequestId: row.id },
        });
      } catch (emailErr) {
        // The refund stands; a failed receipt is a log line, not a rollback.
        console.error("curation refund email error:", emailErr);
      }
    }

    return NextResponse.json({
      success: true,
      refunded: Boolean(refund),
      refundedPence,
      subscriptionCancelled,
      status: updates.status,
    });
  });
}
