import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { notifyArtistNewOrder, notifyVenueOrderFromPlacement } from "@/lib/email";
import type Stripe from "stripe";

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET not configured");
      return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
    }
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const db = getSupabaseAdmin();

  // ─── Art purchase checkout ───
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    // Only process one-time payment checkouts (art purchases), not subscriptions
    if (session.mode === "payment") {
      try {
        const subtotal = (session.amount_total || 0) / 100;
        const shippingCost = subtotal >= 300 ? 0 : 9.95;
        const total = subtotal + shippingCost;
        const orderId = `WS-${session.id.slice(-8)}`;
        const source = session.metadata?.source || "direct";
        const venueSlug = session.metadata?.venue_slug || "";
        const artistSlugs = session.metadata?.artist_slugs || "";
        const firstArtistSlug = artistSlugs.split(",")[0] || "";

        // Compute revenue splits
        let venueRevSharePct = 0;
        let venueRevenue = 0;
        let platformFeePct = 10; // Default Core plan fee
        let platformFee = 0;
        let artistRevenue = 0;
        let placementId: string | null = null;
        let artistUserId: string | null = null;

        // Look up artist profile for subscription plan (fee rate)
        if (firstArtistSlug) {
          const { data: ap } = await db.from("artist_profiles").select("user_id, subscription_plan, free_until").eq("slug", firstArtistSlug).single();
          if (ap) {
            artistUserId = ap.user_id;
            // Check if artist is in free period (founding artist or trial)
            const isFree = ap.free_until && new Date(ap.free_until) > new Date();
            if (isFree) {
              platformFeePct = 0; // No platform fee during free period
            } else {
              const planFees: Record<string, number> = { core: 15, premium: 8, pro: 3 };
              platformFeePct = planFees[ap.subscription_plan || "core"] || 15;
            }
          }
        }

        // Look up venue placement for revenue share
        if (venueSlug && firstArtistSlug) {
          const { data: placement } = await db.from("placements")
            .select("id, revenue_share_percent")
            .eq("artist_slug", firstArtistSlug)
            .eq("venue_slug", venueSlug)
            .eq("status", "active")
            .limit(1)
            .single();
          if (placement) {
            placementId = placement.id;
            venueRevSharePct = placement.revenue_share_percent || 0;
          }
        }

        // Calculate splits
        venueRevenue = Math.round(total * (venueRevSharePct / 100) * 100) / 100;
        platformFee = Math.round(total * (platformFeePct / 100) * 100) / 100;
        artistRevenue = Math.round((total - venueRevenue - platformFee) * 100) / 100;

        const orderRow: Record<string, unknown> = {
          id: orderId,
          buyer_email: session.customer_email || session.metadata?.shipping_email || "",
          items: session.metadata?.cart_items ? JSON.parse(session.metadata.cart_items) : [],
          shipping: {
            fullName: session.metadata?.shipping_name || "",
            email: session.metadata?.shipping_email || "",
            phone: session.metadata?.shipping_phone || "",
            addressLine1: session.metadata?.shipping_address1 || "",
            addressLine2: session.metadata?.shipping_address2 || "",
            city: session.metadata?.shipping_city || "",
            postcode: session.metadata?.shipping_postcode || "",
            country: session.metadata?.shipping_country || "United Kingdom",
            notes: session.metadata?.shipping_notes || "",
          },
          subtotal,
          shipping_cost: shippingCost,
          total,
          status: "confirmed",
          status_history: JSON.stringify([{ status: "confirmed", timestamp: new Date().toISOString() }]),
          source,
          artist_slug: firstArtistSlug || null,
          artist_user_id: artistUserId,
          venue_slug: venueSlug || null,
          venue_revenue_share_percent: venueRevSharePct,
          venue_revenue: venueRevenue,
          artist_revenue: artistRevenue,
          platform_fee_percent: platformFeePct,
          platform_fee: platformFee,
          placement_id: placementId,
          created_at: new Date().toISOString(),
        };

        // Try full insert, fall back to base if new columns don't exist
        let { error } = await db.from("orders").insert(orderRow);
        if (error) {
          console.warn("Full order insert failed, trying base:", error.message);
          const baseRow = {
            id: orderId,
            buyer_email: orderRow.buyer_email,
            items: orderRow.items,
            shipping: orderRow.shipping,
            subtotal, shipping_cost: shippingCost, total,
            status: "confirmed",
            created_at: new Date().toISOString(),
          };
          const retry = await db.from("orders").insert(baseRow);
          error = retry.error;
        }

        if (error) {
          console.error("Supabase order save error:", error);
        } else {
          // Notify artist (fire-and-forget)
          if (artistUserId) {
            const { data: { user: artistUser } } = await db.auth.admin.getUserById(artistUserId);
            const { data: artistProfile } = await db.from("artist_profiles").select("name").eq("user_id", artistUserId).single();
            if (artistUser?.email && artistProfile) {
              const cartItems = session.metadata?.cart_items ? JSON.parse(session.metadata.cart_items) : [];
              const firstItem = cartItems[0]?.title || "Artwork";
              notifyArtistNewOrder({ email: artistUser.email, artistName: artistProfile.name, orderId, itemTitle: firstItem, total, artistRevenue }).catch((err) => { if (err) console.error("Fire-and-forget error:", err); });
            }
          }
          // Notify venue if revenue share exists
          if (venueSlug && venueRevenue > 0) {
            const { data: vp } = await db.from("venue_profiles").select("user_id, name").eq("slug", venueSlug).single();
            if (vp?.user_id) {
              const { data: { user: venueUser } } = await db.auth.admin.getUserById(vp.user_id);
              const { data: ap } = await db.from("artist_profiles").select("name").eq("slug", firstArtistSlug).single();
              if (venueUser?.email) {
                const cartItems = session.metadata?.cart_items ? JSON.parse(session.metadata.cart_items) : [];
                notifyVenueOrderFromPlacement({ email: venueUser.email, venueName: vp.name, artistName: ap?.name || firstArtistSlug, itemTitle: cartItems[0]?.title || "Artwork", total, venueRevenue }).catch((err) => { if (err) console.error("Fire-and-forget error:", err); });
              }
            }
          }
        }
      } catch (err) {
        console.error("Order processing error:", err);
      }
    }
  }

  // ─── Subscription events ───
  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
    const priceId = subscription.items.data[0]?.price?.id || "";

    // Map price ID to plan name
    let plan = "core";
    if (priceId === process.env.STRIPE_PRICE_PREMIUM) plan = "premium";
    else if (priceId === process.env.STRIPE_PRICE_PRO) plan = "pro";

    const { error } = await db
      .from("artist_profiles")
      .update({
        stripe_subscription_id: subscription.id,
        subscription_status: subscription.status === "trialing" ? "trialing" : subscription.status,
        subscription_plan: plan,
        subscription_period_end: new Date((subscription.items.data[0]?.current_period_end ?? 0) * 1000).toISOString(),
        trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
      })
      .eq("stripe_customer_id", customerId);

    if (error) console.error("Subscription update error:", error);
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

    const { error } = await db
      .from("artist_profiles")
      .update({ subscription_status: "canceled" })
      .eq("stripe_customer_id", customerId);

    if (error) console.error("Subscription delete error:", error);
  }

  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = typeof invoice.customer === "string" ? invoice.customer : (invoice.customer as Stripe.Customer)?.id;

    if (customerId) {
      const { error } = await db
        .from("artist_profiles")
        .update({ subscription_status: "past_due" })
        .eq("stripe_customer_id", customerId);

      if (error) console.error("Payment failed update error:", error);
    }
  }

  return NextResponse.json({ received: true });
}
