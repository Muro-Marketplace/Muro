import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { scheduleTransfer } from "@/lib/stripe-connect";
import { notifyArtistNewOrder, notifyVenueOrderFromPlacement, notifyCurationCustomerPaid } from "@/lib/email";
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

  // ─── Curation checkout ───
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.mode === "payment" && session.metadata?.kind === "curation_request") {
      const requestId = session.metadata.curation_request_id;
      if (requestId) {
        const paymentIntentId = typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id || "";
        const amountPaid = (session.amount_total || 0) / 100;
        const { data: existing } = await db
          .from("curation_requests")
          .select("id, tier, venue_name, contact_name, contact_email, status")
          .eq("id", requestId)
          .maybeSingle();

        if (existing && existing.status !== "paid" && existing.status !== "in_progress") {
          const { error: updErr } = await db
            .from("curation_requests")
            .update({
              status: "paid",
              stripe_payment_intent_id: paymentIntentId,
              amount_paid_gbp: amountPaid,
              paid_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", requestId);
          if (updErr) {
            console.error("curation_requests update error:", updErr);
            return NextResponse.json({ error: "DB update failed" }, { status: 500 });
          }
          if (existing.contact_email) {
            const tierLabels: Record<string, string> = {
              single_wall: "Single wall",
              full_space: "Full space",
              bespoke: "Bespoke project",
            };
            notifyCurationCustomerPaid({
              email: existing.contact_email,
              contactName: existing.contact_name,
              venueName: existing.venue_name,
              tierLabel: tierLabels[existing.tier] || existing.tier,
              amountGbp: amountPaid,
            }).catch(() => {});
          }
        }
      }
      return NextResponse.json({ received: true });
    }
  }

  // ─── Art purchase checkout ───
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    // Only process one-time payment checkouts (art purchases), not subscriptions
    if (session.mode === "payment") {
      try {
        // Stripe amount_total already includes shipping (added as line item in checkout)
        const total = (session.amount_total || 0) / 100;
        const cartItems = session.metadata?.cart_items ? JSON.parse(session.metadata.cart_items) : [];
        const subtotal = cartItems.reduce((sum: number, i: { price?: number; qty?: number }) => sum + (i.price || 0) * (i.qty || 1), 0) || total;
        const shippingCost = Math.max(0, total - subtotal);
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

        const paymentIntentId = typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id || "";

        const orderRow: Record<string, unknown> = {
          id: orderId,
          stripe_payment_intent_id: paymentIntentId,
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

        // F30 — idempotency: skip if we've already processed this payment intent.
        if (paymentIntentId) {
          const { data: existingOrder } = await db
            .from("orders")
            .select("id")
            .eq("stripe_payment_intent_id", paymentIntentId)
            .maybeSingle();
          if (existingOrder) {
            console.log("Webhook duplicate suppressed for payment_intent:", paymentIntentId);
            return NextResponse.json({ received: true, duplicate: true });
          }
        }

        // Try full insert, fall back to base if new columns don't exist
        let { error } = await db.from("orders").insert(orderRow);
        if (error) {
          // Unique-constraint violation = another concurrent delivery won the race.
          // Treat as success so Stripe doesn't keep retrying.
          if ((error as { code?: string }).code === "23505") {
            console.log("Order already exists (unique violation), treating webhook as processed");
            return NextResponse.json({ received: true, duplicate: true });
          }
          console.warn("Full order insert failed, trying base:", error.message);
          const baseRow = {
            id: orderId,
            stripe_payment_intent_id: paymentIntentId,
            buyer_email: orderRow.buyer_email,
            items: orderRow.items,
            shipping: orderRow.shipping,
            subtotal, shipping_cost: shippingCost, total,
            status: "confirmed",
            created_at: new Date().toISOString(),
          };
          const retry = await db.from("orders").insert(baseRow);
          error = retry.error;
          if (error && (error as { code?: string }).code === "23505") {
            return NextResponse.json({ received: true, duplicate: true });
          }
        }

        if (error) {
          // F31 — return non-200 so Stripe retries instead of silently dropping.
          console.error("Supabase order save error:", error);
          return NextResponse.json({ error: "DB save failed" }, { status: 500 });
        } else {
          // Decrement per-work quantity (F10). Best-effort: swallow any errors
          // so a DB hiccup here doesn't abort the rest of the order flow.
          try {
            type CartItem = { workId?: string; id?: string; qty?: number; quantity?: number };
            for (const item of cartItems as CartItem[]) {
              const workId = item.workId || item.id;
              const qty = Number(item.qty ?? item.quantity ?? 1);
              if (!workId || !Number.isFinite(qty) || qty <= 0) continue;

              const { data: work } = await db.from("artist_works")
                .select("quantity_available")
                .eq("id", workId)
                .single();
              const current = work?.quantity_available;
              if (typeof current === "number") {
                const next = Math.max(0, current - qty);
                const updates: Record<string, unknown> = { quantity_available: next };
                if (next === 0) updates.available = false;
                await db.from("artist_works").update(updates).eq("id", workId);
              }
            }
          } catch (err) {
            console.warn("Quantity decrement skipped:", err);
          }

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

          // ─── Stripe Connect transfers ───
          // Transfer venue revenue share
          if (venueSlug && venueRevenue > 0) {
            try {
              const { data: venueConnect } = await db
                .from("venue_profiles")
                .select("user_id, stripe_connect_account_id, stripe_connect_onboarding_complete")
                .eq("slug", venueSlug)
                .single();
              if (venueConnect?.stripe_connect_account_id && venueConnect.stripe_connect_onboarding_complete) {
                await scheduleTransfer({
                  orderId,
                  recipientType: "venue",
                  recipientUserId: venueConnect.user_id,
                  connectAccountId: venueConnect.stripe_connect_account_id,
                  amountCents: Math.round(venueRevenue * 100),
                });
              }
            } catch (transferErr) {
              console.error("Venue transfer error:", transferErr);
            }
          }

          // Transfer artist revenue
          if (artistUserId && artistRevenue > 0) {
            try {
              const { data: artistConnect } = await db
                .from("artist_profiles")
                .select("stripe_connect_account_id, stripe_connect_onboarding_complete")
                .eq("user_id", artistUserId)
                .single();
              if (artistConnect?.stripe_connect_account_id && artistConnect.stripe_connect_onboarding_complete) {
                await scheduleTransfer({
                  orderId,
                  recipientType: "artist",
                  recipientUserId: artistUserId,
                  connectAccountId: artistConnect.stripe_connect_account_id,
                  amountCents: Math.round(artistRevenue * 100),
                });
              }
            } catch (transferErr) {
              console.error("Artist transfer error:", transferErr);
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

    // If this was an upgrade, cancel the previous subscription now that the new one is active
    if (event.type === "customer.subscription.created") {
      const cancelPrevious = subscription.metadata?.cancel_previous;
      if (cancelPrevious && cancelPrevious !== subscription.id) {
        try {
          await stripe.subscriptions.cancel(cancelPrevious, { prorate: true });
        } catch (cancelErr) {
          console.error("Cancel previous subscription error:", cancelErr);
        }
      }
    }

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

  // ─── Invoice paid — recover past_due subscriptions ───
  if (event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = typeof invoice.customer === "string" ? invoice.customer : (invoice.customer as Stripe.Customer)?.id;

    if (customerId) {
      // Only recover if currently past_due
      const { data: profile } = await db
        .from("artist_profiles")
        .select("subscription_status")
        .eq("stripe_customer_id", customerId)
        .single();

      if (profile?.subscription_status === "past_due") {
        const { error } = await db
          .from("artist_profiles")
          .update({ subscription_status: "active" })
          .eq("stripe_customer_id", customerId);

        if (error) console.error("Invoice paid recovery error:", error);
      }
    }
  }

  // ─── Transfer reversed — mark payout as failed ───
  if (event.type === "transfer.reversed") {
    const transfer = event.data.object as Stripe.Transfer;

    const { error } = await db
      .from("stripe_transfers")
      .update({ status: "failed" })
      .eq("stripe_transfer_id", transfer.id);

    if (error) console.error("Transfer reversed update error:", error);
  }

  // ─── Connect account onboarding updates ───
  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account;
    const isComplete = account.charges_enabled && account.details_submitted;

    // Update whichever profile has this account ID
    await db
      .from("venue_profiles")
      .update({ stripe_connect_onboarding_complete: isComplete })
      .eq("stripe_connect_account_id", account.id);

    await db
      .from("artist_profiles")
      .update({ stripe_connect_onboarding_complete: isComplete })
      .eq("stripe_connect_account_id", account.id);
  }

  return NextResponse.json({ received: true });
}
