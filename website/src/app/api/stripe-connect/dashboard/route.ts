import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";

export async function POST(request: Request) {
  const { user, error } = await getAuthenticatedUser(request);
  if (!user) return error;

  const db = getSupabaseAdmin();

  // Check both profile tables for a Connect account
  const { data: artistProfile } = await db
    .from("artist_profiles")
    .select("stripe_connect_account_id")
    .eq("user_id", user.id)
    .single();

  const { data: venueProfile } = await db
    .from("venue_profiles")
    .select("stripe_connect_account_id")
    .eq("user_id", user.id)
    .single();

  const accountId =
    artistProfile?.stripe_connect_account_id ||
    venueProfile?.stripe_connect_account_id;

  if (!accountId) {
    return NextResponse.json(
      { error: "No Connect account found" },
      { status: 404 }
    );
  }

  const loginLink = await stripe.accounts.createLoginLink(accountId);

  return NextResponse.json({ url: loginLink.url });
}
