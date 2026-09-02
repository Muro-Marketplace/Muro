import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const db = getSupabaseAdmin();

    const { data: profile } = await db
      .from("artist_profiles")
      .select("stripe_customer_id")
      .eq("user_id", auth.user!.id)
      .single();

    if (!profile?.stripe_customer_id) {
      return NextResponse.json({ error: "No subscription found" }, { status: 404 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${siteUrl}/artist-portal/billing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Portal session error:", err);
    return NextResponse.json({ error: "Failed to create portal session" }, { status: 500 });
  }
}
