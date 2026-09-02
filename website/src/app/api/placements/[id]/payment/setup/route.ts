import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { stripe } from "@/lib/stripe";
import { platformFeePercentForArtist } from "@/lib/platform-fee";
import { canReceivePayout } from "@/lib/payouts/capability";
import { PAID_LOAN_MIN_GBP } from "@/lib/pricing";

export const dynamic = "force-dynamic";

/**
 * How long one setup attempt is deduplicated for (E7b). Inside the window a
 * repeated attempt returns Stripe's original session instead of minting a second
 * subscription. An attempt that straddles the boundary gets a fresh session, which
 * is the accepted trade-off for not persisting a key.
 */
const SETUP_IDEMPOTENCY_WINDOW_MS = 3_600_000;

/**
 * POST /api/placements/[id]/payment/setup
 *
 * Creates a Stripe Checkout session in subscription mode for the paid-loan
 * monthly fee. The session collects card details and starts the recurring
 * charge. The webhook's paid_loan_monthly branch (E7a) records the resulting
 * subscription in placement_recurring_billings and mirrors it onto the placement.
 *
 * Billing model, settled by §B6: the platform collects the whole monthly fee and
 * the artist is paid by a separate transfer when each invoice is paid
 * (handleInvoicePaid), so every payout lands in the stripe_transfers ledger. The
 * destination-charge alternative is deleted, not configurable. This comment used
 * to describe a "10% application fee placeholder" that no longer exists.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const db = getSupabaseAdmin();

  const { data: placement } = await db
    .from("placements")
    .select("id, venue_user_id, artist_user_id, work_title, monthly_fee_gbp, stripe_subscription_id")
    .eq("id", id)
    .maybeSingle();

  if (!placement) return NextResponse.json({ error: "Placement not found" }, { status: 404 });
  if (placement.venue_user_id !== auth.user!.id) {
    return NextResponse.json({ error: "Only the venue can set up payment" }, { status: 403 });
  }
  if (!placement.monthly_fee_gbp || placement.monthly_fee_gbp <= 0) {
    return NextResponse.json({ error: "No monthly fee on this placement" }, { status: 400 });
  }
  // E7b: a dedup guard that actually works. The mirror on `placements` is written
  // by recordPaidLoanSubscription (E7a), and the ledger row is the authoritative
  // record, so both are checked: the mirror is best-effort and a failed mirror must
  // not open the door to a second subscription.
  //
  // Deliberately not `.maybeSingle()`, which the plan's snippet uses. There is no
  // unique index on placement_recurring_billings.placement_id (the UNIQUE is on
  // stripe_subscription_id), so if a placement ever did acquire two rows,
  // maybeSingle would fail with PGRST116, return null data, and the guard would
  // wave through a third subscription. A limited list cannot do that.
  const { data: billings } = await db
    .from("placement_recurring_billings")
    .select("id, stripe_subscription_id, status")
    .eq("placement_id", id)
    .neq("status", "cancelled")
    .limit(2);
  const liveBilling = (billings || []).find((b) => b.stripe_subscription_id);

  if (liveBilling || placement.stripe_subscription_id) {
    return NextResponse.json(
      { error: "Monthly payment already set up for this placement" },
      { status: 409 },
    );
  }

  const { data: artistProfile } = await db
    .from("artist_profiles")
    .select("name, slug, stripe_connect_account_id, subscription_plan, subscription_status, trial_end")
    .eq("user_id", placement.artist_user_id)
    .maybeSingle();

  // E8: refuse to start a monthly charge we cannot pay out.
  //
  // The old gate was `artistProfile?.stripe_connect_account_id` being truthy,
  // which is "the column is a non-empty string", not "this artist can be paid":
  // the column defaults to '' and is set the moment onboarding *starts*. An
  // account mid-KYC is not charges_enabled, so the money was collected monthly
  // with no way to forward it. canReceivePayout gates on payouts_enabled (not
  // just charges_enabled) with Stripe (60s cache) and fails closed, and is the
  // same primitive the cart and offer checkouts use.
  if (!artistProfile?.slug || !(await canReceivePayout(db, { kind: "artist", slug: artistProfile.slug })).ok) {
    return NextResponse.json(
      {
        error:
          "This artist isn't set up to receive payouts yet, so monthly payments can't start. " +
          "Please try again once they have finished onboarding.",
        reason: "payouts_unavailable",
      },
      { status: 422 },
    );
  }

  // Recorded for audit: the tier quoted at setup. NOT what gets charged. The
  // platform cut is taken when each invoice is paid, where handleInvoicePaid
  // recomputes it from the artist's plan at that moment (their tier can change
  // between setup and any given month).
  const feePct = platformFeePercentForArtist(artistProfile);

  // Floor guard (owner decision 2026-08-28). The Zod schemas enforce this on
  // new placements and counters; this catches legacy rows created before the
  // floor existed so we never start a subscription the fee maths cannot carry.
  if (placement.monthly_fee_gbp < PAID_LOAN_MIN_GBP) {
    return NextResponse.json(
      {
        error: `Monthly loan fees start at £${PAID_LOAN_MIN_GBP}. Ask the artist to update the placement terms.`,
        reason: "monthly_fee_below_floor",
      },
      { status: 422 },
    );
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const monthlyFeePence = Math.round(placement.monthly_fee_gbp * 100);

  try {
    const sessionParams: Parameters<typeof stripe.checkout.sessions.create>[0] = {
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: auth.user!.email || undefined,
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: `Monthly loan, ${placement.work_title || "Artwork"}`,
            },
            unit_amount: monthlyFeePence,
            recurring: { interval: "month" },
          },
          quantity: 1,
        },
      ],
      // No application_fee_percent and no transfer_data: §B6's decision is to keep
      // Path 1 (a separate transfer through the stripe_transfers ledger) and delete
      // Path 2 (the destination charge). A destination charge pays the artist
      // directly and bypasses the ledger, so refunds, reversals, the payout
      // dashboard and admin/financials are all blind to the money.
      //
      // It had become a double-payment risk too. handleInvoicePaid finds the
      // subscription in placement_recurring_billings and schedules a transfer for
      // the artist's share; since E7a started recording setup-route subscriptions
      // in that table, a destination charge here would pay the artist once through
      // Stripe and again through the ledger. PAID_LOAN_V2 being off in prod is the
      // only reason that has not happened, so this must land before the flag flips.
      subscription_data: {
        metadata: {
          placement_id: placement.id,
          venue_user_id: placement.venue_user_id,
          artist_user_id: placement.artist_user_id,
          kind: "paid_loan_monthly",
          platform_fee_percent: String(feePct),
        },
      },
      metadata: { placement_id: placement.id, kind: "paid_loan_monthly" },
      success_url: `${siteUrl}/venue-portal/placements?payment=setup-complete&placement=${placement.id}`,
      cancel_url: `${siteUrl}/placements/${placement.id}/payment?cancelled=1`,
    };

    // E7b: without a key, two clicks meant two live subscriptions and two monthly
    // charges for one placement. Stripe replays the first response for a repeated
    // key, so the second click gets the same session back and completing it can
    // only ever start one subscription.
    //
    // The amount is in the key, not just the placement and the hour. A repeated
    // key with DIFFERENT parameters is an idempotency error from Stripe, which
    // would surface as the generic 500 below, so a fee edited between two attempts
    // must produce a different key rather than a failure.
    const hourBucket = Math.floor(Date.now() / SETUP_IDEMPOTENCY_WINDOW_MS);
    const session = await stripe.checkout.sessions.create(sessionParams, {
      idempotencyKey: `paid_loan_setup:${placement.id}:${monthlyFeePence}:${hourBucket}`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Paid-loan subscription setup error:", err);
    return NextResponse.json(
      { error: "Stripe error, please try again or contact support." },
      { status: 500 },
    );
  }
}
