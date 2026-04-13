import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const PRICE_MAP: Record<string, string | undefined> = {
  core: process.env.STRIPE_PRICE_CORE,
  premium: process.env.STRIPE_PRICE_PREMIUM,
  pro: process.env.STRIPE_PRICE_PRO,
};

export async function POST(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const { plan } = await request.json();

    const priceId = PRICE_MAP[plan];
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

    const hasActiveSubscription = profile.subscription_status === "active" || profile.subscription_status === "trialing";

    // If already subscribed, update the existing subscription instead of creating a new checkout
    if (hasActiveSubscription && customerId) {
      try {
        const subscriptions = await stripe.subscriptions.list({
          customer: customerId,
          status: "active",
          limit: 1,
        });
        // Also check trialing if no active found
        let existing = subscriptions.data[0];
        if (!existing) {
          const trialingSubs = await stripe.subscriptions.list({
            customer: customerId,
            status: "trialing",
            limit: 1,
          });
          existing = trialingSubs.data[0];
        }

        if (existing && existing.items.data[0]) {
          await stripe.subscriptions.update(existing.id, {
            items: [{ id: existing.items.data[0].id, price: priceId }],
            proration_behavior: "create_prorations",
            metadata: { plan, artist_profile_id: profile.id },
          });

          // Update profile
          await db
            .from("artist_profiles")
            .update({ subscription_plan: plan })
            .eq("id", profile.id);

          const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
          return NextResponse.json({ url: `${siteUrl}/artist-portal/billing?changed=true` });
        }
      } catch (upgradeErr) {
        console.error("Subscription upgrade error:", upgradeErr);
        return NextResponse.json({
          error: upgradeErr instanceof Error ? upgradeErr.message : "Failed to upgrade subscription",
        }, { status: 500 });
      }
    }

    // Determine trial days — only for brand new subscriptions
    const hadPreviousSub = profile.subscription_status === "canceled" || profile.subscription_status === "past_due";
    const trialDays = hadPreviousSub ? 0 : profile.is_founding_artist ? 180 : 30;

    // Create Stripe Checkout Session in subscription mode
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const sessionParams: Record<string, unknown> = {
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
        metadata: { plan, artist_profile_id: profile.id },
      },
      success_url: `${siteUrl}/artist-portal/billing?subscribed=true`,
      cancel_url: `${siteUrl}/artist-portal/billing`,
      metadata: { plan, artist_profile_id: profile.id },
    };
    const session = await stripe.checkout.sessions.create(sessionParams as Parameters<typeof stripe.checkout.sessions.create>[0]);

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Subscribe error:", err);
    return NextResponse.json({ error: "Failed to create subscription" }, { status: 500 });
  }
}
