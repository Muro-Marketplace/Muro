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
      .select("id, stripe_customer_id, is_founding_artist, name")
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

    // Determine trial days
    const trialDays = profile.is_founding_artist ? 180 : 30;

    // Create Stripe Checkout Session in subscription mode
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: trialDays,
        metadata: { plan, artist_profile_id: profile.id },
      },
      success_url: `${siteUrl}/artist-portal/billing?subscribed=true`,
      cancel_url: `${siteUrl}/pricing`,
      metadata: { plan, artist_profile_id: profile.id },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Subscribe error:", err);
    return NextResponse.json({ error: "Failed to create subscription" }, { status: 500 });
  }
}
