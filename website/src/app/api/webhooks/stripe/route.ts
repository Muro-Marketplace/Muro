import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { WORKS_CAP } from "@/lib/pricing";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { scheduleTransfer, recordBlockedLeg } from "@/lib/stripe-connect";
import { canReceivePayout } from "@/lib/payouts/capability";
import { sendAdminAlert } from "@/lib/email/admin-alert";
import { CurationPaymentReceived } from "@/emails/templates/venue-lifecycle/CurationPaymentReceived";
import { CURATION_TIERS, type CurationTierKey } from "@/lib/curation-tiers";
import { createNotification } from "@/lib/notifications";
import { sendEmail } from "@/lib/email/send";
import { resolveArtistNamesBulk } from "@/emails/_helpers/resolve-artist-name";
import { ArtistPayoutSent } from "@/emails/templates/payments/ArtistPayoutSent";
import { ReferralCreditGranted } from "@/emails/templates/payments/ReferralCreditGranted";
import { SubscriptionRecovered } from "@/emails/templates/payments/SubscriptionRecovered";
import { ArtistPayoutFailed } from "@/emails/templates/payments/ArtistPayoutFailed";
import { SubscriptionPaymentFailed } from "@/emails/templates/payments/SubscriptionPaymentFailed";
import { SubscriptionTrialEnding } from "@/emails/templates/payments/SubscriptionTrialEnding";
import { SubscriptionStarted } from "@/emails/templates/payments/SubscriptionStarted";
import { SubscriptionUpgraded } from "@/emails/templates/payments/SubscriptionUpgraded";
import { SubscriptionCancelled } from "@/emails/templates/payments/SubscriptionCancelled";
import { SubscriptionCardExpiring } from "@/emails/templates/payments/SubscriptionCardExpiring";
import { SubscriptionRenewalReceipt } from "@/emails/templates/payments/SubscriptionRenewalReceipt";
import { ArtistStripeKycNeeded } from "@/emails/templates/artist-additions/ArtistStripeKycNeeded";
// Only the default remains here: the per-artist rate is resolved inside
// buildArtistLegs, one artist at a time (E9).
import { DEFAULT_PLAN_FEE_PERCENT } from "@/lib/platform-fee";
import {
  buildArtistLegs,
  assertLegsReconcile,
  reconcilePlatformFee,
  penceToGbp,
  type CartLine,
  type ArtistLeg,
} from "@/lib/payouts/legs";
import { loadCartSession } from "@/lib/cart-sessions";
import {
  periodFromSubscription,
  epochToIso,
  epochToUkDate,
} from "@/lib/stripe-subscription-period";
import {
  recordPaidLoanSubscription,
  handleInvoicePaid as handleInvoicePaidPaidLoan,
  handleInvoicePaymentFailed as handleInvoicePaymentFailedPaidLoan,
  handleSubscriptionDeleted as handleSubscriptionDeletedPaidLoan,
} from "@/lib/placements/paid-loan-billing";
import {
  handleCurationInvoicePaid,
  handleCurationInvoiceFailed,
  handleCurationSubscriptionDeleted,
} from "@/lib/curation/billing";
import { voidProgrammeAccrualsForInvoice } from "@/lib/curation/programme-rent";
import { sendOrderConfirmations, type OrderEmailItem } from "@/lib/orders/confirmations";
import { orderIdFromSession, classifyOrderIdConflict } from "@/lib/orders/order-id";
import { missingStripePriceEnvs } from "@/env";
import type Stripe from "stripe";
import { isSettled } from "@/lib/payments/settlement";
import { VenueCollectionPending } from "@/emails/templates/venue-lifecycle/VenueCollectionPending";
import { CustomerRefundConfirmation } from "@/emails/templates/orders/CustomerRefundConfirmation";
import { CustomerPaymentFailed } from "@/emails/templates/orders/CustomerPaymentFailed";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET not configured");
      return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
    }
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const db = getSupabaseAdmin();

  // D1 (04 §B0): global replay guard. Claim this event id before any branch runs,
  // so a Stripe redelivery is a no-op rather than a second order. Some branches
  // had their own idempotency (payment-intent unique, offer compare-and-set); this
  // closes the gap once, for every branch.
  const claim = await db
    .from("stripe_webhook_events")
    .insert({ event_id: event.id, event_type: event.type });
  if (claim.error) {
    if ((claim.error as { code?: string }).code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    // A real DB failure must 500 so Stripe retries, rather than us silently
    // processing an event we could not record.
    console.error("[webhook] dedup insert failed", claim.error);
    return NextResponse.json({ error: "Dedup unavailable" }, { status: 500 });
  }

  // A THROW from any branch (a Stripe SDK call, an email render) must land in
  // the same release path as a returned 500. Without this, the claim row
  // survives the crash and Stripe's retry is waved through as a duplicate,
  // which turns a transient fault into a permanently dropped event - the exact
  // failure the release below exists to prevent.
  let res: NextResponse;
  try {
    res = await handleWebhookEvent(event, db);
  } catch (err) {
    console.error("[webhook] unhandled processing error", { eventId: event.id, eventType: event.type, err });
    res = NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  // Release the claim if processing failed, so Stripe's retry can reprocess. The
  // plan's snippet claimed the event and never released it, which turned any
  // transient 500 (a DB write that should be retried) into a permanent drop: the
  // retry would hit 23505 and be waved through as a duplicate with the work never
  // done.
  if (res.status >= 500) {
    const { error: relErr } = await db
      .from("stripe_webhook_events")
      .delete()
      .eq("event_id", event.id);
    if (relErr) {
      console.error("[webhook] could not release the event claim", { eventId: event.id, relErr });
    }
  }
  return res;
}

async function handleWebhookEvent(
  event: Stripe.Event,
  db: ReturnType<typeof getSupabaseAdmin>,
): Promise<NextResponse> {
  // ─── D1 / 04 item 0.2: completed does not mean paid ───
  //
  // `checkout.session.completed` fires when the customer finishes the flow, not
  // when the money arrives. A delayed payment method (BACS Direct Debit, SEPA,
  // bank transfer, some cards under SCA) fires it with `payment_status:
  // "unpaid"` and settles days later, or never.
  //
  // Every branch below books something against that session: an order row, a
  // stock decrement, an artist transfer, a curation request marked paid. So the
  // gate is ONE check here rather than four inside them, which is also the only
  // shape a fifth branch cannot forget.
  //
  // 200, not an error: Stripe must NOT retry. There is nothing wrong, the money
  // simply has not landed. `checkout.session.async_payment_succeeded` is the
  // event that says it has, and the branches below already accept it, so
  // refusing here loses nothing.
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (!isSettled(session)) {
      console.warn("[webhook] checkout.session.completed is not settled, waiting", {
        sessionId: session.id,
        paymentStatus: session.payment_status,
        kind: session.metadata?.kind ?? session.metadata?.checkout_kind ?? session.mode,
      });
      return NextResponse.json({ received: true, awaiting_payment: true });
    }
  }

  // ─── Curation checkout (one-off OR managed subscription) ───
  // WS1.5: async_payment_succeeded is the settlement of a deferred completed
  // event (BACS and friends); every write below is idempotent, so accepting
  // both types books the money whichever event carries the settled state.
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.kind === "curation_request") {
      const requestId = session.metadata.curation_request_id;
      if (requestId) {
        const isSubscription = session.mode === "subscription";
        const paymentIntentId = typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id || "";
        // D20-complete: a managed tier is a subscription; its id now has a
        // dedicated column (migration 099) instead of contaminating the payment
        // intent column. NULL for a one-off tier (no subscription).
        const subscriptionId = typeof session.subscription === "string"
          ? session.subscription
          : (session.subscription?.id ?? null);
        const amountPaid = (session.amount_total || 0) / 100;
        const { data: existing } = await db
          .from("curation_requests")
          .select("id, tier, venue_name, contact_name, contact_email, status")
          .eq("id", requestId)
          .maybeSingle();

        if (existing && existing.status !== "paid" && existing.status !== "in_progress") {
          // Managed subscription → "in_progress" (ongoing service). One-off → "paid".
          const newStatus = isSubscription ? "in_progress" : "paid";
          const { error: updErr } = await db
            .from("curation_requests")
            .update({
              status: newStatus,
              // D20: stripe_payment_intent_id is a payment intent, so it holds a
              // real pi_… id or null. A managed tier is a subscription with no
              // top-level payment intent; its id goes in stripe_subscription_id
              // (migration 099), NOT here. The old `paymentIntentId ||
              // subscriptionId` stored a sub_… id in this column, so any refund
              // keyed on it would call
              // stripe.refunds.create({ payment_intent: "sub_…" }) and fail.
              stripe_payment_intent_id: paymentIntentId || null,
              stripe_subscription_id: subscriptionId,
              amount_paid_gbp: amountPaid,
              paid_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", requestId);
          if (updErr) {
            console.error("curation_requests update error:", updErr);
            return NextResponse.json({ error: "DB update failed" }, { status: 500 });
          }
          // One label source: CURATION_TIERS, not a second inline map that could drift.
          const tierLabel = CURATION_TIERS[existing.tier as CurationTierKey]?.label || existing.tier;

          // D23: tell the curator the money actually landed. notifyAdminCurationRequest
          // fired at submit, before payment, so without this an admin cannot tell a paid
          // brief from an abandoned checkout without opening Stripe. Fires whether or not
          // the venue left a contact email.
          // K1: was notifyAdminCurationPaid.
          await sendAdminAlert({
            idempotencyKey: `admin_curation_paid:${requestId}`,
            subject: `Curation paid (£${amountPaid}): ${existing.venue_name}`,
            summary: `${existing.venue_name} paid £${amountPaid} for ${tierLabel}. The brief is paid and ready to curate.`,
            fields: [
              { label: "Tier", value: tierLabel },
              { label: "Amount", value: `£${amountPaid}` },
              {
                label: "Contact",
                value: `${existing.contact_name}${existing.contact_email ? ` <${existing.contact_email}>` : ""}`,
              },
              {
                label: "Kind",
                value: isSubscription ? "Managed subscription, first payment" : "One-off payment",
              },
            ],
            actionPath: "/admin/curation",
            actionLabel: "View in admin",
          });

          if (existing.contact_email) {
            // K1: was notifyCurationCustomerPaid. This is a receipt, so losing
            // its audit trail mattered more than most.
            await sendEmail({
              idempotencyKey: `curation_payment_received:${requestId}`,
              template: "curation_payment_received",
              category: "orders_and_payouts",
              to: existing.contact_email,
              subject: "Your Wallplace curation is underway",
              react: CurationPaymentReceived({
                contactFirstName: (existing.contact_name || "there").split(" ")[0],
                venueName: existing.venue_name,
                tierLabel,
                amount: { amount: Math.round(amountPaid * 100), currency: "GBP" },
                shortlistDays: 5,
              }),
              metadata: { curationRequestId: requestId },
            });
          }
        }
      }
      return NextResponse.json({ received: true });
    }
  }

  // ─── Purchase-offer checkout (Request 1 — venue-only offers) ───
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.checkout_kind === "purchase_offer") {
      const offerId = session.metadata.offer_id;
      if (offerId) {
        const paidOrderId = orderIdFromSession("OFR", session.id);
        const nowIso = new Date().toISOString();
        const workIds = (session.metadata.offer_work_ids || "").split(",").filter(Boolean);
        const totalGbp = (session.amount_total || 0) / 100;
        const feePence = Number(session.metadata.offer_platform_fee_pence || 0);
        const netPence = Number(session.metadata.offer_artist_net_pence || 0);
        const artistUserId = session.metadata.offer_artist_user_id || null;
        // Task 5 (owner decision 2026-08-28): venue share on offer sales. The
        // checkout route already resolved this (every offered work on one
        // active placement, with a positive share and a venue user) and
        // stamped it onto the session metadata; this branch just reads it,
        // same as the fee/net split above.
        const offerVenueSlug = session.metadata.offer_venue_slug || null;
        const offerVenueUserId = session.metadata.offer_venue_user_id || null;
        const offerVenueCutPence = Number(session.metadata.offer_venue_cut_pence || 0);
        const offerVenueSharePct = Number(session.metadata.offer_venue_share_percent || 0);
        // Finding 3 (final review): the placement id travelling alongside the
        // share, so this order can be attributed to the venue's placement
        // card. Empty string on the metadata (Stripe values must be
        // strings) becomes a real null on the nullable orders column.
        const offerPlacementId = session.metadata.offer_placement_id || null;

        // E6. The order row is written FIRST and the offer is flipped to paid
        // only once it lands. The old order was the other way round with the
        // insert's failure swallowed into a console.warn, which is why both
        // real paid offers in prod carry a paid_order_id pointing at an order
        // row that does not exist: `orders.shipping` is NOT NULL and this
        // insert omitted it, so every purchase-offer payment failed with 23502
        // and nobody found out. Money in, no order, no payout, no email.
        const { error: insErr } = await db.from("orders").insert({
          id: paidOrderId,
          stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
          buyer_email: session.customer_email || session.metadata.offer_buyer_email || "",
          // Row 933-939 / P4. This was {offer_id, work_ids, collection_id} and
          // nothing else, so every reader of `orders.items` fell back to its
          // defaults and the artist portal showed "Artwork × 1, £0.00" on a
          // £26 order. The ids stay (they are the link back to the offer); the
          // title and the amount are added so the line reads as a line. The
          // enriched `lineTotal` shape is the one lib/order-items prefers.
          items: [{
            offer_id: offerId,
            work_ids: workIds,
            collection_id: session.metadata.offer_collection_id || null,
            title:
              session.metadata.offer_work_titles ||
              (session.metadata.offer_collection_id
                ? "Collection"
                : workIds.length > 1
                  ? `${workIds.length} works`
                  : "Artwork"),
            quantity: 1,
            lineTotal: { amount: session.amount_total || 0, currency: (session.currency || "gbp").toUpperCase() },
          }],
          // Rows 933-939. The offer session now asks Stripe for the buyer's
          // delivery address (`shipping_address_collection`), so this reads it
          // back rather than writing nine empty strings and a note explaining
          // that the artist has nowhere to post to. Same nine-field shape the
          // cart path writes, so every order view keeps working.
          shipping: offerShipping(session, offerId),
          subtotal: totalGbp,
          shipping_cost: 0,
          total: totalGbp,
          status: "confirmed",
          // jsonb column — store the array raw (Plan B Task 13).
          status_history: [{ status: "confirmed", timestamp: nowIso }],
          source: "purchase_offer",
          artist_slug: session.metadata.offer_artist_slug || null,
          artist_user_id: artistUserId,
          venue_slug: offerVenueSlug,
          placement_id: offerPlacementId,
          venue_revenue: offerVenueCutPence / 100,
          venue_revenue_share_percent: offerVenueSharePct,
          platform_fee: feePence / 100,
          platform_fee_percent: Number(session.metadata.offer_platform_fee_percent || 0),
          artist_revenue: netPence / 100,
          fulfilment_method: "ship",
          created_at: nowIso,
        });

        // 23505 is our own retry landing on a row we already wrote: idempotent,
        // carry on. Anything else means the money is captured and we have no
        // order, so fail loudly and let Stripe retry rather than marking the
        // offer paid against an order that isn't there.
        const offerIntentId =
          typeof session.payment_intent === "string" ? session.payment_intent : null;
        if (insErr) {
          if ((insErr as { code?: string }).code === "23505") {
            // D3: only proceed if this is our own row (same payment intent). A
            // collision on the OFR- id would otherwise flip THIS offer to paid
            // against a different payment's order.
            if ((await classifyOrderIdConflict(db, paidOrderId, offerIntentId)) === "collision") {
              console.error("[offer order insert] order id collision", { offerId, paidOrderId });
              return NextResponse.json({ error: "Order id collision" }, { status: 500 });
            }
          } else {
            console.error("[offer order insert] failed, offer left unpaid for retry", {
              offerId,
              paidOrderId,
              code: (insErr as { code?: string }).code,
              message: insErr.message,
            });
            return NextResponse.json({ error: "Order save failed" }, { status: 500 });
          }
        }

        await db
          .from("purchase_offers")
          .update({
            status: "paid",
            paid_at: nowIso,
            paid_order_id: paidOrderId,
            updated_at: nowIso,
          })
          .eq("id", offerId);

        // E10 decremented offer stock read-then-write; D5 moves it to the shared
        // atomic RPC so the same race the cart path had is closed here too (E10's
        // own comment deferred this to D5). The title read stays separate: it feeds
        // the confirmation email and is display-only, so it need not be atomic and a
        // failure just means a less specific email. Both are best-effort for the
        // same reason as the cart path: the offer is already flipped to paid above,
        // so a 500 here cannot cleanly unwind it.
        const workTitles: string[] = [];
        for (const workId of workIds) {
          const { data: work } = await db
            .from("artist_works")
            .select("title")
            .eq("id", workId)
            .maybeSingle();
          if (work?.title) workTitles.push(work.title as string);
          const { error: stockErr } = await db.rpc("decrement_work_stock", {
            p_work_id: workId,
            p_qty: 1,
          });
          if (stockErr) {
            console.warn("[offer] stock decrement failed", { workId, stockErr });
          }
        }

        // E6: pay the artist. Without this the platform kept 100% of every
        // accepted offer and no stripe_transfers ledger row was ever written.
        if (artistUserId && netPence > 0) {
          try {
            // D52: gate on canReceivePayout (payouts_enabled + a fresh Stripe
            // check), not the stale stripe_connect_onboarding_complete boolean C1
            // replaced — that predicate cannot tell a mid-KYC payout hold from a
            // live account, so it would schedule a transfer into an unpayable
            // balance. On a block, record the owed payout with the real reason.
            const cap = await canReceivePayout(db, { kind: "artist", userId: artistUserId });
            if (cap.ok && cap.accountId) {
              await scheduleTransfer({
                orderId: paidOrderId,
                recipientType: "artist",
                recipientUserId: artistUserId,
                connectAccountId: cap.accountId,
                amountCents: netPence,
                immediate: false,
              });
            } else {
              console.error("[offer] artist cannot be paid out, transfer skipped", {
                paidOrderId,
                artistUserId,
                netPence,
                reason: cap.reason,
              });
              await recordBlockedLeg(db, {
                orderId: paidOrderId,
                recipientUserId: artistUserId,
                amountCents: netPence,
                reason: cap.reason ?? "unknown",
              });
            }
          } catch (transferErr) {
            console.error("[offer] artist transfer error:", transferErr);
          }
        }

        // Task 5 / venue leg (owner decision 2026-08-28): the placement share
        // applies to offer sales of works hanging on that venue's wall. Same
        // gate and fallback semantics as the artist leg above: capability
        // check first, blocked-leg ledger row when the venue cannot be paid
        // yet. Its own try/catch, entirely separate from the artist leg's —
        // a venue transfer failure must never affect the artist's payout or
        // unwind the order already written above.
        //
        // canReceivePayout accepts a userId directly for a venue target (same
        // as artist), so this skips the venue_profiles slug lookup the plan
        // sketched: one fewer round trip, same capability answer.
        if (offerVenueUserId && offerVenueCutPence > 0) {
          try {
            const vcap = await canReceivePayout(db, { kind: "venue", userId: offerVenueUserId });
            if (vcap.ok && vcap.accountId) {
              await scheduleTransfer({
                orderId: paidOrderId,
                recipientType: "venue",
                recipientUserId: offerVenueUserId,
                connectAccountId: vcap.accountId,
                amountCents: offerVenueCutPence,
                immediate: false,
              });
            } else {
              await recordBlockedLeg(db, {
                orderId: paidOrderId,
                recipientType: "venue",
                recipientUserId: offerVenueUserId,
                amountCents: offerVenueCutPence,
                reason: vcap.reason ?? "unknown",
              });
            }
          } catch (venueTransferErr) {
            console.error("[offer] venue transfer error:", venueTransferErr);
          }
        }

        // E6 part 3: the offer branch sent nothing at all. The buyer got no
        // receipt (CCR 2013 requires one) and the artist was never told they
        // had sold anything. Same module as the cart path, because the reason
        // this branch drifted in the first place was that the sends were
        // inline in the other one.
        //
        // One aggregate line, not one per work: an offer is a single agreed
        // price, so splitting it across pieces would invent per-line figures
        // that do not exist and would not sum back to what was charged.
        const offerTitle = session.metadata.offer_collection_id
          ? `Collection ${session.metadata.offer_collection_id}`
          : workTitles.length === 1
            ? workTitles[0]
            : `${workIds.length} work${workIds.length === 1 ? "" : "s"}`;
        const { data: offerArtist } = await db
          .from("artist_profiles")
          .select("name")
          .eq("user_id", artistUserId || "")
          .maybeSingle();
        const offerBuyerEmail = session.customer_email || session.metadata.offer_buyer_email || "";

        try {
          await sendOrderConfirmations(db, {
            orderId: paidOrderId,
            paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
            buyerEmail: offerBuyerEmail || null,
            // No name is collected anywhere in the offer flow, so the module's
            // per-use fallbacks apply ("there" to the buyer, "your buyer" to
            // the artist).
            buyerName: "",
            items: [{
              title: offerTitle,
              artistName: (offerArtist?.name as string | undefined)
                || session.metadata.offer_artist_slug
                || "Artist",
              quantity: 1,
              image: `${SITE}/placeholder-work.jpg`,
              lineTotal: { amount: session.amount_total || 0, currency: "GBP" },
            }],
            subtotal: totalGbp,
            shippingCost: 0,
            total: totalGbp,
            address: { line1: "", city: "", postcode: "", country: "GB" },
            artistUserId,
            artistRevenue: netPence / 100,
            firstItemTitle: offerTitle,
            stripeSessionId: session.id,
            // An offer is between buyer and artist. No placement, so no venue
            // share to notify about.
            venue: null,
          });
        } catch (confirmErr) {
          // The money is taken and the order exists. A failed email must not
          // turn that into a Stripe retry that redoes the payout path.
          console.error("[offer] confirmations failed", { paidOrderId, confirmErr });
        }
      }
      return NextResponse.json({ received: true });
    }
  }

  // ─── Paid-loan monthly: subscription checkout completed (E7a) ───
  //
  // Owns the session created by api/placements/[id]/payment/setup. Nothing
  // consumed it, so a venue could complete the Stripe subscription flow and be
  // billed monthly while placements.stripe_subscription_id stayed null: the setup
  // route's "already set up" guard never fired, so a second subscription could be
  // minted for the same placement, and cancelPaidLoanBilling could never find the
  // subscription to stop it. placement_recurring_billings has 0 rows in prod,
  // which is what "written by nothing" looks like.
  if (
    (event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded") &&
    (event.data.object as Stripe.Checkout.Session).metadata?.kind === "paid_loan_monthly"
  ) {
    const session = event.data.object as Stripe.Checkout.Session;
    const placementId = session.metadata?.placement_id;
    const subscriptionId =
      typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

    if (!placementId || !subscriptionId) {
      console.error("[webhook] paid_loan_monthly session missing ids", {
        sessionId: session.id,
        placementId,
        subscriptionId,
      });
      return NextResponse.json({ error: "Malformed paid-loan session" }, { status: 400 });
    }

    const { data: placement, error: plErr } = await db
      .from("placements")
      .select("id, venue_user_id, artist_user_id, monthly_fee_gbp")
      .eq("id", placementId)
      .maybeSingle();
    if (plErr || !placement) {
      console.error("[webhook] paid_loan_monthly unknown placement", { placementId, plErr });
      return NextResponse.json({ error: "Unknown placement" }, { status: 500 });
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const { cpStart, cpEnd } = periodFromSubscription(subscription);
    const customerId =
      typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;

    const recorded = await recordPaidLoanSubscription(
      {
        placementId,
        subscriptionId,
        customerId: customerId || "",
        payerUserId: placement.venue_user_id,
        payeeUserId: placement.artist_user_id,
        monthlyAmountPence: Math.round(Number(placement.monthly_fee_gbp) * 100),
        cpStart,
        cpEnd,
      },
      db,
    );
    if (!recorded.ok) {
      // Permanent failures are reported as received: retrying cannot change a
      // missing monthly amount, and cannot resolve a placement that already has a
      // live billing row for another subscription (23505 on migration 083's partial
      // unique index). Both are logged with the ids a human needs. Anything else is
      // transient and worth Stripe's retry.
      const permanent = ["monthly_amount_missing", "duplicate_live_billing"];
      if (recorded.error && permanent.includes(recorded.error)) {
        return NextResponse.json({ received: true, ignored: recorded.error });
      }
      return NextResponse.json({ error: "Billing record write failed" }, { status: 500 });
    }

    // Only on the first link. Stripe redelivers, and both
    // checkout.session.completed and checkout.session.async_payment_succeeded
    // reach this branch for the same session, so notifying unconditionally would
    // tell the artist their payments had started two or three times.
    if (recorded.newlyLinked) {
      await createNotification({
        userId: placement.artist_user_id,
        kind: "paid_loan_started",
        title: `Monthly loan payments started, £${Number(placement.monthly_fee_gbp).toFixed(2)}/mo`,
        body: "The venue's card is set up. Your first payout follows the first paid invoice.",
        idempotencyKey: `paid_loan_started:${placementId}`,
        // Owner find (2026-08-28): the flat list gave the artist nowhere to
        // SEE the payment; the detail page carries the payment status banner.
        link: `/placements/${encodeURIComponent(placementId)}`,
      }).catch(() => {});
    }

    return NextResponse.json({ received: true });
  }

  // K2: there was a `setup_intent.succeeded` branch here (E7d) whose entire job
  // was to re-invoke startPaidLoanBilling once a venue attached a card. That
  // creator is deleted, and nothing mints a paid-loan SetupIntent any more:
  // the surviving path is Stripe Checkout in subscription mode, which collects
  // the card as part of the session and lands on checkout.session.completed
  // below. A stray setup_intent event now falls through to the default
  // acknowledgement, which is correct — there is nothing to do with it.

  // ─── Art purchase checkout ───
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as Stripe.Checkout.Session;

    // Only process one-time payment checkouts (art purchases), not subscriptions
    // WS1.6: and only CART sessions. The earlier branches claim their kinds,
    // but ordering is not a contract; an unknown future kind must not be
    // booked as a cart.
    const sessionKind = session.metadata?.kind ?? session.metadata?.checkout_kind ?? "";
    const isCartKind = sessionKind === "" || sessionKind === "cart_checkout";
    if (session.mode === "payment" && isCartKind) {
      try {
        // Server-side cart row is the data-of-record (Plan B Task 6). The
        // 500-char metadata cap used to truncate big carts; cart_sessions
        // carries the full payload.
        const saved = await loadCartSession(session.id);
        if (!saved) {
          console.error("[webhook] cart_sessions miss for", session.id, "— refusing to process");
          return NextResponse.json(
            { error: "Cart session not found", sessionId: session.id },
            { status: 500 },
          );
        }
        // Stripe amount_total already includes shipping (added as line item in checkout)
        const total = (session.amount_total || 0) / 100;
        const cartItems = saved.cart as Array<{ price?: number; qty?: number; quantity?: number }>;
        const subtotal = cartItems.reduce((sum: number, i) => sum + (i.price || 0) * (Number(i.qty ?? i.quantity ?? 1)), 0) || total;
        const shippingCost = Math.max(0, total - subtotal);
        const orderId = orderIdFromSession("WS", session.id);
        const source = saved.source || session.metadata?.source || "direct";
        const venueSlug = saved.venueSlug || session.metadata?.venue_slug || "";
        const artistSlugs = (saved.artistSlugs || []).join(",") || session.metadata?.artist_slugs || "";
        // QA 2026-08-30 bug 20 (critical): when the cart session carried no
        // artistSlugs, this resolved to "" and the order was booked with a NULL
        // artist. Production holds one such row: GBP 64.49 charged, the print
        // never appeared on any artist's Orders queue, so nobody was ever told
        // to post it, artist_revenue was 0 and platform_fee_percent was 0, yet
        // it still counted toward admin GROSS SALES. The cart LINES knew whose
        // work it was the whole time (items[].artistName was populated), so
        // fall back to them before giving up.
        const firstArtistSlug =
          artistSlugs.split(",")[0] ||
          (cartItems as Array<{ artistSlug?: string }>).map((i) => i.artistSlug || "").find(Boolean) ||
          "";
        const savedShipping = saved.shipping as Record<string, string>;

        // Compute revenue splits
        let venueRevSharePct = 0;
        let venueRevenue = 0;
        let platformFeePct = DEFAULT_PLAN_FEE_PERCENT; // Default Core plan fee
        let platformFee = 0;
        let artistRevenue = 0;
        let placementId: string | null = null;
        let artistUserId: string | null = null;

        // The first artist is still recorded on the order row, which has a single
        // artist_slug / artist_user_id column, but it no longer decides the fee
        // rate or who gets paid. That is what the legs below are for (E9).
        if (firstArtistSlug) {
          // D4: .single() errors on 0 rows AND on >1 row, and the old code
          // discarded that error, so artist_user_id was silently left null and the
          // order booked with no attribution. .maybeSingle() plus an explicit check
          // refuses to book an order we cannot attribute; the 500 makes Stripe retry
          // (idempotent via D1's event dedup and D3's payment-intent check). The
          // select is user_id only: the fee and payouts come from the legs now (E9),
          // so this is purely the order row's attribution.
          const { data: ap, error: apErr } = await db
            .from("artist_profiles")
            .select("user_id")
            .eq("slug", firstArtistSlug)
            .maybeSingle();
          if (apErr) {
            console.error("[webhook] artist profile lookup failed", { firstArtistSlug, apErr });
            return NextResponse.json({ error: "Artist lookup failed" }, { status: 500 });
          }
          if (!ap) {
            console.error("[webhook] no artist_profiles row for slug", firstArtistSlug);
            return NextResponse.json({ error: "Unknown artist" }, { status: 500 });
          }
          artistUserId = ap.user_id;
        }

        // Per-line venue revenue share. Multi-artist carts can mix
        // placements at the same venue with different revenue_share_percent
        // values, so we look up every artist's placement at this venue in
        // one round-trip and apply each rate to its own line. Shipping is
        // exempt; only artwork value contributes to the venue cut.
        const lineArtistSlugs = (cartItems as Array<{ artistSlug?: string }>)
          .map((i) => i.artistSlug || "")
          .filter(Boolean);
        const uniqueLineSlugs = Array.from(new Set(lineArtistSlugs));
        const placementByArtistSlug = new Map<string, { id: string; revenue_share_percent: number }>();
        if (venueSlug && uniqueLineSlugs.length > 0) {
          // D9: a venue+artist can have several active placements (prod has real
          // duplicates, and the unique index that would prevent them is blocked on
          // that data). Without an explicit order the DB returns them arbitrarily
          // and whichever landed last in the map won, so the venue's share could
          // differ between two replays of the same event. Order by created_at and
          // keep the FIRST, so the rate is stable across redeliveries.
          const { data: rows } = await db.from("placements")
            .select("id, artist_slug, revenue_share_percent, created_at")
            .in("artist_slug", uniqueLineSlugs)
            .eq("venue_slug", venueSlug)
            .eq("status", "active")
            .order("created_at", { ascending: true });
          for (const row of (rows || []) as Array<{ id: string; artist_slug: string; revenue_share_percent: number | null }>) {
            if (placementByArtistSlug.has(row.artist_slug)) continue; // first-wins
            placementByArtistSlug.set(row.artist_slug, {
              id: row.id,
              revenue_share_percent: row.revenue_share_percent || 0,
            });
          }
          // D11: the sale is attributed to a venue (venueSlug set), but this
          // artist has no ACTIVE placement there, so the venue's cut silently
          // computes to 0 (pct defaults to 0 below). A placement in pending,
          // paused or completed lands here. Log it so a venue seeing a sale with
          // no revenue can be told why, instead of it being invisible.
          for (const slug of uniqueLineSlugs) {
            if (!placementByArtistSlug.has(slug)) {
              console.warn("[webhook] QR sale with no active placement", {
                orderId,
                venueSlug,
                artistSlug: slug,
              });
            }
          }
        }

        // Work-level placement resolution (owner-reported money bug,
        // 2026-08-28). placements has no work_id column; the link is
        // artist_works.current_placement_id. The work the buyer actually
        // bought decides the venue's rate; the artist-level first-wins map
        // above remains only as the fallback for legacy lines. Both maps
        // feed buildArtistLegs, which prefers the work-level rate per line.
        const placementByWorkId = new Map<string, { id: string; revenue_share_percent: number }>();
        const cartWorkIds = Array.from(new Set(
          (cartItems as Array<{ workId?: string }>).map((i) => i.workId || "").filter(Boolean),
        ));
        if (venueSlug && cartWorkIds.length > 0) {
          const { data: workRows } = await db.from("artist_works")
            .select("id, current_placement_id")
            .in("id", cartWorkIds);
          const placementIdByWork = new Map<string, string>();
          for (const w of (workRows || []) as Array<{ id: string; current_placement_id: string | null }>) {
            if (w.current_placement_id) placementIdByWork.set(w.id, w.current_placement_id);
          }
          const linkedIds = Array.from(new Set(placementIdByWork.values()));
          if (linkedIds.length > 0) {
            const { data: linked } = await db.from("placements")
              .select("id, revenue_share_percent, venue_slug, status")
              .in("id", linkedIds)
              .eq("venue_slug", venueSlug)
              .eq("status", "active");
            const byId = new Map(
              ((linked || []) as Array<{ id: string; revenue_share_percent: number | null }>).map(
                (pl) => [pl.id, pl],
              ),
            );
            for (const [workId, plId] of placementIdByWork) {
              const pl = byId.get(plId);
              if (!pl) continue;
              placementByWorkId.set(workId, {
                id: pl.id,
                revenue_share_percent: pl.revenue_share_percent || 0,
              });
              const artistLevel = placementByArtistSlug.get(
                (cartItems as Array<{ workId?: string; artistSlug?: string }>).find((i) => i.workId === workId)?.artistSlug || "",
              );
              if (artistLevel && artistLevel.id !== pl.id) {
                console.warn("[webhook] work-level placement overrides artist-level rate", {
                  orderId, workId, workPlacement: pl.id, artistPlacement: artistLevel.id,
                });
              }
            }
          }
        }

        if (venueSlug) {
          // Schema still records a single placement_id per order. Prefer the
          // first line's WORK-level placement, then the artist-level fallback;
          // both orderings are deterministic across replayed deliveries.
          for (const item of cartItems as Array<{ artistSlug?: string; workId?: string }>) {
            const place =
              (item.workId ? placementByWorkId.get(item.workId) : undefined) ||
              placementByArtistSlug.get(item.artistSlug || "");
            if (place) {
              placementId = place.id;
              break;
            }
          }
        }

        // E9: one payout leg per artist. Each leg carries that artist's own plan
        // fee rate, their own venue cut, and the postage for the parcel they will
        // actually post. Previously the fee came from the first artist's plan,
        // every artist's money was pooled into one `artistRevenue`, and one
        // transfer sent the whole pool to the first artist.
        //
        // Aggregated per artist, not per line: stripe_transfers is UNIQUE on
        // (order_id, recipient_user_id), so two legs for one artist would silently
        // become one and underpay them.
        const totalPence = Math.round(total * 100);
        const subtotalPence = Math.round(subtotal * 100);
        const legs = await buildArtistLegs(db, {
          cartItems: cartItems as CartLine[],
          placementByArtistSlug,
          placementByWorkId,
          artistShippingPence: saved.artistShippingPence || {},
          shippingTotalPence: totalPence - subtotalPence,
        });

        // Every figure on the order row is now the sum of the legs, so what is
        // reported and what is transferred cannot disagree.
        const venuePence = legs.reduce((s, l) => s + l.venueCutPence, 0);
        venueRevenue = penceToGbp(venuePence);
        // Blended effective rate against the subtotal, stored on the
        // order for dashboard / receipt display. Equals the single-rate
        // value when every line shares the same placement.
        venueRevSharePct = subtotal > 0
          ? Math.round((venueRevenue / subtotal) * 100 * 100) / 100
          : 0;

        // Shipping is not fee-bearing: it flows through to the artist, who pays
        // the courier out of pocket.
        const platformFeePence = reconcilePlatformFee({
          totalPence,
          venuePence,
          legs,
          intendedFeePence: legs.reduce((s, l) => s + l.platformFeePence, 0),
          orderId,
        });
        assertLegsReconcile({ totalPence, venuePence, platformFeePence, legs });
        platformFee = penceToGbp(platformFeePence);
        artistRevenue = penceToGbp(legs.reduce((s, l) => s + l.netPence, 0));
        // Blended rate, for the order row's single column. The per-leg rates are
        // what each artist is actually charged.
        platformFeePct = subtotal > 0
          ? Math.round((platformFee / subtotal) * 100 * 100) / 100
          : DEFAULT_PLAN_FEE_PERCENT;

        const paymentIntentId = typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id || "";

        // Rows 870-874 / PASS2-placement-lifecycle-log. A collection order used
        // to be booked `delivered` with `delivered_at` stamped at the moment of
        // payment, and its artist transfer settled to `paid` seven seconds
        // later with `payout_after` equal to its own creation time. The buyer
        // had only just paid; the piece was still on the wall. There was no
        // hold and no evidence anyone had collected anything.
        //
        // A collection order is now booked `confirmed` like any other, and the
        // BUYER confirms the handover. That is the rule the posted path already
        // follows, and the reason `delivered` is buyer-only in /api/orders: the
        // parties who get paid, the artist and (since row 727) the hosting
        // venue, must not attest to the delivery that releases their own money.
        // If the buyer never confirms, the 14-day payout cron pays out anyway,
        // exactly as it does for a posted order.
        //
        // The collection-shaped behaviour that remains lives downstream and
        // keys off `orders.fulfilment_method`, not off a flag computed here:
        // /api/orders reads it to allow the state machine's `collection` edge,
        // which lets `delivered` follow straight from `confirmed` with no
        // shipping leg in between.
        const fulfilmentMethod = (savedShipping as { fulfilmentMethod?: string })?.fulfilmentMethod || session.metadata?.fulfilment_method || "ship";
        const isVenueCollection = fulfilmentMethod === "collect_venue";
        const nowIso = new Date().toISOString();

        const orderRow: Record<string, unknown> = {
          id: orderId,
          stripe_payment_intent_id: paymentIntentId,
          buyer_email: session.customer_email || savedShipping?.email || "",
          // Set by /api/checkout when the buyer was signed in, blank for guest
          // checkout. Nothing wrote this column before, so every order was
          // reachable only by matching on the email address, which breaks the
          // moment somebody changes theirs.
          buyer_user_id: session.metadata?.buyer_user_id || null,
          items: cartItems,
          shipping: {
            fullName: savedShipping?.fullName || "",
            email: savedShipping?.email || "",
            phone: savedShipping?.phone || "",
            addressLine1: savedShipping?.addressLine1 || "",
            addressLine2: savedShipping?.addressLine2 || "",
            city: savedShipping?.city || "",
            postcode: savedShipping?.postcode || "",
            country: savedShipping?.country || "GB",
            notes: savedShipping?.notes || "",
          },
          subtotal,
          shipping_cost: shippingCost,
          total,
          status: "confirmed",
          // jsonb column — store the array raw (Plan B Task 13).
          status_history: [{ status: "confirmed", timestamp: nowIso }],
          source,
          // Still null means neither the session nor any cart line named an
          // artist. The order is booked anyway (the customer HAS paid, and
          // losing the record would be worse), but it is an orphan and an
          // admin alert fires below so a human assigns it the same day.
          artist_slug: firstArtistSlug || null,
          artist_user_id: artistUserId,
          venue_slug: venueSlug || null,
          venue_revenue_share_percent: venueRevSharePct,
          venue_revenue: venueRevenue,
          artist_revenue: artistRevenue,
          platform_fee_percent: platformFeePct,
          platform_fee: platformFee,
          placement_id: placementId,
          fulfilment_method: fulfilmentMethod,
          collection_notes: (savedShipping as { collectionNotes?: string })?.collectionNotes || null,
          // T9: the venue's collection point, resolved server-side at checkout
          // from the placement row and carried through the cart session.
          collection_address: isVenueCollection
            ? (savedShipping as { collectionAddress?: string })?.collectionAddress || null
            : null,
          // Stamped by /api/orders when the buyer confirms the handover. It is
          // what the statutory 14-day refund window measures from, so stamping
          // it at payment started the buyer's window before they had the piece.
          delivered_at: null,
          created_at: nowIso,
        };

        // F30, idempotency: skip if we've already processed this payment intent.
        if (paymentIntentId) {
          const { data: existingOrder } = await db
            .from("orders")
            .select("id")
            .eq("stripe_payment_intent_id", paymentIntentId)
            .maybeSingle();
          if (existingOrder) {
            console.log("Webhook duplicate suppressed for payment_intent:", paymentIntentId);
            // D52.3: a redelivery of an order that already exists still re-attempts
            // the payout legs, so any leg the first pass missed (a ledger insert
            // that threw, a 500 after the order landed) gets scheduled now.
            // Idempotent via scheduleTransfer's (order_id, recipient_user_id) 23505.
            await scheduleOrderLegs(db, { orderId, legs, venueSlug, venueRevenue });
            return NextResponse.json({ received: true, duplicate: true });
          }
        }

        // Try full insert. If the DB rejects an unknown column, strip
        // ONLY the columns the error mentions and retry. The previous
        // behaviour was to fall back to a minimal "base" row that
        // dropped every attribution column (artist_slug, artist_user_id,
        // venue_slug, placement_id, source, …) — orders saved fine but
        // were invisible to the artist's GET because nothing pointed
        // back to them. Pattern matches the placements POST retry.
        let { error } = await db.from("orders").insert(orderRow);
        if (error) {
          // 23505 on orders.id. D3: distinguish a genuine redelivery (same payment
          // intent) from an id collision between two different payments. The old
          // code returned duplicate unconditionally, which dropped the second
          // buyer's paid order on a collision. A collision now 500s so Stripe
          // retries loudly rather than us losing the order.
          if ((error as { code?: string }).code === "23505") {
            if ((await classifyOrderIdConflict(db, orderId, paymentIntentId || null)) === "duplicate") {
              console.log("Order already exists (same payment intent), treating webhook as processed");
              // D52.3: re-attempt the payout legs on a redelivery (idempotent).
              await scheduleOrderLegs(db, { orderId, legs, venueSlug, venueRevenue });
              return NextResponse.json({ received: true, duplicate: true });
            }
            console.error("[webhook] order id collision", { orderId, paymentIntentId });
            return NextResponse.json({ error: "Order id collision" }, { status: 500 });
          }
          // D6: the strip list used to include the money columns and
          // stripe_payment_intent_id. On schema drift the loop stripped them, the
          // order saved with the split silently missing, and the code then
          // scheduled transfers from in-memory values that were never persisted, so
          // reconciliation was impossible. Split the list: attribution columns may
          // be dropped to keep an order bookable, but money columns and the payment
          // intent may not.
          const strippableCols = [
            "source",
            "artist_slug",
            "artist_user_id",
            "venue_slug",
            "placement_id",
            "fulfilment_method",
            "collection_notes",
            // `delivered_at` was here, and it was the only entry on this list
            // that did not exist. So the ladder stripped it from EVERY insert,
            // and a collection order — handed over at the point of purchase, and
            // marked delivered immediately for exactly that reason — lost the
            // timestamp its refund window is measured from. Migration 110 adds
            // the column; keeping it strippable would put it straight back.
            "status_history",
          ];
          const REQUIRED_MONEY_COLS = [
            "venue_revenue_share_percent",
            "venue_revenue",
            "artist_revenue",
            "platform_fee_percent",
            "platform_fee",
            "stripe_payment_intent_id",
          ] as const;
          // If the DB does not know a money column, this is a schema emergency and
          // we must not book the order with the split missing. Fail loud; Stripe
          // retries (idempotent via D1 + D3).
          // `error` is non-null in this block, but the await in the 23505 branch
          // above resets TS's narrowing on a `let`, so capture it.
          const insertError = error;
          if (
            REQUIRED_MONEY_COLS.some((c) =>
              new RegExp(`\\b${c}\\b`).test(String(insertError.message).toLowerCase()),
            )
          ) {
            console.error("[webhook] schema is missing a money column, refusing to book", insertError);
            return NextResponse.json({ error: "Schema drift on money columns" }, { status: 500 });
          }
          const stripped = new Set<string>();
          const safeRow: Record<string, unknown> = { ...orderRow };
          // PostgrestError | null, the loop nulls it on success to break out.
          // Without the explicit union TS infers PostgrestError (the type of
          // the initial value) and the `lastError = null` assignment errors.
          let lastError: typeof error | null = error;
          while (lastError) {
            const msg = String(lastError.message || "").toLowerCase();
            const newStrip = strippableCols.filter(
              (c) => !stripped.has(c) && new RegExp(`\\b${c}\\b`).test(msg),
            );
            if (newStrip.length === 0) break;
            newStrip.forEach((c) => {
              stripped.add(c);
              delete safeRow[c];
            });
            console.warn(
              `Order insert missing columns [${Array.from(stripped).join(", ")}], retrying:`,
              lastError.message,
            );
            const retry = await db.from("orders").insert(safeRow);
            if (!retry.error) {
              lastError = null;
              break;
            }
            if ((retry.error as { code?: string }).code === "23505") {
              // Same collision check as the first insert (D3).
              if ((await classifyOrderIdConflict(db, orderId, paymentIntentId || null)) === "duplicate") {
                return NextResponse.json({ received: true, duplicate: true });
              }
              console.error("[webhook] order id collision (on retry)", { orderId, paymentIntentId });
              return NextResponse.json({ error: "Order id collision" }, { status: 500 });
            }
            // D6: a retry that now surfaces a money column is the same schema
            // emergency as the first insert. Never strip it; fail loud.
            if (
              REQUIRED_MONEY_COLS.some((c) =>
                new RegExp(`\\b${c}\\b`).test(String(retry.error.message).toLowerCase()),
              )
            ) {
              console.error("[webhook] schema is missing a money column on retry, refusing to book", retry.error);
              return NextResponse.json({ error: "Schema drift on money columns" }, { status: 500 });
            }
            lastError = retry.error;
          }
          error = lastError;
        }

        if (error) {
          // F31, return non-200 so Stripe retries instead of silently dropping.
          console.error("Supabase order save error:", error);
          return NextResponse.json({ error: "DB save failed" }, { status: 500 });
        } else {
          // Decrement per-work quantity (D5). The old code was read-then-write:
          // SELECT quantity_available, compute max(0, current - qty), UPDATE. Two
          // concurrent orders for the last piece both read 1 and both wrote 0, so
          // both buyers got it. decrement_work_stock does it in one UPDATE, which
          // Postgres serialises, so the race is closed.
          //
          // Still best-effort, and deliberately NOT fatal, contra the plan. This
          // runs AFTER the order insert, and the buyer's receipt is sent a few
          // lines below. A 500 here would skip the receipt on the first delivery,
          // and Stripe's retry would then hit the order's 23505, be classified a
          // duplicate (D3), and return early, so the decrement AND the emails would
          // be lost for good. True fatality needs the decrement inside the same
          // transaction as the order insert, which is a larger change than D5. A
          // failed decrement here oversells by at most the failed line, and the
          // race, which is the actual finding, is now closed.
          type CartItem = { workId?: string; id?: string; qty?: number; quantity?: number };
          for (const item of cartItems as CartItem[]) {
            const workId = item.workId || item.id;
            const qty = Number(item.qty ?? item.quantity ?? 1);
            if (!workId || !Number.isFinite(qty) || qty <= 0) continue;
            const { error: stockErr } = await db.rpc("decrement_work_stock", {
              p_work_id: workId,
              p_qty: qty,
            });
            if (stockErr) {
              console.error("[webhook] stock decrement failed", { workId, qty, stockErr });
            }
          }

          // Notification payload comes from the saved cart row; images
          // are inline on each item now (no parallel array, no truncation).
          const cartItemsForNotify = cartItems as Array<{ title?: string; image?: string }>;
          const firstItemTitle = cartItemsForNotify[0]?.title || "Artwork";

          // Resolve artist display names by slug in one round-trip.
          // Without this, item.artistName fell back to the slug
          // ("maya-chen") and the email showed an ID instead of a name.
          const slugMap = await resolveArtistNamesBulk(
            db,
            (cartItemsForNotify as Array<{ artistSlug?: string }>).map((i) => i.artistSlug),
          );

          // Build the display-ready lines, then hand everything to the shared
          // confirmations module. The mapping and the write-back stay here:
          // they need the cart row and the slug map, and on an offer order
          // items carries the offer_id linkage that must not be overwritten.
          const buyerEmail = session.customer_email || savedShipping?.email;
          let orderItems: OrderEmailItem[] = [];
          if (buyerEmail) {
            // Adapt the cart items shape to the OrderSummary component.
            orderItems = (cartItemsForNotify as Array<{
              title?: string; artistName?: string; artistSlug?: string; qty?: number; quantity?: number; size?: string; image?: string; price?: number; workId?: string; id?: string;
            }>).map((item) => {
              const slug = item.artistSlug || firstArtistSlug || "";
              const resolved = slugMap.get(slug);
              const fallbackName = item.artistName && !/^[a-z0-9-]+$/.test(item.artistName) ? item.artistName : null;
              return {
                title: item.title || "Artwork",
                // Owner-reported 2026-08-30: the last fallback printed the raw
                // slug in the buyer's receipt. The line above already refuses a
                // slug-shaped artistName, so falling through to one here was
                // the same leak by another route.
                artistName:
                  resolved ||
                  fallbackName ||
                  slug.split("-").filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") ||
                  "Artist",
                quantity: Number(item.qty ?? item.quantity ?? 1),
                size: item.size,
                image: item.image || `${SITE}/placeholder-work.jpg`,
                lineTotal: {
                  amount: Math.round((item.price ?? 0) * Number(item.qty ?? item.quantity ?? 1) * 100),
                  currency: "GBP" as const,
                },
                // Carry the work id onto the persisted order so a full refund can
                // restock it (D17). The enriched update below overwrites the raw
                // cart items (which had it), so without this the id is lost.
                workId: item.workId || item.id,
              };
            });

            // Persist the enriched items (with display names + images) on
            // the orders row so subsequent shipping/delivery emails can
            // read them deterministically without re-running the lookup.
            // Best-effort, failure here is non-fatal; the receipt email
            // already has what it needs in scope.
            try {
              await db.from("orders").update({ items: orderItems }).eq("id", orderId);
            } catch (persistErr) {
              console.warn("[webhook] persisting enriched items failed:", persistErr);
            }
          }

          // Bug 20: an order nobody can fulfil must not sit silent. The buyer
          // has been charged, so this alerts rather than throwing; keyed on the
          // order so a Stripe redelivery cannot spam.
          if (!firstArtistSlug) {
            try {
              const { sendAdminAlert } = await import("@/lib/email/admin-alert");
              await sendAdminAlert({
                idempotencyKey: `orphan_order:${orderId}`,
                subject: `Order ${orderId} has no artist attached`,
                summary:
                  `Order ${orderId} was paid but neither the cart session nor any cart line named an ` +
                  `artist, so it appears on no artist's Orders queue and nobody has been told to post ` +
                  `it. Assign the artist by hand, then check how long the customer has been waiting.`,
                fields: [
                  { label: "Order", value: String(orderId) },
                  { label: "Buyer", value: String(buyerEmail || "unknown") },
                ],
                metadata: { orderId },
              });
            } catch (orphanErr) {
              console.error("[webhook] orphan-order alert failed:", orphanErr);
            }
          }

          await sendOrderConfirmations(db, {
            orderId,
            paymentIntentId,
            buyerEmail: buyerEmail || null,
            buyerName: savedShipping?.fullName || "",
            items: orderItems,
            subtotal,
            shippingCost,
            total,
            address: {
              line1: savedShipping?.addressLine1 || "",
              line2: savedShipping?.addressLine2 || undefined,
              city: savedShipping?.city || "",
              postcode: savedShipping?.postcode || "",
              country: savedShipping?.country || "GB",
            },
            artistUserId: artistUserId || null,
            artistRevenue,
            firstItemTitle,
            stripeSessionId: session.id,
            venue: venueSlug && venueRevenue > 0
              ? { slug: venueSlug, revenue: venueRevenue, artistSlug: firstArtistSlug }
              : null,
          });

          // ─── T9 (8.6): tell the venue someone is coming ───
          // A collect-from-venue sale makes the venue a physical party: a
          // stranger will present an order number at the counter. A sale they
          // are not told about is a confrontation waiting there. Email keyed on
          // the order so a Stripe redelivery cannot double it, plus a bell.
          if (isVenueCollection) {
            // Owner decision 2026-08-28: the wall piece just sold, so the
            // work stops being collectable. ONLY the tick box is cleared;
            // online availability and stock follow the normal decrement, so
            // prints keep selling unless this was the last piece.
            // 121: the wall piece just sold, so its placement's off-the-wall
            // offer comes down with it; the legacy work-level tick box (120)
            // is cleared too. Online stock follows the normal decrement, so
            // prints keep selling unless this was the last piece. Both are
            // non-critical bookkeeping: a failure must not stop the venue
            // being told someone is coming to collect.
            const soldPlacementIds = Array.from(new Set(
              (cartItems as Array<{ collectPlacementId?: string }>)
                .map((i) => i.collectPlacementId || "")
                .filter(Boolean),
            ));
            if (soldPlacementIds.length > 0) {
              try {
                const { error: offErr } = await db
                  .from("placements")
                  .update({ in_store_price: null, in_store_frame_included: false })
                  .in("id", soldPlacementIds);
                if (offErr) console.warn("[webhook] could not clear off-the-wall offer:", offErr);
              } catch (offErr) {
                console.warn("[webhook] off-the-wall offer clear threw:", offErr);
              }
            }
            // WS3.3 (audit: off-wall sale kept billing). The piece is sold, so
            // the placement ends NOW: status → sold, and any paid-loan billing
            // is cancelled so the venue does not pay next month's display fee
            // for a piece that has left the arrangement. Direct writes rather
            // than the placements PATCH on purpose: that route's
            // active→terminal inventory block RESTORES stock, which is built
            // for unsold returns; this piece is sold and the sale itself
            // already decremented. The "Placed at X" portfolio stamp clears
            // for the same reason. Idempotent: a redelivery sees status=sold
            // and skips.
            if (soldPlacementIds.length > 0) {
              try {
                const { cancelPaidLoanBilling } = await import("@/lib/placements/paid-loan-billing");
                const { data: soldRows } = await db
                  .from("placements")
                  .select("id, status")
                  .in("id", soldPlacementIds);
                for (const pl of (soldRows || []) as Array<{ id: string; status: string }>) {
                  if (pl.status === "sold") continue;
                  const { error: soldErr } = await db
                    .from("placements")
                    .update({ status: "sold" })
                    .eq("id", pl.id);
                  if (soldErr) {
                    console.error("[webhook] could not mark placement sold:", soldErr);
                    continue;
                  }
                  try {
                    await cancelPaidLoanBilling(pl.id, db);
                  } catch (cancelErr) {
                    console.error("[webhook] paid-loan cancel after off-wall sale failed:", cancelErr);
                  }
                  try {
                    await db
                      .from("artist_works")
                      .update({ placed_at_venue: null, current_placement_id: null })
                      .eq("current_placement_id", pl.id);
                  } catch (stampErr) {
                    console.warn("[webhook] placement stamp clear failed:", stampErr);
                  }
                }
              } catch (windDownErr) {
                console.error("[webhook] off-wall placement wind-down failed:", windDownErr);
              }
            }
            if (cartWorkIds.length > 0) {
              try {
                const { error: flagErr } = await db
                  .from("artist_works")
                  .update({ available_in_store: false })
                  .in("id", cartWorkIds);
                if (flagErr) console.warn("[webhook] could not clear available_in_store:", flagErr);
              } catch (flagErr) {
                console.warn("[webhook] available_in_store clear threw:", flagErr);
              }
            }
            try {
              // Owner ruling (2026-08-28): the venue's revenue SHARE needs a QR
              // scan within 24 hours (the attribution token's TTL), but the
              // NOTICE does not - someone is walking in to collect whatever the
              // buyer's journey was. When attribution is absent, resolve the
              // venue from the sold placement instead.
              let noticeVenueSlug = venueSlug;
              if (!noticeVenueSlug && soldPlacementIds.length > 0) {
                const { data: soldPl } = await db
                  .from("placements")
                  .select("venue_slug")
                  .in("id", soldPlacementIds)
                  .limit(1);
                noticeVenueSlug = (soldPl?.[0] as { venue_slug?: string } | undefined)?.venue_slug || "";
              }
              if (!noticeVenueSlug) throw new Error("no venue resolvable for collection notice");
              const { data: venueRow } = await db
                .from("venue_profiles")
                .select("user_id, name")
                .eq("slug", noticeVenueSlug)
                .maybeSingle<{ user_id: string | null; name: string | null }>();
              if (venueRow?.user_id) {
                const { data: { user: venueUser } } = await db.auth.admin.getUserById(venueRow.user_id);
                const firstWork = cartItemsForNotify[0]?.title || "Artwork";
                const artistDisplay =
                  slugMap.get(firstArtistSlug) || firstArtistSlug || "the artist";
                createNotification({
                  userId: venueRow.user_id,
                  kind: "collection_pending",
                  title: `Sold off your wall: ${firstWork}`,
                  body: `${savedShipping?.fullName || "The buyer"} will collect it with order ${orderId}`,
                  // F10: one sold placement deep-links straight to it; the
                  // sendEmail below can throw, so the bell is keyed (F6b).
                  link: soldPlacementIds.length === 1
                    ? `/placements/${soldPlacementIds[0]}`
                    : "/venue-portal/placements",
                  idempotencyKey: `collection_pending:${orderId}`,
                }).catch((err) => console.warn("[webhook] collection bell failed:", err));
                if (venueUser?.email) {
                  await sendEmail({
                    idempotencyKey: `venue_collection_pending:${orderId}`,
                    template: "venue_collection_pending",
                    category: "orders_and_payouts",
                    to: venueUser.email,
                    userId: venueRow.user_id,
                    subject: `${firstWork} has sold and will be collected from you`,
                    react: VenueCollectionPending({
                      venueName: venueRow.name || "there",
                      workTitle: firstWork,
                      artistName: artistDisplay,
                      orderNumber: orderId,
                      buyerName: (savedShipping?.fullName || "The buyer").split(" ")[0],
                      placementsUrl: `${SITE}/venue-portal/placements`,
                      supportUrl: `${SITE}/support`,
                    }),
                    metadata: { orderId, venueSlug: noticeVenueSlug },
                  });
                }
              }
            } catch (err) {
              console.error("[webhook] venue collection notice failed:", err);
            }
          }

          // ─── Stripe Connect transfers ───
          // Extracted into scheduleOrderLegs so the D3 duplicate-redelivery paths
          // can re-run it and schedule any legs the first pass missed (C4/D52.3);
          // scheduleTransfer's (order_id, recipient_user_id) 23505 idempotency
          // makes already-scheduled legs no-ops, so a redelivery only fills gaps.
          await scheduleOrderLegs(db, { orderId, legs, venueSlug, venueRevenue });
        }
      } catch (err) {
        // WS1.1 (audit F1, verified): this catch used to swallow the throw and
        // fall through to the default 200, which KEPT the dedup claim. Money
        // taken, no order booked, Stripe never retries, invisible to the
        // sweep. A 500 releases the claim (see the POST wrapper) so the
        // redelivery gets another run; every write in this branch is
        // idempotent, so a partial first pass is completed, not doubled.
        console.error("Order processing error:", err);
        return NextResponse.json({ error: "Order processing failed" }, { status: 500 });
      }
    }
  }

  // ─── WS1.5 second half: a deferred payment FAILED after checkout ───
  // Bank-debit style methods complete checkout before the money moves. The
  // settlement gate correctly booked nothing, but the buyer walked away
  // believing they bought art. Nothing was charged and no order exists;
  // cart_sessions rows simply expire, so the only repair owed is the truth,
  // to the buyer, once per session.
  if (event.type === "checkout.session.async_payment_failed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const sessionKind = session.metadata?.kind || "";
    if (sessionKind === "" || sessionKind === "cart_checkout") {
      const buyerEmail = session.customer_details?.email || session.customer_email || "";
      if (buyerEmail) {
        try {
          await sendEmail({
            idempotencyKey: `async_payment_failed:${session.id}`,
            template: "customer_payment_failed",
            category: "orders_and_payouts",
            to: buyerEmail,
            subject: "Your Wallplace payment did not go through",
            react: CustomerPaymentFailed({
              firstName: (session.customer_details?.name || "there").split(" ")[0],
              browseUrl: `${SITE}/browse`,
              supportUrl: `${SITE}/support`,
            }),
            metadata: { stripeSessionId: session.id },
          });
        } catch (mailErr) {
          console.error("[webhook] async-payment-failed email failed:", mailErr);
        }
      }
    }
  }

  // ─── Subscription events ───
  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
    const subscription = event.data.object as Stripe.Subscription;

    // D15: this branch writes artist_profiles by stripe_customer_id, so it must
    // only handle the platform SaaS subscription. A paid-loan or managed-curation
    // subscription is owned by its own handler; today it is a near-miss (those
    // flows create fresh customers rather than reusing an artist's customer id),
    // but it is one refactor away from stamping a plan onto the wrong profile.
    // Scope it explicitly. (D12's unknown-price guard also catches paid-loan's
    // dynamic price, but a curation tier priced via a STRIPE_PRICE_* would slip
    // past that; the kind check does not depend on the price.)
    const subKind = subscription.metadata?.kind || subscription.metadata?.source || "";
    if (
      subKind === "paid_loan_monthly" ||
      subKind === "wallplace_paid_loan_billing" ||
      subKind === "curation_request"
    ) {
      return NextResponse.json({ received: true, ignored: "not_saas_subscription" });
    }

    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
    const priceId = subscription.items.data[0]?.price?.id || "";

    // D12: map the price id to a plan, and NEVER guess. The old code defaulted to
    // "core" and only bumped to premium/pro on a match, so an unset or mistyped
    // STRIPE_PRICE_PRO wrote every Pro artist as core, and
    // platformFeePercentForArtist then charged them 15% instead of 5% on every
    // sale, silently and forever. An unrecognised price now stamps nothing.
    //
    // Built per-request (not module scope) so a test can set the envs before
    // importing. Monthly and annual variants normalise to the same plan.
    const PRICE_TO_PLAN: Record<string, "core" | "premium" | "pro"> = Object.fromEntries(
      (
        [
          [process.env.STRIPE_PRICE_CORE, "core"],
          [process.env.STRIPE_PRICE_CORE_ANNUAL, "core"],
          [process.env.STRIPE_PRICE_PREMIUM, "premium"],
          [process.env.STRIPE_PRICE_PREMIUM_ANNUAL, "premium"],
          [process.env.STRIPE_PRICE_PRO, "pro"],
          [process.env.STRIPE_PRICE_PRO_ANNUAL, "pro"],
        ] as const
      ).filter(([id]) => !!id) as Array<[string, "core" | "premium" | "pro"]>,
    );
    const plan = PRICE_TO_PLAN[priceId];
    if (!plan) {
      // Not a recognised SaaS price: a paid-loan or curation subscription (whose
      // price is a dynamic price_data, handled by their own branches), or a
      // misconfigured env. Either way we must not stamp a plan we did not
      // recognise onto an artist profile.
      console.error("[webhook] unrecognised subscription price id", {
        priceId,
        subscriptionId: subscription.id,
        // D12: if any price env is unset, that is the likely cause of an
        // otherwise-valid SaaS price not resolving.
        missingPriceEnvs: missingStripePriceEnvs(),
      });
      return NextResponse.json({ received: true, ignored: "unknown_price" });
    }

    const { error } = await db
      .from("artist_profiles")
      .update({
        stripe_subscription_id: subscription.id,
        subscription_status: subscription.status === "trialing" ? "trialing" : subscription.status,
        subscription_plan: plan,
        // E11b: `?? 0` stamped 1970-01-01 whenever Stripe omitted the period,
        // and the billing page then showed a subscription that expired 56 years
        // ago. null is the honest value for "we do not know yet".
        subscription_period_end: epochToIso(periodFromSubscription(subscription).cpEnd),
        trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
      })
      .eq("stripe_customer_id", customerId);

    // If this was an upgrade, cancel the previous subscription now that the new one is active
    if (event.type === "customer.subscription.created") {
      const cancelPrevious = subscription.metadata?.cancel_previous;
      if (cancelPrevious && cancelPrevious !== subscription.id) {
        try {
          await stripe.subscriptions.cancel(cancelPrevious, { prorate: true });
        } catch (cancelErr) {
          console.error("Cancel previous subscription error:", cancelErr);
        }
      }
    }

    if (error) console.error("Subscription update error:", error);

    // ─── Started email (09 §D.5, item 3.3) ───
    // The first paid moment produced no email at all. Six `subscription_*`
    // templates were registered and five were wired; there was no "started", so
    // an artist began paying and got nothing in writing. The comment on the
    // invoice.paid branch below claimed the signup invoice was "covered by
    // subscription_created or the checkout receipt". Neither existed. That
    // comment is accurate as of this branch.
    if (event.type === "customer.subscription.created") {
      try {
        const { data: profile } = await db
          .from("artist_profiles")
          .select("user_id, name")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();
        if (profile?.user_id) {
          const { data: { user } } = await db.auth.admin.getUserById(profile.user_id);
          const item = subscription.items.data[0];
          if (user?.email) {
            const { cpStart, cpEnd } = periodFromSubscription(subscription);
            const planName = plan.charAt(0).toUpperCase() + plan.slice(1);
            await sendEmail({
              // Keyed on the subscription, so Stripe redelivering
              // customer.subscription.created cannot send a second copy.
              idempotencyKey: `subscription_started:${subscription.id}`,
              template: "subscription_started",
              category: "orders_and_payouts",
              to: user.email,
              userId: profile.user_id,
              subject: `You're on Wallplace ${planName}`,
              react: SubscriptionStarted({
                firstName: (profile.name || "there").split(" ")[0] || "there",
                planName,
                amount: {
                  amount: item?.price?.unit_amount ?? 0,
                  currency: (item?.price?.currency || "gbp").toUpperCase() as "GBP" | "USD" | "EUR",
                },
                billingInterval: item?.price?.recurring?.interval === "year" ? "year" : "month",
                // On a trial the first charge is when the trial ends, not when
                // the period started, or the email tells someone they were
                // billed today on a plan they have not paid for yet.
                firstBillingDate: epochToUkDate(subscription.trial_end ?? cpStart),
                nextBillingDate: epochToUkDate(cpEnd),
                trialEndsAt: subscription.trial_end
                  ? epochToUkDate(subscription.trial_end)
                  : undefined,
                manageUrl: `${SITE}/artist-portal/billing`,
              }),
              metadata: { subscriptionId: subscription.id, plan },
            });
          }
        }
      } catch (err) {
        // Non-fatal. The subscription is recorded; a mail failure must not make
        // Stripe retry a webhook that already did its real work.
        console.error("Started email error:", err);
      }
    }

    // ─── Upgraded email (plan changed) ───
    // Stripe's `customer.subscription.updated` fires for a lot of reasons
    // (renewal, status tick, cancel-at-period-end, plan change). We only
    // want to email on a real plan change, so compare previous plan in DB.
    if (event.type === "customer.subscription.updated") {
      try {
        const { data: profile } = await db
          .from("artist_profiles")
          .select("user_id, name, subscription_plan")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();
        if (profile && profile.user_id && profile.subscription_plan && profile.subscription_plan !== plan) {
          const { data: { user } } = await db.auth.admin.getUserById(profile.user_id);
          if (user?.email) {
            await sendEmail({
              idempotencyKey: `subscription_upgraded:${subscription.id}:${plan}`,
              template: "subscription_upgraded",
              category: "orders_and_payouts",
              to: user.email,
              subject: `You're now on ${plan.charAt(0).toUpperCase() + plan.slice(1)}`,
              userId: profile.user_id,
              react: SubscriptionUpgraded({
                firstName: (profile.name || "there").split(" ")[0],
                oldPlan: (profile.subscription_plan as string).charAt(0).toUpperCase() + (profile.subscription_plan as string).slice(1),
                newPlan: plan.charAt(0).toUpperCase() + plan.slice(1),
                // E11b: the same epoch bug in customer-facing copy. The upgrade
                // email quoted "1 January 1970" as the next billing date.
                billingDate: epochToUkDate(periodFromSubscription(subscription).cpEnd),
                accountUrl: `${SITE}/artist-portal/billing`,
              }),
              metadata: { subscriptionId: subscription.id, oldPlan: profile.subscription_plan, newPlan: plan },
            });
          }
        }
      } catch (err) {
        console.error("Upgraded email error:", err);
      }
    }

    // ─── Referral credit (item 25) ───
    // First time this referred artist enters a paid status, extend the
    // referrer's fee-free window by 30 days.
    //
    // BOTH halves of this were broken until 2026-08-28, and each fix is its own
    // migration: 109 made `referred_by_code` recordable at all (a
    // strip-and-retry destroyed it on every application), and 115 (owner
    // decision 10) created `free_until` — the column this credit writes — which
    // had never existed, so the select was rejected whole and the credit was
    // skipped for as long as the programme has been live.
    //
    // The credit itself is `extend_free_until` now (04 item 5.3 / D14): the old
    // read-modify-write across two rows meant a Stripe redelivery could double
    // a 30-day credit or stamp the guard without crediting. The RPC claims
    // `referral_credited_at` first (the idempotency guard), extends from
    // GREATEST(now, free_until) so stacked credits chain, and refuses with an
    // exception on a dangling code rather than burning the one credit.
    const isPaidStatus = subscription.status === "active" || subscription.status === "trialing";
    if (isPaidStatus && event.type === "customer.subscription.created") {
      try {
        const { data: referred } = await db
          .from("artist_profiles")
          .select("id, name")
          .eq("stripe_customer_id", customerId)
          .maybeSingle<{ id: string; name: string | null }>();
        if (referred) {
          const { data: credit, error: creditErr } = await db.rpc("extend_free_until", {
            p_referred_id: referred.id,
            p_days: 30,
          });
          if (creditErr) {
            console.error("Referral credit error:", creditErr.message);
          } else {
            const row = Array.isArray(credit) ? credit[0] : credit;
            if (row?.credited) {
              console.log("[webhook] referral credited", {
                referredId: referred.id,
                referrerId: row.referrer_id,
                freeUntil: row.new_free_until,
              });
              // WS3.5 (audit R7 row 14): the credit is a real money event
              // (the referrer's fee drops to 0% until free_until) and was
              // recorded with this console.log alone. Tell the referrer.
              // Keyed on the referred artist: the RPC's guard means each
              // referred artist credits exactly once, ever.
              try {
                const { data: referrer } = await db
                  .from("artist_profiles")
                  .select("user_id, name")
                  .eq("id", row.referrer_id)
                  .maybeSingle<{ user_id: string | null; name: string | null }>();
                if (referrer?.user_id) {
                  const freeUntilDate = row.new_free_until
                    ? new Date(row.new_free_until).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })
                    : "";
                  createNotification({
                    userId: referrer.user_id,
                    kind: "referral_credited",
                    title: "You earned 30 fee-free days",
                    body: `${referred.name || "An artist you referred"} started a paid plan. Your platform fee is 0% until ${freeUntilDate}.`,
                    link: "/artist-portal/billing",
                    idempotencyKey: `referral_credited:${referred.id}`,
                  }).catch((err) => console.warn("[webhook] referral bell failed:", err));
                  const { data: { user: referrerUser } } = await db.auth.admin.getUserById(referrer.user_id);
                  if (referrerUser?.email) {
                    await sendEmail({
                      idempotencyKey: `referral_credit:${referred.id}`,
                      template: "referral_credit_granted",
                      category: "orders_and_payouts",
                      to: referrerUser.email,
                      userId: referrer.user_id,
                      subject: "You earned 30 fee-free days on Wallplace",
                      react: ReferralCreditGranted({
                        firstName: (referrer.name || "there").split(" ")[0],
                        referredArtistName: referred.name || "An artist you referred",
                        freeUntilDate,
                        billingUrl: `${SITE}/artist-portal/billing`,
                        supportUrl: `${SITE}/support`,
                      }),
                      metadata: { referredId: referred.id, referrerId: row.referrer_id },
                    });
                  }
                }
              } catch (referralNotifyErr) {
                console.error("[webhook] referral grant comms failed:", referralNotifyErr);
              }
            }
          }
        }
      } catch (referralErr) {
        // Non-fatal, Stripe subscription is already recorded.
        console.error("Referral credit error:", referralErr);
      }
    }
  }

  // ─── Trial ending soon ───
  // Stripe fires `customer.subscription.trial_will_end` 3 days before trial
  // end. The template is also fired on invoice.upcoming if the customer
  // has 1 day left, we rely on Stripe's single event and make one send.
  if (event.type === "customer.subscription.trial_will_end") {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
    const priceId = subscription.items.data[0]?.price?.id || "";
    let planLabel = "Premium";
    if (priceId === process.env.STRIPE_PRICE_PRO || priceId === process.env.STRIPE_PRICE_PRO_ANNUAL) planLabel = "Pro";
    else if (priceId === process.env.STRIPE_PRICE_CORE || priceId === process.env.STRIPE_PRICE_CORE_ANNUAL) planLabel = "Core";

    try {
      const { data: profile } = await db
        .from("artist_profiles")
        .select("user_id, name")
        .eq("stripe_customer_id", customerId)
        .maybeSingle();
      if (profile?.user_id) {
        const { data: { user } } = await db.auth.admin.getUserById(profile.user_id);
        if (user?.email) {
          const trialEndDate = subscription.trial_end
            ? new Date(subscription.trial_end * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
            : "soon";
          await sendEmail({
            idempotencyKey: `trial_ending:${subscription.id}`,
            template: "subscription_trial_ending",
            category: "promotions",
            to: user.email,
            subject: `Your ${planLabel} trial ends ${trialEndDate}`,
            userId: profile.user_id,
            react: SubscriptionTrialEnding({
              firstName: (profile.name || "there").split(" ")[0],
              planName: planLabel,
              trialEndDate,
              upgradeUrl: `${SITE}/artist-portal/billing`,
              benefits: [
                `Up to ${WORKS_CAP[planLabel.toLowerCase()] ?? WORKS_CAP.core} works in your portfolio`,
                "Priority matching with venues",
                "Advanced QR analytics",
              ],
            }),
            metadata: { subscriptionId: subscription.id },
          });
        }
      }
    } catch (err) {
      console.error("Trial-ending email error:", err);
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

    // Upgrade-race guard. When an artist upgrades from one plan to
    // another, /api/subscribe stores the previous subscription id in
    // metadata so the webhook handler can cancel it once the NEW
    // subscription's `customer.subscription.created` lands and the
    // profile has flipped to `active` on the new plan. Stripe then
    // fires a `customer.subscription.deleted` for the OLD subscription
    // shortly after. Without this guard, the handler would blindly
    // overwrite `subscription_status` to `canceled` for the customer,
    // wiping out the just-set active state, and the billing page
    // would render "Your subscription has been canceled" right after
    // a successful upgrade. The fix: only touch the profile if the
    // deleted subscription is still the profile's current one.
    const { data: profile } = await db
      .from("artist_profiles")
      .select("user_id, name, subscription_plan, stripe_subscription_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle<{
        user_id: string | null;
        name: string | null;
        subscription_plan: string | null;
        stripe_subscription_id: string | null;
      }>();

    const isStale = profile && profile.stripe_subscription_id && profile.stripe_subscription_id !== subscription.id;
    // D13: this used to `return` on isStale, which exited the WHOLE handler and so
    // skipped the paid-loan `customer.subscription.deleted` block further down. An
    // artist upgrading their plan (a stale SaaS deletion) could therefore leave a
    // paid-loan billing row stuck `active` after Stripe cancelled it. Guard only the
    // SaaS-specific work; execution falls through to the paid-loan block. isStale
    // means the old subscription is being cancelled as part of an upgrade, the newer
    // one is already recorded, so we touch neither the profile nor the email.
    if (!isStale) {
    const { error } = await db
      .from("artist_profiles")
      .update({ subscription_status: "canceled" })
      .eq("stripe_customer_id", customerId);

    if (error) console.error("Subscription delete error:", error);

    // Cancellation confirmation email.
    try {
      if (profile?.user_id) {
        const { data: { user } } = await db.auth.admin.getUserById(profile.user_id);
        if (user?.email) {
          const accessEndsAt = subscription.cancel_at
            ? new Date(subscription.cancel_at * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
            : "the end of this billing period";
          const planLabel = ((profile.subscription_plan as string) || "plan").charAt(0).toUpperCase() + ((profile.subscription_plan as string) || "plan").slice(1);
          await sendEmail({
            idempotencyKey: `subscription_cancelled:${subscription.id}`,
            template: "subscription_cancelled",
            category: "orders_and_payouts",
            to: user.email,
            subject: `Your ${planLabel} subscription is cancelled`,
            userId: profile.user_id,
            react: SubscriptionCancelled({
              firstName: (profile.name || "there").split(" ")[0],
              planName: planLabel,
              accessEndsAt,
              reactivateUrl: `${SITE}/artist-portal/billing`,
              supportUrl: `${SITE}/support`,
            }),
            metadata: { subscriptionId: subscription.id },
          });
        }
      }
    } catch (err) {
      console.error("Cancelled email error:", err);
    }
    } // end if (!isStale) — D13
  }

  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = typeof invoice.customer === "string" ? invoice.customer : (invoice.customer as Stripe.Customer)?.id;

    if (customerId) {
      const { error } = await db
        .from("artist_profiles")
        .update({ subscription_status: "past_due" })
        .eq("stripe_customer_id", customerId);

      if (error) console.error("Payment failed update error:", error);

      // Dunning email, keyed on attempt so each retry sends one reminder.
      try {
        const { data: profile } = await db
          .from("artist_profiles")
          .select("user_id, name, subscription_plan")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();
        if (profile?.user_id) {
          const { data: { user } } = await db.auth.admin.getUserById(profile.user_id);
          if (user?.email) {
            const amountDue = { amount: invoice.amount_due, currency: (invoice.currency || "gbp").toUpperCase() as "GBP" | "USD" | "EUR" };
            // `next_payment_attempt` is Stripe's scheduled retry timestamp.
            const retryDate = invoice.next_payment_attempt
              ? new Date(invoice.next_payment_attempt * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
              : "shortly";
            const planLabel = ((profile.subscription_plan as string) || "Wallplace").charAt(0).toUpperCase() + ((profile.subscription_plan as string) || "Wallplace").slice(1);
            await sendEmail({
              idempotencyKey: `payment_failed:${invoice.id}:${invoice.attempt_count}`,
              template: "subscription_payment_failed",
              category: "orders_and_payouts",
              to: user.email,
              subject: `Payment failed on your ${planLabel} subscription`,
              userId: profile.user_id,
              react: SubscriptionPaymentFailed({
                firstName: (profile.name || "there").split(" ")[0],
                planName: planLabel,
                amountDue,
                retryDate,
                updatePaymentUrl: `${SITE}/artist-portal/billing`,
                supportUrl: `${SITE}/support`,
              }),
              metadata: { invoiceId: invoice.id, attempt: invoice.attempt_count },
            });
          }
        }
      } catch (err) {
        console.error("Payment-failed email error:", err);
      }
    }
  }

  // ─── Phase 2.2 G3: paid-loan recurring billing ───
  // Handled first so the artist-payout side fires before the generic
  // subscription receipt path. Helper returns false when the
  // invoice/subscription doesn't belong to a placement_recurring_billings
  // row, so the original artist_profiles subscription handler still
  // runs for SaaS subs.
  if (event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice;
    try {
      await handleInvoicePaidPaidLoan(invoice);
    } catch (err) {
      // WS1.1 second half: swallowing this kept the dedup claim, so Stripe
      // never retried and a month's artist share was silently lost.
      // The handlers are invoice/subscription-keyed idempotent, so the
      // retried event completes the work rather than doubling it.
      console.error("[stripe webhook] paid-loan invoice.paid:", err);
      return NextResponse.json({ error: "Recurring-billing processing failed" }, { status: 500 });
    }
  }
  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    try {
      await handleInvoicePaymentFailedPaidLoan(invoice);
    } catch (err) {
      // WS1.1 second half: swallowing this kept the dedup claim, so Stripe
      // never retried and the venue's dunning was silently lost.
      // The handlers are invoice/subscription-keyed idempotent, so the
      // retried event completes the work rather than doubling it.
      console.error("[stripe webhook] paid-loan invoice.payment_failed:", err);
      return NextResponse.json({ error: "Recurring-billing processing failed" }, { status: 500 });
    }
  }
  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    try {
      await handleSubscriptionDeletedPaidLoan(subscription);
    } catch (err) {
      // WS1.1 second half: swallowing this kept the dedup claim, so Stripe
      // never retried and the billing wind-down was silently lost.
      // The handlers are invoice/subscription-keyed idempotent, so the
      // retried event completes the work rather than doubling it.
      console.error("[stripe webhook] paid-loan subscription.deleted:", err);
      return NextResponse.json({ error: "Recurring-billing processing failed" }, { status: 500 });
    }
  }

  // ─── D21: managed-curation subscription reconcile ───
  // Mirrors the paid-loan block above. Each helper returns false when the
  // subscription is not a curation one, so the SaaS receipt path below still
  // runs for artist subscriptions.
  if (event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice;
    try {
      await handleCurationInvoicePaid(invoice);
    } catch (err) {
      // WS1.1 second half: swallowing this kept the dedup claim, so Stripe
      // never retried and the curation receipt and status was silently lost.
      // The handlers are invoice/subscription-keyed idempotent, so the
      // retried event completes the work rather than doubling it.
      console.error("[stripe webhook] curation invoice.paid:", err);
      return NextResponse.json({ error: "Recurring-billing processing failed" }, { status: 500 });
    }
  }
  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    try {
      await handleCurationInvoiceFailed(invoice);
    } catch (err) {
      // WS1.1 second half: swallowing this kept the dedup claim, so Stripe
      // never retried and the curation dunning was silently lost.
      // The handlers are invoice/subscription-keyed idempotent, so the
      // retried event completes the work rather than doubling it.
      console.error("[stripe webhook] curation invoice.payment_failed:", err);
      return NextResponse.json({ error: "Recurring-billing processing failed" }, { status: 500 });
    }
  }
  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    try {
      await handleCurationSubscriptionDeleted(subscription);
    } catch (err) {
      // WS1.1 second half: swallowing this kept the dedup claim, so Stripe
      // never retried and the curation wind-down was silently lost.
      // The handlers are invoice/subscription-keyed idempotent, so the
      // retried event completes the work rather than doubling it.
      console.error("[stripe webhook] curation subscription.deleted:", err);
      return NextResponse.json({ error: "Recurring-billing processing failed" }, { status: 500 });
    }
  }

  // ─── Invoice paid, renewal receipt + past_due recovery ───
  if (event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = typeof invoice.customer === "string" ? invoice.customer : (invoice.customer as Stripe.Customer)?.id;

    if (customerId) {
      // Recovery: if they were past_due and this invoice paid, set active.
      const { data: profile } = await db
        .from("artist_profiles")
        .select("user_id, name, subscription_status, subscription_plan")
        .eq("stripe_customer_id", customerId)
        .single();

      if (profile?.subscription_status === "past_due") {
        const { error } = await db
          .from("artist_profiles")
          .update({ subscription_status: "active" })
          .eq("stripe_customer_id", customerId);
        if (error) console.error("Invoice paid recovery error:", error);
        // WS4.4 (R2.2, return half): the dunning emails say the portfolio is
        // delisted while payments fail; recovery used to flip the status
        // back in silence. Close the loop. Keyed on the invoice that paid.
        if (!error && profile.user_id) {
          try {
            const { data: { user: recoveredUser } } = await db.auth.admin.getUserById(profile.user_id);
            if (recoveredUser?.email) {
              const planName = ((profile.subscription_plan as string) || "Wallplace")
                .replace(/^./, (c: string) => c.toUpperCase());
              createNotification({
                userId: profile.user_id,
                kind: "subscription_recovered",
                title: "Payment received, your portfolio is live again",
                body: "Your subscription is active and your work is back in the marketplace.",
                link: "/artist-portal/billing",
                idempotencyKey: `subscription_recovered:${invoice.id}`,
              }).catch((err) => console.warn("[webhook] recovery bell failed:", err));
              await sendEmail({
                idempotencyKey: `subscription_recovered:${invoice.id}`,
                template: "subscription_recovered",
                category: "orders_and_payouts",
                to: recoveredUser.email,
                userId: profile.user_id,
                subject: "Payment received, your portfolio is live again",
                react: SubscriptionRecovered({
                  firstName: (profile.name || "there").split(" ")[0],
                  planName,
                  portfolioUrl: `${SITE}/artist-portal/profile`,
                  supportUrl: `${SITE}/support`,
                }),
                metadata: { invoiceId: invoice.id, customerId },
              });
            }
          } catch (recoveryMailErr) {
            console.error("[webhook] recovery email failed:", recoveryMailErr);
          }
        }
      }

      // Renewal receipt, only for recurring charges, not the initial signup
      // invoice, which is covered by the subscription_started email on
      // customer.subscription.created above. That claim was FALSE until 09 item
      // 3.3 built that branch: neither a "started" email nor a checkout receipt
      // existed, so the first paid moment produced nothing and this comment was
      // the reason nobody noticed. `billing_reason` is the source of truth.
      // Skip trial-ending invoices with zero amount.
      const isRenewal = invoice.billing_reason === "subscription_cycle";
      if (isRenewal && invoice.amount_paid > 0 && profile?.user_id) {
        try {
          const { data: { user } } = await db.auth.admin.getUserById(profile.user_id);
          if (user?.email) {
            const planLabel = ((profile.subscription_plan as string) || "Wallplace").charAt(0).toUpperCase() + ((profile.subscription_plan as string) || "Wallplace").slice(1);
            const renewedAt = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
            const nextBillingDate = invoice.period_end
              ? new Date(invoice.period_end * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
              : "next period";
            await sendEmail({
              idempotencyKey: `renewal_receipt:${invoice.id}`,
              template: "subscription_renewal_receipt",
              category: "orders_and_payouts",
              to: user.email,
              subject: `Receipt for your ${planLabel} subscription`,
              userId: profile.user_id,
              react: SubscriptionRenewalReceipt({
                firstName: (profile.name || "there").split(" ")[0],
                planName: planLabel,
                amount: { amount: invoice.amount_paid, currency: (invoice.currency || "gbp").toUpperCase() as "GBP" | "USD" | "EUR" },
                renewedAt,
                nextBillingDate,
                invoiceUrl: invoice.hosted_invoice_url || `${SITE}/artist-portal/billing`,
              }),
              metadata: { invoiceId: invoice.id },
            });
          }
        } catch (err) {
          console.error("Renewal receipt email error:", err);
        }
      }
    }
  }

  // ─── Payout failed, notify artist so they can fix bank details ───
  if (event.type === "payout.failed") {
    const payout = event.data.object as Stripe.Payout;
    const connectAccountId = (event as Stripe.Event & { account?: string }).account;
    if (connectAccountId) {
      const { data: artistProfile } = await db
        .from("artist_profiles")
        .select("user_id, name")
        .eq("stripe_connect_account_id", connectAccountId)
        .maybeSingle();
      // WS2.3 (audit R3.9): a VENUE whose bank payout bounces used to vanish
      // here (artist_profiles only). Resolve venues as the fallback and warn
      // the admin when neither side matches.
      let failedRecipient = artistProfile;
      if (!failedRecipient?.user_id) {
        const { data: venueProfile } = await db
          .from("venue_profiles")
          .select("user_id, name")
          .eq("stripe_connect_account_id", connectAccountId)
          .maybeSingle();
        failedRecipient = venueProfile;
      }
      if (!failedRecipient?.user_id) {
        await sendAdminAlert({
          idempotencyKey: `payout_failed_unmatched:${payout.id}`,
          subject: "Bank payout failed for an unmatched Connect account",
          summary: "A payout.failed event arrived for a Connect account that matches no artist or venue profile. Investigate in Stripe.",
          fields: [
            { label: "Connect account", value: connectAccountId },
            { label: "Payout", value: payout.id },
            { label: "Amount", value: `£${(payout.amount / 100).toFixed(2)}` },
          ],
          actionPath: "/admin/financials",
          actionLabel: "Open financials",
        }).catch(() => {});
      }
      if (failedRecipient?.user_id) {
        const artistProfileResolved = failedRecipient;
        const { data: { user } } = await db.auth.admin.getUserById(artistProfileResolved.user_id);
        if (user?.email) {
          // WS6.2 (R6.F5): the artist's money bounced back off their bank;
          // that deserves a bell, not just an inbox entry. Keyed because the
          // email below can throw and Stripe redelivers.
          createNotification({
            userId: artistProfileResolved.user_id,
            kind: "payout_failed",
            title: "A payout to your bank failed",
            body: payout.failure_message || "Stripe could not send your payout. Check your bank details.",
            link: "/artist-portal/billing",
            idempotencyKey: `payout_failed:${payout.id}`,
          }).catch((err) => console.warn("[webhook] payout-failed bell failed:", err));
          await sendEmail({
            idempotencyKey: `payout_failed:${payout.id}`,
            template: "artist_payout_failed",
            category: "orders_and_payouts",
            to: user.email,
            subject: "Payout couldn't be sent",
            userId: artistProfileResolved.user_id,
            react: ArtistPayoutFailed({
              firstName: (artistProfileResolved.name || "there").split(" ")[0],
              payoutAmount: { amount: payout.amount, currency: (payout.currency || "gbp").toUpperCase() as "GBP" | "USD" | "EUR" },
              reason: payout.failure_message || payout.failure_code || "Stripe rejected the transfer.",
              fixPayoutUrl: `${SITE}/artist-portal/billing`,
              supportUrl: `${SITE}/support`,
            }),
            metadata: { payoutId: payout.id },
          });
        }
      }
    }
  }

  // ─── Payout paid, notify the artist ───
  // Fires when Stripe sends money from the artist's Connect account to
  // their bank. We look the artist up via `destination` (the Connect
  // account id) and send the polished `artist_payout_sent` template.
  if (event.type === "payout.paid") {
    const payout = event.data.object as Stripe.Payout;
    // The Connect account this payout came from lives on event.account.
    const connectAccountId = (event as Stripe.Event & { account?: string }).account;
    if (connectAccountId) {
      const { data: artistProfile } = await db
        .from("artist_profiles")
        .select("user_id, name")
        .eq("stripe_connect_account_id", connectAccountId)
        .maybeSingle();
      if (artistProfile?.user_id) {
        const { data: { user } } = await db.auth.admin.getUserById(artistProfile.user_id);
        if (user?.email) {
          const amount = { amount: payout.amount, currency: (payout.currency || "gbp").toUpperCase() as "GBP" | "USD" | "EUR" };
          const arrival = payout.arrival_date
            ? new Date(payout.arrival_date * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
            : "shortly";
          const amountLabel = `£${(payout.amount / 100).toFixed(2)}`;

          // Bell notification, fires alongside the email so the
          // artist sees the payout in-app immediately, not just via
          // their inbox. Idempotency on payout_id at the email layer
          // protects against double-notifying on retried webhooks.
          createNotification({
            userId: artistProfile.user_id,
            kind: "payout_sent",
            title: `Payout sent · ${amountLabel}`,
            body: `Expected to land ${arrival}`,
            // F9/F1: /artist-portal/billing/payouts does not exist; billing
            // is the page that lists payouts. Keyed because the sendEmail
            // below can throw and Stripe's retry re-runs this bell (F6b).
            link: "/artist-portal/billing",
            idempotencyKey: `payout_sent:${payout.id}`,
          }).catch((err) => console.warn("[stripe webhook] payout notification failed:", err));

          await sendEmail({
            idempotencyKey: `payout_sent:${payout.id}`,
            template: "artist_payout_sent",
            category: "orders_and_payouts",
            to: user.email,
            subject: `Payout on the way: ${amountLabel}`,
            userId: artistProfile.user_id,
            react: ArtistPayoutSent({
              firstName: (artistProfile.name || "there").split(" ")[0],
              payoutAmount: amount,
              payoutDate: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
              expectedArrival: arrival,
              payoutUrl: `${SITE}/artist-portal/billing`,
              supportUrl: `${SITE}/support`,
            }),
            metadata: { payoutId: payout.id, connectAccountId },
          });
        }
      }
    }
  }

  // ─── Transfer reversed, mark payout as failed ───
  if (event.type === "transfer.reversed") {
    const transfer = event.data.object as Stripe.Transfer;

    // WS2.1 (audit R3.1 CRITICAL, verified): this used to write `failed`,
    // which is a RETRYABLE state - the daily sweep re-executed the transfer
    // in full once the 24h Stripe idempotency key lapsed, turning every
    // reversal (in-app refunds included, since Stripe echoes their reversal
    // back as this event) into a scheduled double payment. A reversal is
    // terminal: the money came back deliberately.
    const { error } = await db
      .from("stripe_transfers")
      .update({ status: "reversed" })
      .eq("stripe_transfer_id", transfer.id);

    if (error) console.error("Transfer reversed update error:", error);
  }

  // ─── Card expiring (WS4.5, audit R2.4): the pre-failure warning ───
  //
  // The registered subscription_card_expiring template had no sender, so the
  // first anyone heard about an expiring card was the failed invoice.
  if (event.type === "customer.source.expiring") {
    const source = event.data.object as Stripe.Card & { customer?: string | Stripe.Customer | null };
    const customerId = typeof source.customer === "string" ? source.customer : source.customer?.id;
    if (customerId) {
      const { data: profile } = await db
        .from("artist_profiles")
        .select("user_id, name")
        .eq("stripe_customer_id", customerId)
        .maybeSingle<{ user_id: string | null; name: string | null }>();
      if (profile?.user_id) {
        const { data: { user } } = await db.auth.admin.getUserById(profile.user_id);
        if (user?.email) {
          await sendEmail({
            idempotencyKey: `card_expiring:${customerId}:${source.exp_month}-${source.exp_year}`,
            template: "subscription_card_expiring",
            category: "orders_and_payouts",
            to: user.email,
            userId: profile.user_id,
            subject: "Your card is about to expire",
            react: SubscriptionCardExpiring({
              firstName: (profile.name || "there").split(" ")[0],
              last4: source.last4 || "____",
              expiresAt: `${String(source.exp_month).padStart(2, "0")}/${source.exp_year}`,
              updatePaymentUrl: `${SITE}/artist-portal/billing`,
            }),
            metadata: { customerId },
          });
        }
      }
    }
    return NextResponse.json({ received: true });
  }

  // ─── Chargebacks (WS1.2, audit R3.2 CRITICAL) ───
  //
  // Until 2026-08-28 these events were claimed by the dedup table and acked
  // with the default 200: the platform silently lost the sale plus the
  // dispute fee, held artist legs still paid out on schedule mid-case, and
  // nobody was told inside the evidence window. The dispute email's "we hold
  // the payout while the case is open" promise is now true.
  if (event.type === "charge.dispute.created") {
    const dispute = event.data.object as Stripe.Dispute;
    const paymentIntentId =
      typeof dispute.payment_intent === "string" ? dispute.payment_intent : dispute.payment_intent?.id;
    const { data: order } = paymentIntentId
      ? await db.from("orders").select("id, status, buyer_email, artist_slug").eq("stripe_payment_intent_id", paymentIntentId).maybeSingle()
      : { data: null };

    if (order) {
      // Hold every not-yet-paid leg. Paid legs are dealt with on `closed`
      // (a reversal only if the dispute is LOST).
      const { error: holdErr } = await db
        .from("stripe_transfers")
        .update({ status: "blocked", last_error: `held: chargeback ${dispute.id}`, updated_at: new Date().toISOString() })
        .eq("order_id", order.id)
        .in("status", ["pending", "failed"]);
      if (holdErr) console.error("[webhook] dispute leg hold failed:", holdErr);

      const { error: stErr } = await db.from("orders").update({ status: "disputed" }).eq("id", order.id);
      if (stErr) console.error("[webhook] dispute status write failed:", stErr);
    } else if (paymentIntentId) {
      // Money-loss gap (programme rent): no matching `orders` row means this
      // is not a one-off marketplace purchase. It may be a Wallplace
      // Programme invoice instead — those live in curation_requests, never
      // orders, so the branch above never sees them. A dispute is at least
      // as urgent as a refund: resolve the Stripe invoice this payment
      // intent paid (see resolveInvoiceIdForPaymentIntent's own comment for
      // why that needs a live lookup) and void any not-yet-settled artist
      // rent before it is paid out from under a chargeback that may claw the
      // venue's money back regardless of what this platform does.
      const invoiceId = await resolveInvoiceIdForPaymentIntent(paymentIntentId);
      if (invoiceId) {
        await voidProgrammeAccrualsForInvoice(db, {
          invoiceId,
          reason: `charge.dispute.created ${dispute.id}`,
        });
      }
    }

    const dueBy = dispute.evidence_details?.due_by
      ? new Date(dispute.evidence_details.due_by * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long" })
      : "unknown";
    await sendAdminAlert({
      idempotencyKey: `chargeback_opened:${dispute.id}`,
      subject: `Chargeback opened: £${(dispute.amount / 100).toFixed(2)}${order ? ` on ${order.id}` : ""}`,
      summary: `A buyer disputed a charge (reason: ${dispute.reason}). Artist payouts for the order are held. Evidence is due by ${dueBy}; respond in the Stripe dashboard or the money is lost by default.`,
      fields: [
        { label: "Dispute", value: dispute.id },
        { label: "Order", value: order?.id || "no matching order" },
        { label: "Amount", value: `£${(dispute.amount / 100).toFixed(2)}` },
        { label: "Reason", value: dispute.reason || "unknown" },
        { label: "Evidence due", value: dueBy },
      ],
      actionPath: "/admin/financials",
      actionLabel: "Open financials",
    });
    return NextResponse.json({ received: true });
  }

  if (event.type === "charge.dispute.closed") {
    const dispute = event.data.object as Stripe.Dispute;
    const paymentIntentId =
      typeof dispute.payment_intent === "string" ? dispute.payment_intent : dispute.payment_intent?.id;
    const { data: order } = paymentIntentId
      ? await db.from("orders").select("id, status, delivered_at").eq("stripe_payment_intent_id", paymentIntentId).maybeSingle()
      : { data: null };

    if (order && dispute.status === "won") {
      // Release the held legs back to the queue; the sweep pays them.
      await db
        .from("stripe_transfers")
        .update({ status: "pending", last_error: null, updated_at: new Date().toISOString() })
        .eq("order_id", order.id)
        .eq("status", "blocked")
        .like("last_error", "held: chargeback%");
      await db
        .from("orders")
        .update({ status: order.delivered_at ? "delivered" : "confirmed" })
        .eq("id", order.id);
    } else if (order && dispute.status === "lost") {
      // The buyer's bank took the money. Held/pending legs die; PAID legs are
      // clawed back with an idempotent reversal per leg.
      await db
        .from("stripe_transfers")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("order_id", order.id)
        .in("status", ["pending", "failed", "blocked"]);
      const { data: paidLegs } = await db
        .from("stripe_transfers")
        .select("id, stripe_transfer_id")
        .eq("order_id", order.id)
        .eq("status", "paid");
      for (const leg of (paidLegs || []) as Array<{ id: string; stripe_transfer_id: string | null }>) {
        if (!leg.stripe_transfer_id) continue;
        try {
          await stripe.transfers.createReversal(
            leg.stripe_transfer_id,
            {},
            { idempotencyKey: `chargeback:${dispute.id}:reversal:${leg.id}` },
          );
          await db.from("stripe_transfers").update({ status: "reversed", updated_at: new Date().toISOString() }).eq("id", leg.id);
        } catch (revErr) {
          console.error("[webhook] chargeback reversal failed:", { leg: leg.id, revErr });
        }
      }
      await db.from("orders").update({ status: "refunded" }).eq("id", order.id);
    }

    await sendAdminAlert({
      idempotencyKey: `chargeback_closed:${dispute.id}`,
      subject: `Chargeback ${dispute.status}: £${(dispute.amount / 100).toFixed(2)}${order ? ` on ${order.id}` : ""}`,
      summary:
        dispute.status === "won"
          ? "The dispute was won. Held artist payouts have been released back to the queue."
          : dispute.status === "lost"
            ? "The dispute was lost: the buyer's bank kept the money, held payouts were cancelled and any already-paid artist legs were reversed. Check the reversal results below in Stripe."
            : `The dispute closed with status ${dispute.status}.`,
      fields: [
        { label: "Dispute", value: dispute.id },
        { label: "Order", value: order?.id || "no matching order" },
        { label: "Outcome", value: dispute.status || "unknown" },
      ],
      actionPath: "/admin/financials",
      actionLabel: "Open financials",
    });
    return NextResponse.json({ received: true });
  }

  // ─── Dashboard-initiated refunds (WS1.3, audit R1.F2 / R3.5) ───
  //
  // stripe.refunds.create from the in-app flow ALSO emits this event; the
  // order is already marked refunded there, so the no-op guard below keeps
  // the two paths from double-processing. What this handler catches is the
  // refund issued straight from the Stripe dashboard, which previously never
  // reached the books: legs kept paying, stock stayed sold, the order lied.
  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    const paymentIntentId =
      typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
    const { data: order } = paymentIntentId
      ? await db.from("orders").select("id, status, buyer_email, items").eq("stripe_payment_intent_id", paymentIntentId).maybeSingle()
      : { data: null };

    if (!order || order.status === "refunded") {
      // Money-loss gap (programme rent): a refund with no matching `orders`
      // row used to do nothing at all. It may be a Wallplace Programme
      // invoice refund instead of an unrecognised order — programmes live in
      // curation_requests, never orders, so this branch is EVERY programme
      // refund. Only attempted when `!order`: an order that WAS found is, by
      // construction, a one-off marketplace charge, never an invoice
      // payment, so there is nothing for this to find and no reason to pay
      // for the extra Stripe lookup on the already_refunded replay path.
      if (!order && paymentIntentId) {
        const invoiceId = await resolveInvoiceIdForPaymentIntent(paymentIntentId);
        if (invoiceId) {
          await voidProgrammeAccrualsForInvoice(db, {
            invoiceId,
            reason: `charge.refunded ${charge.id}`,
          });
        }
      }
      return NextResponse.json({ received: true, ignored: order ? "already_refunded" : "no_matching_order" });
    }

    const fullyRefunded = charge.refunded === true;
    if (!fullyRefunded) {
      // A PARTIAL dashboard refund has no in-app record naming which line it
      // was for, so leg surgery here would guess. Alert a human instead of
      // guessing with money.
      await sendAdminAlert({
        idempotencyKey: `dashboard_partial_refund:${charge.id}:${charge.amount_refunded}`,
        subject: `Partial dashboard refund on ${order.id}: £${(charge.amount_refunded / 100).toFixed(2)}`,
        summary: "A partial refund was issued from the Stripe dashboard. The books were NOT adjusted automatically because the refunded line is unknown; reconcile the artist legs by hand via the in-app refund flow.",
        fields: [
          { label: "Order", value: order.id },
          { label: "Refunded so far", value: `£${(charge.amount_refunded / 100).toFixed(2)}` },
        ],
        actionPath: "/admin/financials",
        actionLabel: "Open financials",
      });
      return NextResponse.json({ received: true, partial: true });
    }

    // Full refund: cancel unpaid legs, reverse paid legs, restock, mark, tell.
    await db
      .from("stripe_transfers")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("order_id", order.id)
      .in("status", ["pending", "failed", "blocked"]);
    const { data: paidLegs } = await db
      .from("stripe_transfers")
      .select("id, stripe_transfer_id")
      .eq("order_id", order.id)
      .eq("status", "paid");
    for (const leg of (paidLegs || []) as Array<{ id: string; stripe_transfer_id: string | null }>) {
      if (!leg.stripe_transfer_id) continue;
      try {
        await stripe.transfers.createReversal(
          leg.stripe_transfer_id,
          {},
          { idempotencyKey: `dashrefund:${charge.id}:reversal:${leg.id}` },
        );
        await db.from("stripe_transfers").update({ status: "reversed", updated_at: new Date().toISOString() }).eq("id", leg.id);
      } catch (revErr) {
        console.error("[webhook] dashboard-refund reversal failed:", { leg: leg.id, revErr });
      }
    }
    for (const item of ((order.items as Array<{ workId?: string; quantity?: number; qty?: number }>) || [])) {
      if (!item.workId) continue;
      const { error: restockErr } = await db.rpc("restock_work", {
        p_work_id: item.workId,
        p_qty: Number(item.qty ?? item.quantity ?? 1),
      });
      if (restockErr) console.warn("[webhook] dashboard-refund restock failed:", restockErr);
    }
    await db.from("orders").update({ status: "refunded" }).eq("id", order.id);
    if (order.buyer_email) {
      try {
        await sendEmail({
          idempotencyKey: `refund:${order.id}:dashboard`,
          template: "customer_refund_confirmation",
          category: "orders_and_payouts",
          to: order.buyer_email,
          subject: `Your refund for order ${order.id}`,
          react: CustomerRefundConfirmation({
            firstName: "there",
            orderNumber: order.id,
            refundAmount: { amount: charge.amount_refunded, currency: "GBP" },
            expectedArrival: "5 to 10 business days",
            supportUrl: `${SITE}/support`,
          }),
          metadata: { orderId: order.id },
        });
      } catch (mailErr) {
        console.warn("[webhook] dashboard-refund email failed:", mailErr);
      }
    }
    await sendAdminAlert({
      idempotencyKey: `dashboard_refund:${charge.id}`,
      subject: `Dashboard refund processed on ${order.id}`,
      summary: "A full refund issued from the Stripe dashboard was reconciled automatically: unpaid legs cancelled, paid legs reversed, stock restored, buyer emailed.",
      fields: [{ label: "Order", value: order.id }],
      actionPath: "/admin/financials",
      actionLabel: "Open financials",
    });
    return NextResponse.json({ received: true });
  }

  // ─── refund.failed (WS1.4): the buyer's money did NOT go back ───
  if (event.type === "refund.failed") {
    const refund = event.data.object as Stripe.Refund;
    const paymentIntentId =
      typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id;
    const { data: order } = paymentIntentId
      ? await db.from("orders").select("id, status").eq("stripe_payment_intent_id", paymentIntentId).maybeSingle()
      : { data: null };
    await sendAdminAlert({
      idempotencyKey: `refund_failed:${refund.id}`,
      subject: `Refund FAILED${order ? ` on ${order.id}` : ""}: £${(refund.amount / 100).toFixed(2)}`,
      summary: "Stripe could not return the money to the buyer (failure reason below). The order may be marked refunded while the buyer has not been paid back; resolve in the Stripe dashboard and contact the buyer.",
      fields: [
        { label: "Refund", value: refund.id },
        { label: "Order", value: order?.id || "no matching order" },
        { label: "Reason", value: (refund as { failure_reason?: string }).failure_reason || "unknown" },
      ],
      actionPath: "/admin/financials",
      actionLabel: "Open financials",
    });
    return NextResponse.json({ received: true });
  }

  // ─── Connect account onboarding updates ───
  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account;
    const isComplete = account.charges_enabled && account.details_submitted;

    // Update whichever profile has this account ID, and warm the
    // payout-capability cache (C1) so canReceivePayout can serve the fresh
    // charges/payouts state without a synchronous Stripe round-trip at checkout.
    const patch = {
      stripe_connect_onboarding_complete: isComplete,
      stripe_charges_enabled: account.charges_enabled ?? false,
      stripe_payouts_enabled: account.payouts_enabled ?? false,
      stripe_charges_checked_at: new Date().toISOString(),
    };

    await db
      .from("venue_profiles")
      .update(patch)
      .eq("stripe_connect_account_id", account.id);

    await db
      .from("artist_profiles")
      .update(patch)
      .eq("stripe_connect_account_id", account.id);

    // WS2.3 (audit R3.7): `blocked` used to be a dead end - money owed to a
    // not-yet-payable recipient never became payable when they finished
    // onboarding. When payouts flip on, release the blocked legs for this
    // account back to the queue. Dispute holds are NOT released here: those
    // are blocked for a reason that onboarding cannot cure.
    if (account.payouts_enabled) {
      const { error: unblockErr } = await db
        .from("stripe_transfers")
        .update({ status: "pending", last_error: null, updated_at: new Date().toISOString() })
        .eq("stripe_connect_account_id", account.id)
        .eq("status", "blocked")
        .not("last_error", "like", "held: chargeback%");
      if (unblockErr) console.warn("[webhook] blocked-leg release failed:", unblockErr);
    }

    // KYC-needed email: Stripe populates `requirements.currently_due` when
    // the Connect account is missing info. We only email the artist side
    // (venue Connect accounts are payouts-to-venue and tend to be simpler).
    // Idempotency includes the requirements hash so repeated "nothing
    // changed" deliveries don't trigger extra sends.
    const currentlyDue = account.requirements?.currently_due || [];
    if (currentlyDue.length > 0) {
      try {
        const { data: artistProfile } = await db
          .from("artist_profiles")
          .select("user_id, name")
          .eq("stripe_connect_account_id", account.id)
          .maybeSingle();
        if (artistProfile?.user_id) {
          const { data: { user } } = await db.auth.admin.getUserById(artistProfile.user_id);
          if (user?.email) {
            const hash = currentlyDue.sort().join(",").slice(0, 60);
            await sendEmail({
              idempotencyKey: `stripe_kyc:${account.id}:${hash}`,
              template: "artist_stripe_kyc_needed",
              category: "orders_and_payouts",
              to: user.email,
              subject: "Stripe needs more info to keep payouts flowing",
              userId: artistProfile.user_id,
              react: ArtistStripeKycNeeded({
                firstName: (artistProfile.name || "there").split(" ")[0],
                requestedDocuments: currentlyDue.slice(0, 8),
                stripeUrl: `${SITE}/artist-portal/billing`,
                deadline: account.requirements?.current_deadline
                  ? new Date(account.requirements.current_deadline * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
                  : undefined,
                supportUrl: `${SITE}/support`,
              }),
              metadata: { accountId: account.id, currentlyDue },
            });
          }
        }
      } catch (err) {
        console.error("KYC email error:", err);
      }
    }
  }

  return NextResponse.json({ received: true });
}

/**
 * Schedule the payout legs for a cart order: the venue revenue share and each
 * artist's own net (E9), each gated on canReceivePayout (D52), with a blocked
 * ledger row recorded when a recipient is not payout-ready.
 *
 * Extracted from the main handler so it can run on BOTH the first delivery and a
 * D3 duplicate redelivery (C4/D52.3). scheduleTransfer treats a
 * (order_id, recipient_user_id) 23505 as an idempotent replay (C3), so calling
 * this again for an order that already has some legs only fills the gaps and
 * never double-pays. Best-effort per leg: one failing recipient never stops the
 * rest.
 */
/**
 * The delivery address for an offer order, read back off the Stripe session.
 *
 * Rows 933-939. OFR-5A2LJH2CJ7KPVNMO carried `fulfilment_method: "ship"`,
 * `shipping_cost: 0`, and a shipping block whose every field was empty apart
 * from `notes: "Accepted offer off_… . No delivery address collected at
 * checkout."` The system knew; the artist saw "SHIP TO: ," above a live "Mark
 * as Shipped" button.
 *
 * Stripe moved this field: newer API versions return it under
 * `collected_information.shipping_details`, older ones under
 * `shipping_details`. Both are read so the address survives an API-version bump
 * in either direction, which is exactly the kind of silent regression that put
 * the empty block there in the first place.
 *
 * The note is kept ONLY when Stripe returned nothing, because that is the case
 * where the artist genuinely cannot post the piece and needs to be told why.
 */
interface StripeShippingDetails {
  name?: string | null;
  phone?: string | null;
  address?: {
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    postal_code?: string | null;
    country?: string | null;
  } | null;
}

function offerShipping(
  session: Stripe.Checkout.Session,
  offerId: string,
): Record<string, string> {
  const withShipping = session as unknown as {
    collected_information?: { shipping_details?: StripeShippingDetails | null } | null;
    shipping_details?: StripeShippingDetails | null;
  };
  const collected =
    withShipping.collected_information?.shipping_details ?? withShipping.shipping_details ?? null;
  const address = collected?.address ?? null;
  const email = session.customer_email || session.metadata?.offer_buyer_email || "";

  if (!address?.line1) {
    console.warn("[webhook] offer paid with no shipping address on the session", { offerId });
    return {
      fullName: collected?.name || "",
      email,
      phone: collected?.phone || "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      postcode: "",
      country: address?.country || "GB",
      notes: `Accepted offer ${offerId}. No delivery address collected at checkout.`,
    };
  }

  return {
    fullName: collected?.name || "",
    email,
    phone: collected?.phone || "",
    addressLine1: address.line1 || "",
    addressLine2: address.line2 || "",
    city: address.city || "",
    postcode: address.postal_code || "",
    country: address.country || "GB",
    notes: `Accepted offer ${offerId}.`,
  };
}

async function scheduleOrderLegs(
  db: ReturnType<typeof getSupabaseAdmin>,
  params: {
    orderId: string;
    legs: ArtistLeg[];
    venueSlug: string;
    venueRevenue: number;
    /**
     * Release the transfers now instead of holding them.
     *
     * Rows 870-874: this used to be `isCollection`, so a collect order settled
     * its artist transfer seconds after payment with no hold and no proof the
     * buyer had collected. Nothing sets it today; it stays as a parameter
     * because releasing on a confirmed handover is a legitimate future caller,
     * and /api/orders already does exactly that on the transition into
     * `delivered`.
     */
    releaseImmediately?: boolean;
  },
): Promise<void> {
  const { orderId, legs, venueSlug, venueRevenue, releaseImmediately = false } = params;

  const schedulingFailures: string[] = [];

  // Transfer venue revenue share.
  if (venueSlug && venueRevenue > 0) {
    try {
      // D52: gate on canReceivePayout, not the stale onboarding boolean.
      const cap = await canReceivePayout(db, { kind: "venue", slug: venueSlug });
      // canReceivePayout returns the account id + capability but not the venue's
      // user_id, which the ledger row needs; resolve it here.
      const { data: venueRow } = await db
        .from("venue_profiles")
        .select("user_id")
        .eq("slug", venueSlug)
        .maybeSingle<{ user_id: string | null }>();
      const venueUserId = venueRow?.user_id ?? null;
      const venuePence = Math.round(venueRevenue * 100);
      if (cap.ok && cap.accountId && venueUserId) {
        await scheduleTransfer({
          orderId,
          recipientType: "venue",
          recipientUserId: venueUserId,
          connectAccountId: cap.accountId,
          amountCents: venuePence,
          immediate: releaseImmediately,
        });
      } else if (venueUserId) {
        console.error("[cart] venue cannot be paid out, transfer skipped", {
          orderId,
          venueSlug,
          reason: cap.reason,
        });
        await recordBlockedLeg(db, {
          orderId,
          recipientType: "venue",
          recipientUserId: venueUserId,
          amountCents: venuePence,
          reason: cap.reason ?? "unknown",
        });
      }
    } catch (transferErr) {
      console.error("Venue transfer error:", transferErr);
      schedulingFailures.push(`venue ${venueSlug}: ${transferErr instanceof Error ? transferErr.message : String(transferErr)}`);
    }
  }

  // Transfer each artist their own leg (E9). One leg fails independently of the
  // others: a lapsed Connect account on one artist must not stop the rest.
  for (const leg of legs) {
    if (leg.netPence <= 0) continue;
    try {
      // D52: gate on canReceivePayout (payouts_enabled), not the stale
      // stripe_connect_onboarding_complete boolean C1 replaced.
      const cap = await canReceivePayout(db, { kind: "artist", userId: leg.artistUserId });
      if (cap.ok && cap.accountId) {
        await scheduleTransfer({
          orderId,
          recipientType: "artist",
          recipientUserId: leg.artistUserId,
          connectAccountId: cap.accountId,
          amountCents: leg.netPence,
          immediate: releaseImmediately,
        });
      } else {
        console.error("[cart] artist cannot be paid out, transfer skipped", {
          orderId,
          artistSlug: leg.artistSlug,
          artistUserId: leg.artistUserId,
          netPence: leg.netPence,
          reason: cap.reason,
        });
        await recordBlockedLeg(db, {
          orderId,
          recipientUserId: leg.artistUserId,
          amountCents: leg.netPence,
          reason: cap.reason ?? "unknown",
        });
      }
    } catch (transferErr) {
      console.error("Artist transfer error:", { slug: leg.artistSlug, transferErr });
      schedulingFailures.push(`${leg.artistSlug}: ${transferErr instanceof Error ? transferErr.message : String(transferErr)}`);
    }
  }

  // WS2.5 (audit R1.F10): a per-leg scheduling failure used to be a log line
  // only, and the whole-order reconciler is blind to orders that HAVE some
  // legs. Anything that slipped through the idempotent retries above gets a
  // human, with the order id they need.
  if (schedulingFailures.length > 0) {
    await sendAdminAlert({
      idempotencyKey: `leg_schedule_failed:${orderId}`,
      subject: `Payout leg scheduling failed on ${orderId}`,
      summary: "One or more payout legs could not be written to the ledger. The buyer has paid; the listed recipients have no pending transfer. Redeliver the Stripe event or record the legs by hand.",
      fields: schedulingFailures.map((f, i) => ({ label: `Failure ${i + 1}`, value: f })),
      actionPath: "/admin/financials",
      actionLabel: "Open financials",
    }).catch(() => {});
  }
}

/**
 * Money-loss gap (programme rent), used by the charge.refunded and
 * charge.dispute.created handlers above to find a Wallplace Programme's
 * Stripe invoice from a charge/dispute that has no matching `orders` row.
 *
 * A charge no longer carries a direct `invoice` reference: Stripe removed
 * `invoice` from both `Charge` and `PaymentIntent` in API version
 * 2025-03-31.basil (node_modules/stripe/CHANGELOG.md, stripe-node 18.0.0),
 * and this codebase is pinned well past that (src/lib/stripe.ts,
 * STRIPE_API_VERSION). The replacement Stripe itself ships for this exact
 * link is the `invoice_payments` resource: an invoice can in principle have
 * more than one payment attempt, so the payment -> invoice direction is now
 * a lookup, not a field. `payment.type: "payment_intent"` is correct for
 * every programme invoice this codebase creates (Stripe Billing invoices are
 * always paid through a PaymentIntent); the resource's own docs note the
 * `charge` variant only surfaces when a charge has NO payment intent at all,
 * which cannot be filtered by this list endpoint and does not occur here.
 *
 * Never throws: a lookup failure must not stop the rest of the refund or
 * dispute handler, which has its own, unrelated job (the order-refund path)
 * to get on with regardless of whether this resolves anything.
 */
async function resolveInvoiceIdForPaymentIntent(paymentIntentId: string): Promise<string | null> {
  try {
    const payments = await stripe.invoicePayments.list({
      payment: { type: "payment_intent", payment_intent: paymentIntentId },
      limit: 1,
    });
    const payment = payments.data[0];
    if (!payment) return null;
    return typeof payment.invoice === "string" ? payment.invoice : payment.invoice.id;
  } catch (err) {
    console.error("[webhook] failed to resolve invoice for payment intent", { paymentIntentId, err });
    return null;
  }
}
