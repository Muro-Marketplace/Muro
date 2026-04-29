import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { stripe } from "@/lib/stripe";
import { platformFeePercentForArtist } from "@/lib/platform-fee";

export const dynamic = "force-dynamic";

/**
 * POST /api/placements/[id]/payment/setup
 *
 * Creates a Stripe Checkout session in subscription mode for the paid-loan
 * monthly fee. The session collects card details and starts the recurring
 * charge. On completion Stripe fires the standard webhook → we stamp the
 * placement with stripe_subscription_id.
 *
 * The billing model (platform fee split, application fee rate, VAT) is a
 * product decision, scaffolded here with a 10% application fee placeholder.
 * Revise once the commercial policy is locked.
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
  if (placement.stripe_subscription_id) {
    return NextResponse.json({ error: "Monthly payment already set up for this placement" }, { status: 400 });
  }

  const { data: artistProfile } = await db
    .from("artist_profiles")
    .select("name, stripe_connect_account_id, subscription_plan, free_until")
    .eq("user_id", placement.artist_user_id)
    .maybeSingle();

  // Application fee mirrors the artist's existing platform-fee tier, the
  // same 5% / 8% / 15% that applies to their sales. Founding / trialling
  // artists (free_until in the future) pay 0% on recurring loan payments.
  const feePct = platformFeePercentForArtist(artistProfile);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

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
            unit_amount: Math.round(placement.monthly_fee_gbp * 100),
            recurring: { interval: "month" },
          },
          quantity: 1,
        },
      ],
      subscription_data: {
        metadata: {
          placement_id: placement.id,
          venue_user_id: placement.venue_user_id,
          artist_user_id: placement.artist_user_id,
          kind: "paid_loan_monthly",
          platform_fee_percent: String(feePct),
        },
        // Use the artist's tier fee; omit the field entirely when it's
        // zero (Stripe rejects application_fee_percent: 0 on some APIs).
        ...(feePct > 0 ? { application_fee_percent: feePct } : {}),
        transfer_data: artistProfile?.stripe_connect_account_id
          ? { destination: artistProfile.stripe_connect_account_id }
          : undefined,
      },
      metadata: { placement_id: placement.id, kind: "paid_loan_monthly" },
      success_url: `${siteUrl}/venue-portal/placements?payment=setup-complete&placement=${placement.id}`,
      cancel_url: `${siteUrl}/placements/${placement.id}/payment?cancelled=1`,
    };

    const session = await stripe.checkout.sessions.create(sessionParams);
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Paid-loan subscription setup error:", err);
    return NextResponse.json(
      { error: "Stripe error, please try again or contact support." },
      { status: 500 },
    );
  }
}
