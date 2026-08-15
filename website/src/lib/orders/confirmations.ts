// Order confirmations: the lifecycle event, the buyer receipt, the artist's two
// emails and the in-app notifications that follow a paid order.
//
// Extracted from the Stripe webhook's cart branch (T3 / E6 part 3). It lived
// inline there, so the purchase-offer branch, written later, sent nothing at all:
// an artist could sell a piece through an accepted offer and never hear about it,
// and the buyer got no receipt, which UK consumer contract rules require. Having
// one copy is the point. A second inline copy in the offer branch would drift the
// same way the first one did.
//
// The caller supplies display-ready items. Resolving cart lines into titles,
// artist names and images is the cart branch's job (it has the cart row and the
// slug map), and the offer branch's aggregate single line is a different shape
// entirely. Persisting those items back onto the order row is also left to the
// caller: on an offer, orders.items carries the offer_id linkage and must not be
// overwritten with display rows.

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/send";
import { createNotification } from "@/lib/notifications";
import { recordOrderEvent } from "@/lib/orders/lifecycle";
import { signOrderToken } from "@/lib/order-tracking-token";
import { notifyVenueOrderFromPlacement } from "@/lib/email";
import { CustomerOrderReceipt } from "@/emails/templates/orders/CustomerOrderReceipt";
import { ArtistWorkSold } from "@/emails/templates/orders/ArtistWorkSold";
import { ArtistOrderConfirmation } from "@/emails/templates/orders/ArtistOrderConfirmation";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";

/** A line as the email templates want it. Money is integer pence. */
export type OrderEmailItem = {
  title: string;
  artistName: string;
  quantity: number;
  size?: string;
  image: string;
  lineTotal: { amount: number; currency: "GBP" };
  /**
   * The work id, carried through from the cart so the persisted order row can be
   * restocked on a full refund (D17). Optional: the email templates ignore it,
   * and legacy orders persisted before this field never had it.
   */
  workId?: string;
};

export type OrderConfirmationInput = {
  orderId: string;
  /** Drives every idempotency key, so a Stripe retry cannot double-send. */
  paymentIntentId: string | null;
  buyerEmail: string | null;
  /**
   * The buyer's name as captured, or "" when none was. Pass it raw: the
   * fallbacks differ per use and are applied below, because the buyer receipt
   * greets "there" while the artist's email says "your buyer".
   */
  buyerName: string;
  items: OrderEmailItem[];
  /** GBP, as stored on the order row. */
  subtotal: number;
  shippingCost: number;
  total: number;
  address: {
    line1: string;
    line2?: string;
    city: string;
    postcode: string;
    country: string;
  };
  artistUserId: string | null;
  /** GBP the artist nets, shown in the sale email. */
  artistRevenue: number;
  firstItemTitle: string;
  /** Recorded on the lifecycle event for traceability. */
  stripeSessionId?: string | null;
  /** Only when a placement earned the venue a share. */
  venue?: {
    slug: string;
    revenue: number;
    /** Slug used to name the artist in the venue's email. */
    artistSlug: string;
  } | null;
};

/**
 * Fire everything a newly paid order owes its participants. Every step is
 * best-effort and isolated: a failed artist email must not cost the buyer their
 * receipt, and none of it should unwind a payment that has already been taken.
 */
