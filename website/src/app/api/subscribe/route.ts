import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { FOUNDING_TRIAL_DAYS, STANDARD_TRIAL_DAYS } from "@/lib/pricing";

const PRICE_MAP: Record<string, string | undefined> = {
  core: process.env.STRIPE_PRICE_CORE,
  premium: process.env.STRIPE_PRICE_PREMIUM,
  pro: process.env.STRIPE_PRICE_PRO,
  core_annual: process.env.STRIPE_PRICE_CORE_ANNUAL,
  premium_annual: process.env.STRIPE_PRICE_PREMIUM_ANNUAL,
  pro_annual: process.env.STRIPE_PRICE_PRO_ANNUAL,
};

export async function POST(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const plan: string = body.plan;
    const billing: "monthly" | "annual" = body.billing === "annual" ? "annual" : "monthly";
    const priceKey = billing === "annual" ? `${plan}_annual` : plan;

    const priceId = PRICE_MAP[priceKey];
    if (!priceId) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const db = getSupabaseAdmin();

    // Get artist profile
    const { data: profile } = await db
      .from("artist_profiles")
      .select("id, stripe_customer_id, is_founding_artist, name, subscription_status, subscription_plan")
      .eq("user_id", auth.user!.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "Artist profile not found" }, { status: 404 });
    }

    // Get or create Stripe customer
    let customerId = profile.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: auth.user!.email,
        name: profile.name || undefined,
        metadata: { artist_profile_id: profile.id, supabase_user_id: auth.user!.id },
      });
      customerId = customer.id;

      await db
        .from("artist_profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", profile.id);
    }

    // WS4.1 (audit R2.1 CRITICAL): past_due and incomplete are LIVE
    // subscriptions at Stripe (dunning retries a past_due card and can
    // recover it), so re-subscribing in those states without carrying
    // cancel_previous minted a second concurrent subscription and the
    // recovered first one billed alongside it. Anything Stripe still
    // considers collectible counts as live here.
    const LIVE_SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due", "incomplete"];
    const hasActiveSubscription = LIVE_SUBSCRIPTION_STATUSES.includes(profile.subscription_status || "");

    // If already subscribed, store existing subscription ID so we can cancel it AFTER checkout completes
    let existingSubscriptionId: string | null = null;
    if (hasActiveSubscription && customerId) {
      try {
        for (const status of ["active", "trialing", "past_due", "incomplete"] as const) {
          const subs = await stripe.subscriptions.list({ customer: customerId, status, limit: 1 });
          if (subs.data[0]) {
            existingSubscriptionId = subs.data[0].id;
            break;
          }
        }
      } catch (err) {
        console.error("List subscriptions error:", err);
      }
    }

    // Determine trial days, no trial if upgrading or had previous subscription
    const hadPreviousSub = hasActiveSubscription || profile.subscription_status === "canceled" || profile.subscription_status === "past_due";
    const trialDays = hadPreviousSub ? 0 : profile.is_founding_artist ? FOUNDING_TRIAL_DAYS : STANDARD_TRIAL_DAYS;

    // Create Stripe Checkout Session in subscription mode
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const sessionParams: Record<string, unknown> = {
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
        metadata: { plan, billing, artist_profile_id: profile.id, cancel_previous: existingSubscriptionId || "" },
      },
      success_url: `${siteUrl}/artist-portal/billing?subscribed=true`,
      cancel_url: `${siteUrl}/artist-portal/billing`,
      metadata: { plan, billing, artist_profile_id: profile.id, cancel_previous: existingSubscriptionId || "" },
    };
    // WS4.2 (audit R2.5): a double-submit used to mint two checkout sessions
    // and could end in two subscriptions. One deterministic key per
    // profile+plan+existing-sub combination per hour makes the second click
    // return the FIRST session.
    const hourBucket = Math.floor(Date.now() / (60 * 60 * 1000));
    const session = await stripe.checkout.sessions.create(
      sessionParams as Parameters<typeof stripe.checkout.sessions.create>[0],
      { idempotencyKey: `subscribe:${profile.id}:${plan}:${billing}:${existingSubscriptionId || "none"}:${hourBucket}` },
    );

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Subscribe error:", err);
    return NextResponse.json({ error: "Failed to create subscription" }, { status: 500 });
  }
}
