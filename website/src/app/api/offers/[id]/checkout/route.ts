// POST /api/offers/[id]/checkout
//
// Buyer (the venue) completes payment on an accepted offer. Creates a
// Stripe Checkout Session at the agreed amount. The webhook flips the
// offer to 'paid' and threads the resulting order id back.

import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { assertNotDemoStrict } from "@/lib/demo-guard";
import { platformFeePercentForArtist } from "@/lib/platform-fee";
import { canArtistAcceptOrders } from "@/lib/stripe-connect-status";
import { isWorkSold } from "@/lib/work-stock";

export const runtime = "nodejs";

interface OfferRow {
  id: string;
  buyer_user_id: string;
  buyer_email: string | null;
  artist_user_id: string;
  artist_slug: string | null;
  work_ids: string[];
  collection_id: string | null;
  amount_pence: number;
  currency: string;
  status: string;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;
  // E23a: the demo guard existed but had ZERO call sites, while two doc comments
  // claimed it was wired. This handler reaches real people (real emails, real
  // money, or content on a public page), so it takes the STRICT 403 variant.
  const demoBlocked = assertNotDemoStrict(auth.user!.id);
  if (demoBlocked) return demoBlocked;

  const { id } = await context.params;
  const db = getSupabaseAdmin();
  const { data: offer } = await db.from("purchase_offers").select("*").eq("id", id).maybeSingle<OfferRow>();
  if (!offer) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (offer.buyer_user_id !== auth.user!.id) {
    return NextResponse.json({ error: "Only the buyer can check out" }, { status: 403 });
  }
  if (offer.status !== "accepted") {
    return NextResponse.json({ error: "Offer is not in an accepted state" }, { status: 409 });
  }

  // D7: purchase_offers has no link to stock, so an offer accepted on Monday can
  // still be paid on Friday for a work that sold through the cart on Wednesday.
  // The cart checkout has re-validated at session creation all along; this branch
  // never inherited it. Runs before the payout pre-flight so a dead offer costs
  // no extra round trips and never reaches Stripe.
  //
  // Both offer shapes are covered. `chk_target_shape` in the live table enforces
  // "work_ids non-empty XOR collection_id set", so the plan's `work_ids.length >
  // 0` guard would have skipped every collection offer, which is precisely the
  // half where the works are not named on the offer row.
  let workIds: string[] = [...new Set(offer.work_ids)];
  let collectionWithdrawn = false;
  if (workIds.length === 0 && offer.collection_id) {
    const { data: collection } = await db
      .from("artist_collections")
      .select("work_ids, available")
      .eq("id", offer.collection_id)
      .maybeSingle<{ work_ids: string[] | null; available: boolean | null }>();
    if (!collection || collection.available === false) {
      collectionWithdrawn = true;
    } else {
      workIds = [...new Set(collection.work_ids || [])];
    }
  }

  let soldOrMissing = collectionWithdrawn;
  if (!soldOrMissing && workIds.length > 0) {
    const { data: works } = await db
      .from("artist_works")
      .select("id, title, available, quantity_available")
      .in("id", workIds);
    const found = (works || []) as Array<{
      id: string;
      title: string | null;
      available: boolean | null;
      quantity_available: number | null;
    }>;
    // A work deleted since the offer was accepted counts as gone too, hence the
    // length comparison. work_ids is de-duplicated above so a repeated id cannot
    // fake a shortfall and close a live offer.
    soldOrMissing = found.length !== workIds.length || found.some(isWorkSold);
  }

  if (soldOrMissing) {
    // Compare-and-set on `accepted`. Without it, a buyer paying in one tab while
    // this runs in another would have their completed payment overwritten:
    // the webhook sets 'paid', this would stamp 'expired' on top and the offer
    // would no longer look like it had been paid for.
    await db
      .from("purchase_offers")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", offer.id)
      .eq("status", "accepted");
    return NextResponse.json(
      {
        error: "One or more works on this offer have sold. The offer has been closed.",
        code: "work_sold",
      },
      { status: 409 },
    );
  }

