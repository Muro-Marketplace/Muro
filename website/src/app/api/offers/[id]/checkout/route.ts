// POST /api/offers/[id]/checkout
//
// Buyer (the venue) completes payment on an accepted offer. Creates a
// Stripe Checkout Session at the agreed amount. The webhook flips the
// offer to 'paid' and threads the resulting order id back.

import type Stripe from "stripe";
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { COUNTRIES } from "@/lib/iso-countries";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { assertNotDemoStrict } from "@/lib/demo-guard";
import { platformFeePercentForArtist } from "@/lib/platform-fee";
import { canReceivePayout } from "@/lib/payouts/capability";
import { isWorkSold } from "@/lib/work-stock";
import { isOfferUnpayableAfterExpiry } from "@/lib/offers/expiry";

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
  /** F41: the response window. Read by isOfferUnpayableAfterExpiry below. */
  expires_at: string | null;
  accepted_at: string | null;
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

  // F41. `expires_at` was stored and read by nothing, so an offer whose window
  // had closed could still be paid for. The deadline governs the window to
  // RESPOND, not the window to pay, so a deal accepted while the offer was live
  // stays payable afterwards; what this stops is a row that ran past its
  // deadline unaccepted, or one accepted after it lapsed (the PATCH had no gate
  // until now, so those rows exist).
  if (isOfferUnpayableAfterExpiry(offer)) {
    await db
      .from("purchase_offers")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", offer.id)
      .eq("status", "accepted");
    return NextResponse.json(
      {
        error: "This offer passed its deadline before it was accepted, so it has been closed.",
        code: "offer_expired",
      },
      { status: 409 },
    );
  }

  // F49, the far end of the same hole. The legacy existing_works fulfil branch
  // priced an offer as `?? 0`, and this route built the Stripe line straight
  // from amount_pence with no positive-amount guard. Stripe would very likely
  // refuse the zero-value session, but the failure would surface as a raw
  // gateway error rather than something the venue can act on, and the guard has
  // to exist here regardless because the bad rows predate the fulfil fix.
  if (!Number.isFinite(offer.amount_pence) || offer.amount_pence <= 0) {
    return NextResponse.json(
      {
        error: "This offer has no amount on it, so there's nothing to pay. Ask the artist to send a priced offer.",
        code: "offer_not_priced",
      },
      { status: 422 },
    );
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

  // Row 2245: kept so the Stripe page can name what the buyer is paying for.
  // It read "Wallplace offer · off_1788192000823_qyzr33" and "Accepted offer
  // for 1 work", which identifies the row and not the artwork.
  let workTitles: string[] = [];
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
    workTitles = found.map((w) => (w.title || "").trim()).filter(Boolean);
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
  // Select every column platformFeePercentForArtist reads: subscription_plan AND
  // subscription_status (D40/E52 — the discount only applies while the sub is
  // active/trialing). Omitting subscription_status would hand the helper undefined
  // and over-charge an active artist the 15% default. trial_end is intentionally
  // not selected here: offers have never honoured the trial 0% window, and adding
  // it would change what trialing artists are charged on offers. `free_until`
  // (migration 115, the referral reward) is excluded for the same reason and by
  // the same logic: this route's fee behaviour is pinned, and widening the
  // reward to offers is a separate decision from creating the column.
  const { data: artistProfile } = await db
    .from("artist_profiles")
    .select("slug, subscription_plan, subscription_status, ships_internationally")
    .eq("user_id", offer.artist_user_id)
    .maybeSingle<{
      slug: string;
      subscription_plan: string | null;
      subscription_status: string | null;
      ships_internationally: boolean | null;
    }>();

  if (!artistProfile) {
    return NextResponse.json({ error: "Artist profile unavailable" }, { status: 500 });
  }

  // Refuse to take the money if we cannot pay it out. Same primitive and the
  // same fail-closed behaviour as the cart checkout's pre-flight.
  if (!(await canReceivePayout(db, { kind: "artist", slug: artistProfile.slug })).ok) {
    return NextResponse.json(
      {
        error: "This artist isn't set up to receive payouts yet. Try again shortly.",
        reason: "payouts_unavailable",
      },
      { status: 422 },
    );
  }

  // Venue share on offers (owner decision 2026-08-28): a work hanging on a
  // venue's wall earns that venue its placement share on ANY platform sale of
  // the work, offers included. Resolved from the works' own placements
  // (current_placement_id), the same source of truth the cart path uses
  // (payouts/legs.ts). Applied only when every offered work sits on ONE
  // active placement; a mixed-venue or unplaced offer pays no share, matching
  // prior behaviour. `workIds` is already fully resolved here (direct offer
  // or collection offer, both branches above land on the same variable).
  let venueShare: { venueSlug: string; venueUserId: string; percent: number; placementId: string } | null = null;
  if (workIds.length > 0) {
    const { data: shareWorks } = await db
      .from("artist_works")
      .select("id, current_placement_id")
      .in("id", workIds);
    const worksForShare = (shareWorks || []) as Array<{ current_placement_id: string | null }>;
    const placementIds = [
      ...new Set(worksForShare.map((w) => w.current_placement_id).filter((v): v is string => !!v)),
    ];
    const allPlaced =
      worksForShare.length === workIds.length && worksForShare.every((w) => w.current_placement_id);
    if (allPlaced && placementIds.length === 1) {
      const { data: pl } = await db
        .from("placements")
        .select("id, venue_slug, venue_user_id, revenue_share_percent, status")
        .eq("id", placementIds[0])
        .eq("status", "active")
        .maybeSingle<{
          venue_slug: string | null;
          venue_user_id: string | null;
          revenue_share_percent: number | null;
        }>();
      const percent = Math.max(0, Number(pl?.revenue_share_percent || 0));
      if (pl?.venue_slug && pl.venue_user_id && percent > 0) {
        venueShare = { venueSlug: pl.venue_slug, venueUserId: pl.venue_user_id, percent, placementId: placementIds[0] };
      }
    }
  }

  // Integer pence throughout, and the net is the remainder rather than a second
  // rounding, so fee + venue cut + net is exactly the amount charged with no
  // lost penny. Both the fee and the venue cut come off the artist's side.
  const feePercent = platformFeePercentForArtist(artistProfile);
  const platformFeePence = Math.round(offer.amount_pence * (feePercent / 100));
  const venueCutPence = venueShare
    ? Math.round(offer.amount_pence * (venueShare.percent / 100))
    : 0;
  const artistNetPence = offer.amount_pence - platformFeePence - venueCutPence;

  // Build a single-line Stripe session for the agreed amount. We intentionally
  // collapse the items into one line — the offer is an aggregate price, not a
  // line-by-line invoice.
  const requestOrigin = request.headers.get("origin");
  const origin = requestOrigin || process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";

  // Rows 933-939, 2245. The buyer's Stripe page said "Wallplace offer ·
  // off_1788192000823_qyzr33" and "Accepted offer for 1 work": the offer's row
  // id and a count, telling them nothing about what they were buying. The
  // titles are already loaded above for the sold-out check.
  const titleList = workTitles.join(", ");
  const productName = titleList
    ? `${titleList} by ${offer.artist_slug ?? "the artist"}`
    : `Wallplace offer · ${offer.id}`;
  const description = offer.collection_id
    ? `Accepted offer for collection ${offer.collection_id}`
    : titleList
      ? `Accepted offer for ${titleList}`
      : `Accepted offer for ${offer.work_ids.length} work${offer.work_ids.length === 1 ? "" : "s"}`;

  // Rows 933-939. The offer flow collected no delivery address anywhere, so the
  // order it produced carried an empty shipping block and the artist was shown
  // "SHIP TO: ," above a live "Mark as Shipped" button. Collect it on the
  // Stripe page the buyer is already standing on rather than rebuilding the
  // cart path's address form: Stripe's is localised, validated and familiar.
  //
  // Destinations follow the ARTIST's own scope, the same fail-closed rule
  // lib/shipping-scope.ts applies to the cart: an artist who has not opted in
  // to international shipping can only be sent a UK address, because we cannot
  // confirm consent to ship anywhere else.
  const allowedCountries = artistProfile.ships_internationally
    ? COUNTRIES.map((c) => c.code)
    : ["GB"];

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: offer.buyer_email || auth.user!.email || undefined,
    shipping_address_collection: {
      // COUNTRIES is the project's own ISO-3166 alpha-2 list (lib/iso-countries),
      // the same one the cart's country picker renders from. Stripe types this
      // as a closed union of every code it accepts; ours is a subset of it.
      allowed_countries:
        allowedCountries as NonNullable<
          Stripe.Checkout.SessionCreateParams["shipping_address_collection"]
        >["allowed_countries"],
    },
    line_items: [
      {
        price_data: {
          currency: offer.currency.toLowerCase(),
          product_data: {
            name: productName,
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
      // Venue share (Task 5): empty string / "0", not omitted, when no share
      // applies — Stripe metadata values must be strings, and the webhook
      // reads these unconditionally.
      offer_venue_slug: venueShare?.venueSlug || "",
      offer_venue_user_id: venueShare?.venueUserId || "",
      offer_venue_cut_pence: String(venueCutPence),
      offer_venue_share_percent: String(venueShare?.percent || 0),
      // Finding 3 (final review): the single active placement id the share
      // above was resolved from, so the webhook can stamp orders.placement_id
      // and this offer's earnings show up on the venue's placement card,
      // which sums by that column. Empty string, not omitted, when no share
      // applies, matching the other offer_venue_* keys.
      offer_placement_id: venueShare?.placementId || "",
      // orders.buyer_email is NOT NULL. The webhook used to fall back to
      // offer_buyer_user_id, which put a UUID in an email column.
      offer_buyer_email: offer.buyer_email || auth.user!.email || "",
      // Row 933-939 / P4. `orders.items` for an offer was
      // {offer_id, work_ids, collection_id} with no title and no price, so the
      // artist portal rendered "Artwork × 1, £0.00". The titles are already
      // resolved above for the sold-out check; carry them so the webhook can
      // write a line a person can read. Stripe caps a metadata value at 500
      // characters, hence the trim.
      offer_work_titles: titleList.slice(0, 480),
      // Flag so the Stripe webhook knows to treat this differently from a
      // standard cart checkout — no shipping line, link back to the offer row.
      checkout_kind: "purchase_offer",
    },
    success_url: `${origin}/checkout/confirmation?session_id={CHECKOUT_SESSION_ID}&offer_id=${encodeURIComponent(offer.id)}`,
    // B31/F42: the payer on an offer is a venue and their offers live at
    // /venue-portal/offers. The old /customer-portal/offers has never
    // existed, so backing out of Stripe landed mid-payment on a 404.
    cancel_url: `${origin}/venue-portal/offers`,
  });

  return NextResponse.json({ url: session.url });
}