export async function sendOrderConfirmations(
  db: SupabaseClient,
  input: OrderConfirmationInput,
): Promise<void> {
  const {
    orderId, paymentIntentId, buyerEmail, buyerName, items,
    subtotal, shippingCost, total, address,
    artistUserId, artistRevenue, firstItemTitle, stripeSessionId, venue,
  } = input;

  // 09 item 1.3. ONE email per recipient. This used to record the event (which
  // dispatches customer_order_placed + artist_order_received) and THEN send three
  // more templates inline, so a single checkout put 2 emails in the buyer's inbox
  // and 3 in the artist's, all saying the same thing. The inline sends are gone;
  // everything they carried is now in this payload, and each template reads only
  // the props it declares (dispatcher.ts spreads `data` into createElement).

  // Signed token bound to {orderId, email} so /orders/track can authenticate the
  // lookup without trusting a bare email match. Best-effort: with no secret
  // configured the email still goes, just without the link.
  let trackingToken: string | undefined;
  if (buyerEmail) {
    try {
      trackingToken = await signOrderToken({ orderId, email: buyerEmail });
    } catch (err) {
      console.warn("[confirmations] signOrderToken failed:", err);
    }
  }
  const receiptName = buyerName || "there";
  const postal = {
    name: receiptName,
    line1: address.line1,
    line2: address.line2 || undefined,
    city: address.city,
    postcode: address.postcode,
    country: address.country,
  };

  // J1 (Phase 2.3): the order.placed event and its Phase 2.0c dispatch.
  try {
    let artistEmail: string | null = null;
    let artistFirstName = "there";
    if (artistUserId) {
      const { data: artistAuth } = await db.auth.admin.getUserById(artistUserId);
      artistEmail = artistAuth.user?.email ?? null;
      const { data: ap } = await db
        .from("artist_profiles").select("name").eq("user_id", artistUserId).single();
      if (ap?.name) artistFirstName = ap.name.split(" ")[0];
    }
    await recordOrderEvent({
      orderId,
      newStatus: "confirmed",
      buyerEmail: buyerEmail ?? null,
      artistEmail,
      data: {
        // customer_order_placed
        firstName: receiptName.split(" ")[0] || "there",
        orderNumber: orderId,
        orderUrl: `${SITE}/orders/${orderId}`,
        orderDate: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
        trackingToken,
        items,
        subtotal: { amount: Math.round(subtotal * 100), currency: "GBP" },
        shipping: { amount: Math.round(shippingCost * 100), currency: "GBP" },
        total: { amount: Math.round(total * 100), currency: "GBP" },
        billingAddress: postal,
        shippingAddress: postal,
        supportUrl: `${SITE}/support`,
        // artist_order_received. firstName is shared, so the artist's own name
        // is passed under the key its template reads.
        workTitle: firstItemTitle,
        buyerFirstName: (buyerName || "your buyer").split(" ")[0],
        saleAmount: { amount: Math.round(artistRevenue * 100), currency: "GBP" },
        artistFirstName,
      },
      metadata: { stripe_session_id: stripeSessionId ?? null, payment_intent: paymentIntentId ?? null },
    });
  } catch (lifecycleErr) {
    console.error("[confirmations] lifecycle hook:", lifecycleErr);
  }

  // 09 item 1.3. The buyer's customer_order_receipt and the artist's
  // artist_work_sold + artist_order_confirmation used to be sent here, on top of
  // the two the event dispatch above already sends. All three are retired: the
  // buyer's receipt content (items, totals, billing address, tracking token) and
  // the artist's sale amount now ride on customer_order_placed and
  // artist_order_received respectively. The in-app bell below is unaffected.
  if (artistUserId) {
    createNotification({
      userId: artistUserId,
      kind: "sale",
      title: "Your artwork sold",
      body: `${firstItemTitle}, £${artistRevenue.toFixed(2)} to you (${orderId})`,
      link: "/artist-portal/orders",
    }).catch(() => {});
  }

  // Notify the venue when a revenue share applies, email plus in-app bell.
  if (venue && venue.revenue > 0) {
    const { data: vp } = await db
      .from("venue_profiles").select("user_id, name").eq("slug", venue.slug).single();
    if (vp?.user_id) {
      const { data: { user: venueUser } } = await db.auth.admin.getUserById(vp.user_id);
      const { data: ap } = await db
        .from("artist_profiles").select("name").eq("slug", venue.artistSlug).single();
      if (venueUser?.email) {
        await notifyVenueOrderFromPlacement({
          email: venueUser.email,
          venueName: vp.name,
          artistName: ap?.name || venue.artistSlug,
          itemTitle: firstItemTitle,
          total,
          venueRevenue: venue.revenue,
        }).catch((err) => { if (err) console.error("notifyVenueOrderFromPlacement error:", err); });
      }
      createNotification({
        userId: vp.user_id,
        kind: "sale",
        title: "Placement sale",
        body: `${firstItemTitle} sold, £${venue.revenue.toFixed(2)} to your venue (${orderId})`,
        link: "/venue-portal/orders",
      }).catch(() => {});
    }
  }
}
