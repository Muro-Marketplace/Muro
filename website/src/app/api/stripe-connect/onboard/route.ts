import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { assertNotDemoStrict } from "@/lib/demo-guard";

export async function POST(request: Request) {
  const { user, error } = await getAuthenticatedUser(request);
  if (!user) return error;
  // E23a: STRICT. This creates or opens a real Stripe Connect account, which is
  // an external identity and a payout destination. A demo session must not.
  const demoBlocked = assertNotDemoStrict(user.id);
  if (demoBlocked) return demoBlocked;

  const { accountType } = await request.json();
  if (accountType !== "venue" && accountType !== "artist") {
    return NextResponse.json({ error: "Invalid account type" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const table = accountType === "venue" ? "venue_profiles" : "artist_profiles";
  // Prefer the configured public URL, fall back to the request origin
  // so onboarding still works in preview deploys / environments where
  // NEXT_PUBLIC_SITE_URL hasn't been wired up. Stripe rejects account
  // links with non-https URLs, so we strip any trailing slash and drop
  // through to the request origin if the env var is empty or malformed.
  const envSiteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  const requestOrigin = (() => {
    try {
      return new URL(request.url).origin;
    } catch {
      return "";
    }
  })();
  const siteUrl = /^https?:\/\//.test(envSiteUrl) ? envSiteUrl : requestOrigin;
  if (!siteUrl) {
    return NextResponse.json(
      { error: "Site URL not configured. Contact support so we can finish setting up payouts." },
      { status: 500 },
    );
  }

  // Look up the profile for this user
  const { data: profile, error: profileError } = await db
    .from(table)
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  let accountId = profile.stripe_connect_account_id || "";

  // Create Express account if one doesn't exist yet
  if (!accountId) {
    try {
      const account = await stripe.accounts.create({
        type: "express",
        country: "GB",
        email: user.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_profile: {
          name: "Wallplace",
          product_description:
            accountType === "venue"
              ? "Venue receiving artwork sales via Wallplace marketplace"
              : "Artist selling original artwork via Wallplace marketplace",
          url: siteUrl,
        },
        settings: {
          payouts: { statement_descriptor: "WALLPLACE" },
        },
        metadata: { user_id: user.id, account_type: accountType, platform: "wallplace" },
      });

      accountId = account.id;
    } catch (err) {
      // Common cause: Stripe Connect isn't enabled on the platform
      // account, or the requested capabilities aren't available. Without
      // this catch the route 500s and the client shows a generic alert
      // with no explanation. Surface Stripe's message verbatim so the
      // operator can act.
      console.error("Stripe accounts.create error:", err);
      const message =
        err instanceof Error
          ? err.message
          : "Couldn't create Stripe Connect account. Contact support.";
      return NextResponse.json({ error: message }, { status: 500 });
    }

    // Store the account ID on the profile
    const { error: updateErr } = await db
      .from(table)
      .update({ stripe_connect_account_id: accountId })
      .eq("user_id", user.id);

    if (updateErr) {
      console.error("Failed to store Connect account ID:", updateErr.message);
      // Column may not exist yet, continue anyway, the account is created in Stripe
    }
  }

  // Create an Account Link for onboarding
  const refreshUrl =
    accountType === "venue"
      ? `${siteUrl}/venue-portal/settings?stripe_connect=refresh`
      : `${siteUrl}/artist-portal/billing?stripe_connect=refresh`;
  const returnUrl =
    accountType === "venue"
      ? `${siteUrl}/venue-portal/settings?stripe_connect=complete`
      : `${siteUrl}/artist-portal/billing?stripe_connect=complete`;

  try {
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });

    return NextResponse.json({ url: accountLink.url });
  } catch (err) {
    console.error("Stripe Connect onboard error:", err);
    const message = err instanceof Error ? err.message : "Failed to create onboarding link";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