  // E6: resolve the artist's payout capability and fee BEFORE taking any money.
  // The old route charged the buyer and left the webhook with nothing to split,
  // so the artist was never paid.
  //
  // Selecting only columns that exist. `platformFeePercentForArtist` also reads
  // `free_until`, which is in no migration and not in the live table: naming it
  // here would make PostgREST reject the whole select, null the profile, and
  // (because the fee helper defaults a null profile to 15%) silently overcharge
  // every artist. See PROGRESS.md, that bug is live on the cart path today.
  const { data: artistProfile } = await db
    .from("artist_profiles")
    .select("slug, subscription_plan")
    .eq("user_id", offer.artist_user_id)
    .maybeSingle<{ slug: string; subscription_plan: string | null }>();

  if (!artistProfile) {
    return NextResponse.json({ error: "Artist profile unavailable" }, { status: 500 });
  }

  // Refuse to take the money if we cannot pay it out. Same primitive and the
  // same fail-closed behaviour as the cart checkout's pre-flight.
  if (!(await canArtistAcceptOrders(artistProfile.slug))) {
    return NextResponse.json(
      {
        error: "This artist isn't set up to receive payouts yet. Try again shortly.",
        reason: "payouts_unavailable",
      },
      { status: 422 },
    );
  }

  // Integer pence throughout, and the net is the remainder rather than a second
  // rounding, so fee + net is exactly the amount charged with no lost penny.
  const feePercent = platformFeePercentForArtist(artistProfile);
  const platformFeePence = Math.round(offer.amount_pence * (feePercent / 100));
  const artistNetPence = offer.amount_pence - platformFeePence;

  // Build a single-line Stripe session for the agreed amount. We intentionally
  // collapse the items into one line — the offer is an aggregate price, not a
  // line-by-line invoice.
  const requestOrigin = request.headers.get("origin");
  const origin = requestOrigin || process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";

  const description = offer.collection_id
    ? `Accepted offer for collection ${offer.collection_id}`
    : `Accepted offer for ${offer.work_ids.length} work${offer.work_ids.length === 1 ? "" : "s"}`;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: offer.buyer_email || auth.user!.email || undefined,
    line_items: [
      {
        price_data: {
          currency: offer.currency.toLowerCase(),
          product_data: {
            name: `Wallplace offer · ${offer.id}`,
            description,
          },
          unit_amount: offer.amount_pence,
        },
        quantity: 1,
      },
    ],
    metadata: {
      offer_id: offer.id,
      offer_buyer_user_id: offer.buyer_user_id,
      offer_artist_user_id: offer.artist_user_id,
      offer_artist_slug: offer.artist_slug || "",
      offer_work_ids: offer.work_ids.join(","),
      offer_collection_id: offer.collection_id || "",
      offer_amount_pence: String(offer.amount_pence),
      // E6: the split travels with the session so the webhook writes a complete
      // order instead of one with empty money columns.
      offer_platform_fee_pence: String(platformFeePence),
      offer_artist_net_pence: String(artistNetPence),
      offer_platform_fee_percent: String(feePercent),
      // orders.buyer_email is NOT NULL. The webhook used to fall back to
      // offer_buyer_user_id, which put a UUID in an email column.
      offer_buyer_email: offer.buyer_email || auth.user!.email || "",
      // Flag so the Stripe webhook knows to treat this differently from a
      // standard cart checkout — no shipping line, link back to the offer row.
      checkout_kind: "purchase_offer",
    },
    success_url: `${origin}/checkout/confirmation?session_id={CHECKOUT_SESSION_ID}&offer_id=${encodeURIComponent(offer.id)}`,
    cancel_url: `${origin}/customer-portal/offers`,
  });

  return NextResponse.json({ url: session.url });
}
