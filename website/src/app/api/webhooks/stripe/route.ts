import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { scheduleTransfer } from "@/lib/stripe-connect";
import { notifyArtistNewOrder, notifyVenueOrderFromPlacement, notifyCurationCustomerPaid } from "@/lib/email";
import { createNotification } from "@/lib/notifications";
import { sendEmail } from "@/lib/email/send";
import { CustomerOrderReceipt } from "@/emails/templates/orders/CustomerOrderReceipt";
import { ArtistOrderConfirmation } from "@/emails/templates/orders/ArtistOrderConfirmation";
import { ArtistWorkSold } from "@/emails/templates/orders/ArtistWorkSold";
import { ArtistPayoutSent } from "@/emails/templates/payments/ArtistPayoutSent";
import { ArtistPayoutFailed } from "@/emails/templates/payments/ArtistPayoutFailed";
import { SubscriptionPaymentFailed } from "@/emails/templates/payments/SubscriptionPaymentFailed";
import { SubscriptionTrialEnding } from "@/emails/templates/payments/SubscriptionTrialEnding";
import { SubscriptionUpgraded } from "@/emails/templates/payments/SubscriptionUpgraded";
import { SubscriptionCancelled } from "@/emails/templates/payments/SubscriptionCancelled";
import { SubscriptionRenewalReceipt } from "@/emails/templates/payments/SubscriptionRenewalReceipt";
import { ArtistStripeKycNeeded } from "@/emails/templates/artist-additions/ArtistStripeKycNeeded";
import { platformFeePercentForArtist, DEFAULT_PLAN_FEE_PERCENT } from "@/lib/platform-fee";
import type Stripe from "stripe";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";

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

  // ─── Curation checkout (one-off OR managed subscription) ───
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.kind === "curation_request") {
      const requestId = session.metadata.curation_request_id;
      if (requestId) {
        const isSubscription = session.mode === "subscription";
        const paymentIntentId = typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id || "";
        const subscriptionId = typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id || "";
        const amountPaid = (session.amount_total || 0) / 100;
        const { data: existing } = await db
          .from("curation_requests")
          .select("id, tier, venue_name, contact_name, contact_email, status")
          .eq("id", requestId)
          .maybeSingle();

        if (existing && existing.status !== "paid" && existing.status !== "in_progress") {
          // Managed subscription → "in_progress" (ongoing service). One-off → "paid".
          const newStatus = isSubscription ? "in_progress" : "paid";
          const { error: updErr } = await db
            .from("curation_requests")
            .update({
              status: newStatus,
              stripe_payment_intent_id: paymentIntentId || subscriptionId,
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
              managed_monthly: "Managed — monthly rotation",
              managed_quarterly: "Managed — quarterly refresh",
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
        let platformFeePct = DEFAULT_PLAN_FEE_PERCENT; // Default Core plan fee
        let platformFee = 0;
        let artistRevenue = 0;
        let placementId: string | null = null;
        let artistUserId: string | null = null;

        // Look up artist profile for subscription plan (fee rate)
        if (firstArtistSlug) {
          const { data: ap } = await db.from("artist_profiles").select("user_id, subscription_plan, free_until").eq("slug", firstArtistSlug).single();
          if (ap) {
            artistUserId = ap.user_id;
            platformFeePct = platformFeePercentForArtist(ap);
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

        // Calculate splits. Platform fee and venue revenue are computed on
        // the subtotal (artwork value only) — shipping is not subject to
        // the cut and flows straight through to the artist, who pays the
        // courier out of pocket.
        venueRevenue = Math.round(subtotal * (venueRevSharePct / 100) * 100) / 100;
        platformFee = Math.round(subtotal * (platformFeePct / 100) * 100) / 100;
        artistRevenue = Math.round((subtotal - venueRevenue - platformFee + shippingCost) * 100) / 100;

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

          const cartItemsForNotify = session.metadata?.cart_items ? JSON.parse(session.metadata.cart_items) : [];
          const firstItemTitle = cartItemsForNotify[0]?.title || "Artwork";

          // Customer order receipt (legally required under CCR 2013).
          // Keyed by payment_intent so Stripe retries don't double-send.
          const buyerEmail = session.customer_email || session.metadata?.shipping_email;
          if (buyerEmail) {
            const buyerName = session.metadata?.shipping_name || "there";
            // Adapt the cart items shape to the OrderSummary component.
            const orderItems = (cartItemsForNotify as Array<{
              title?: string; artistName?: string; qty?: number; quantity?: number; size?: string; image?: string; price?: number;
            }>).map((item) => ({
              title: item.title || "Artwork",
              artistName: item.artistName || firstArtistSlug || "Artist",
              quantity: Number(item.qty ?? item.quantity ?? 1),
              size: item.size,
              image: item.image || `${SITE}/placeholder-work.jpg`,
              lineTotal: {
                amount: Math.round((item.price ?? 0) * Number(item.qty ?? item.quantity ?? 1) * 100),
                currency: "GBP" as const,
              },
            }));
            await sendEmail({
              idempotencyKey: `order_receipt:${paymentIntentId || orderId}`,
              template: "customer_order_receipt",
              category: "orders_and_payouts",
              to: buyerEmail,
              subject: `Your Wallplace order ${orderId}`,
              react: CustomerOrderReceipt({
                firstName: buyerName.split(" ")[0] || "there",
                orderNumber: orderId,
                orderUrl: `${SITE}/orders/${orderId}`,
                orderDate: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
                items: orderItems,
                subtotal: { amount: Math.round(subtotal * 100), currency: "GBP" },
                shipping: { amount: Math.round(shippingCost * 100), currency: "GBP" },
                total: { amount: Math.round(total * 100), currency: "GBP" },
                billingAddress: {
                  name: buyerName,
                  line1: session.metadata?.shipping_address1 || "",
                  line2: session.metadata?.shipping_address2 || undefined,
                  city: session.metadata?.shipping_city || "",
                  postcode: session.metadata?.shipping_postcode || "",
                  country: session.metadata?.shipping_country || "United Kingdom",
                },
                shippingAddress: {
                  name: buyerName,
                  line1: session.metadata?.shipping_address1 || "",
                  line2: session.metadata?.shipping_address2 || undefined,
                  city: session.metadata?.shipping_city || "",
                  postcode: session.metadata?.shipping_postcode || "",
                  country: session.metadata?.shipping_country || "United Kingdom",
                },
                supportUrl: `${SITE}/support`,
              }),
              metadata: { orderId, paymentIntentId },
            });
          }

          // Notify artist — email + in-app bell notification.
          if (artistUserId) {
            const { data: { user: artistUser } } = await db.auth.admin.getUserById(artistUserId);
            const { data: artistProfile } = await db.from("artist_profiles").select("name").eq("user_id", artistUserId).single();
            if (artistUser?.email && artistProfile) {
              // Two emails to the artist: the celebration ("you made a sale")
              // and the operational receipt (order confirmation). They serve
              // different purposes — the first is emotional, the second
              // itemised and record-worthy. Idempotency keys are distinct.
              await sendEmail({
                idempotencyKey: `artist_work_sold:${paymentIntentId || orderId}`,
                template: "artist_work_sold",
                category: "orders_and_payouts",
                to: artistUser.email,
                subject: `You made a sale — ${firstItemTitle}`,
                userId: artistUserId,
                react: ArtistWorkSold({
                  firstName: (artistProfile.name || "there").split(" ")[0],
                  workTitle: firstItemTitle,
                  orderNumber: orderId,
                  saleAmount: { amount: Math.round(artistRevenue * 100), currency: "GBP" },
                  nextSteps: [
                    "Pack the piece securely (packing guidelines in the portal)",
                    "Print the shipping label we've generated",
                    "Drop off or arrange collection within 3 business days",
                  ],
                  orderUrl: `${SITE}/artist-portal/orders/${orderId}`,
                  shippingInstructionsUrl: `${SITE}/artist-portal/orders/${orderId}/ship`,
                }),
                metadata: { orderId, paymentIntentId },
              });
              await sendEmail({
                idempotencyKey: `artist_order_confirmation:${paymentIntentId || orderId}`,
                template: "artist_order_confirmation",
                category: "orders_and_payouts",
                to: artistUser.email,
                subject: `Order ${orderId} — ${firstItemTitle}`,
                userId: artistUserId,
                react: ArtistOrderConfirmation({
                  firstName: (artistProfile.name || "there").split(" ")[0],
                  orderNumber: orderId,
                  workTitle: firstItemTitle,
                  buyerFirstName: (session.metadata?.shipping_name || "your buyer").split(" ")[0],
                  orderUrl: `${SITE}/artist-portal/orders/${orderId}`,
                  nextSteps: [
                    "Ship within 3 business days",
                    "Mark as shipped in the portal",
                    "Payout lands 2 business days after delivery",
                  ],
                }),
                metadata: { orderId, paymentIntentId },
              });
              // Legacy helper is a no-op now — the new pipeline covers it.
              void notifyArtistNewOrder;
            }
            // In-app sale notification, deep-linked to the artist orders
            // page so they can acknowledge the sale and start fulfilment.
            createNotification({
              userId: artistUserId,
              kind: "sale",
              title: "Your artwork sold",
              body: `${firstItemTitle} — £${artistRevenue.toFixed(2)} to you (${orderId})`,
              link: "/artist-portal/orders",
            }).catch(() => {});
          }
          // Notify venue if revenue share exists — email + in-app bell.
          if (venueSlug && venueRevenue > 0) {
            const { data: vp } = await db.from("venue_profiles").select("user_id, name").eq("slug", venueSlug).single();
            if (vp?.user_id) {
              const { data: { user: venueUser } } = await db.auth.admin.getUserById(vp.user_id);
              const { data: ap } = await db.from("artist_profiles").select("name").eq("slug", firstArtistSlug).single();
              if (venueUser?.email) {
                notifyVenueOrderFromPlacement({ email: venueUser.email, venueName: vp.name, artistName: ap?.name || firstArtistSlug, itemTitle: firstItemTitle, total, venueRevenue }).catch((err) => { if (err) console.error("Fire-and-forget error:", err); });
              }
              createNotification({
                userId: vp.user_id,
                kind: "sale",
                title: "Placement sale",
                body: `${firstItemTitle} sold — £${venueRevenue.toFixed(2)} to your venue (${orderId})`,
                link: "/venue-portal/orders",
              }).catch(() => {});
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

    // Map price ID to plan name (monthly + annual variants both normalise to
    // the same plan name; billing cycle is reflected in Stripe itself).
    let plan = "core";
    if (priceId === process.env.STRIPE_PRICE_PREMIUM || priceId === process.env.STRIPE_PRICE_PREMIUM_ANNUAL) plan = "premium";
    else if (priceId === process.env.STRIPE_PRICE_PRO || priceId === process.env.STRIPE_PRICE_PRO_ANNUAL) plan = "pro";
    else if (priceId === process.env.STRIPE_PRICE_CORE || priceId === process.env.STRIPE_PRICE_CORE_ANNUAL) plan = "core";

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

    // ─── Upgraded email (plan changed) ───
    // Stripe's `customer.subscription.updated` fires for a lot of reasons
    // (renewal, status tick, cancel-at-period-end, plan change). We only
    // want to email on a real plan change, so compare previous plan in DB.
    if (event.type === "customer.subscription.updated") {
      try {
        const { data: profile } = await db
          .from("artist_profiles")
          .select("user_id, name, subscription_plan")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();
        if (profile && profile.user_id && profile.subscription_plan && profile.subscription_plan !== plan) {
          const { data: { user } } = await db.auth.admin.getUserById(profile.user_id);
          if (user?.email) {
            await sendEmail({
              idempotencyKey: `subscription_upgraded:${subscription.id}:${plan}`,
              template: "subscription_upgraded",
              category: "orders_and_payouts",
              to: user.email,
              subject: `You're now on ${plan.charAt(0).toUpperCase() + plan.slice(1)}`,
              userId: profile.user_id,
              react: SubscriptionUpgraded({
                firstName: (profile.name || "there").split(" ")[0],
                oldPlan: (profile.subscription_plan as string).charAt(0).toUpperCase() + (profile.subscription_plan as string).slice(1),
                newPlan: plan.charAt(0).toUpperCase() + plan.slice(1),
                billingDate: new Date((subscription.items.data[0]?.current_period_end ?? 0) * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
                accountUrl: `${SITE}/artist-portal/billing`,
              }),
              metadata: { subscriptionId: subscription.id, oldPlan: profile.subscription_plan, newPlan: plan },
            });
          }
        }
      } catch (err) {
        console.error("Upgraded email error:", err);
      }
    }

    // ─── Referral credit (item 25) ───
    // First time this referred artist enters a paid status, extend the
    // referrer's free_until by 30 days. referral_credited_at guards against
    // double-credits if Stripe replays the event.
    const isPaidStatus = subscription.status === "active" || subscription.status === "trialing";
    if (isPaidStatus && event.type === "customer.subscription.created") {
      try {
        const { data: referred } = await db
          .from("artist_profiles")
          .select("id, referred_by_code, referral_credited_at")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();
        if (referred && referred.referred_by_code && !referred.referral_credited_at) {
          const { data: referrer } = await db
            .from("artist_profiles")
            .select("id, free_until")
            .eq("referral_code", referred.referred_by_code)
            .maybeSingle();
          if (referrer) {
            const now = new Date();
            const base = referrer.free_until && new Date(referrer.free_until) > now
              ? new Date(referrer.free_until)
              : now;
            const newFreeUntil = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);
            await db
              .from("artist_profiles")
              .update({ free_until: newFreeUntil.toISOString() })
              .eq("id", referrer.id);
            await db
              .from("artist_profiles")
              .update({ referral_credited_at: now.toISOString() })
              .eq("id", referred.id);
          }
        }
      } catch (referralErr) {
        // Non-fatal — Stripe subscription is already recorded.
        console.error("Referral credit error:", referralErr);
      }
    }
  }

  // ─── Trial ending soon ───
  // Stripe fires `customer.subscription.trial_will_end` 3 days before trial
  // end. The template is also fired on invoice.upcoming if the customer
  // has 1 day left — we rely on Stripe's single event and make one send.
  if (event.type === "customer.subscription.trial_will_end") {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
    const priceId = subscription.items.data[0]?.price?.id || "";
    let planLabel = "Premium";
    if (priceId === process.env.STRIPE_PRICE_PRO || priceId === process.env.STRIPE_PRICE_PRO_ANNUAL) planLabel = "Pro";
    else if (priceId === process.env.STRIPE_PRICE_CORE || priceId === process.env.STRIPE_PRICE_CORE_ANNUAL) planLabel = "Core";

    try {
      const { data: profile } = await db
        .from("artist_profiles")
        .select("user_id, name")
        .eq("stripe_customer_id", customerId)
        .maybeSingle();
      if (profile?.user_id) {
        const { data: { user } } = await db.auth.admin.getUserById(profile.user_id);
        if (user?.email) {
          const trialEndDate = subscription.trial_end
            ? new Date(subscription.trial_end * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
            : "soon";
          await sendEmail({
            idempotencyKey: `trial_ending:${subscription.id}`,
            template: "subscription_trial_ending",
            category: "promotions",
            to: user.email,
            subject: `Your ${planLabel} trial ends ${trialEndDate}`,
            userId: profile.user_id,
            react: SubscriptionTrialEnding({
              firstName: (profile.name || "there").split(" ")[0],
              planName: planLabel,
              trialEndDate,
              upgradeUrl: `${SITE}/artist-portal/billing`,
              benefits: [
                "Unlimited works in your portfolio",
                "Priority matching with venues",
                "Advanced QR analytics",
              ],
            }),
            metadata: { subscriptionId: subscription.id },
          });
        }
      }
    } catch (err) {
      console.error("Trial-ending email error:", err);
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

    const { error } = await db
      .from("artist_profiles")
      .update({ subscription_status: "canceled" })
      .eq("stripe_customer_id", customerId);

    if (error) console.error("Subscription delete error:", error);

    // Cancellation confirmation email.
    try {
      const { data: profile } = await db
        .from("artist_profiles")
        .select("user_id, name, subscription_plan")
        .eq("stripe_customer_id", customerId)
        .maybeSingle();
      if (profile?.user_id) {
        const { data: { user } } = await db.auth.admin.getUserById(profile.user_id);
        if (user?.email) {
          const accessEndsAt = subscription.cancel_at
            ? new Date(subscription.cancel_at * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
            : "the end of this billing period";
          const planLabel = ((profile.subscription_plan as string) || "plan").charAt(0).toUpperCase() + ((profile.subscription_plan as string) || "plan").slice(1);
          await sendEmail({
            idempotencyKey: `subscription_cancelled:${subscription.id}`,
            template: "subscription_cancelled",
            category: "orders_and_payouts",
            to: user.email,
            subject: `Your ${planLabel} subscription is cancelled`,
            userId: profile.user_id,
            react: SubscriptionCancelled({
              firstName: (profile.name || "there").split(" ")[0],
              planName: planLabel,
              accessEndsAt,
              reactivateUrl: `${SITE}/artist-portal/billing`,
              supportUrl: `${SITE}/support`,
            }),
            metadata: { subscriptionId: subscription.id },
          });
        }
      }
    } catch (err) {
      console.error("Cancelled email error:", err);
    }
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

      // Dunning email — keyed on attempt so each retry sends one reminder.
      try {
        const { data: profile } = await db
          .from("artist_profiles")
          .select("user_id, name, subscription_plan")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();
        if (profile?.user_id) {
          const { data: { user } } = await db.auth.admin.getUserById(profile.user_id);
          if (user?.email) {
            const amountDue = { amount: invoice.amount_due, currency: (invoice.currency || "gbp").toUpperCase() as "GBP" | "USD" | "EUR" };
            // `next_payment_attempt` is Stripe's scheduled retry timestamp.
            const retryDate = invoice.next_payment_attempt
              ? new Date(invoice.next_payment_attempt * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
              : "shortly";
            const planLabel = ((profile.subscription_plan as string) || "Wallplace").charAt(0).toUpperCase() + ((profile.subscription_plan as string) || "Wallplace").slice(1);
            await sendEmail({
              idempotencyKey: `payment_failed:${invoice.id}:${invoice.attempt_count}`,
              template: "subscription_payment_failed",
              category: "orders_and_payouts",
              to: user.email,
              subject: `Payment failed on your ${planLabel} subscription`,
              userId: profile.user_id,
              react: SubscriptionPaymentFailed({
                firstName: (profile.name || "there").split(" ")[0],
                planName: planLabel,
                amountDue,
                retryDate,
                updatePaymentUrl: `${SITE}/artist-portal/billing`,
                supportUrl: `${SITE}/support`,
              }),
              metadata: { invoiceId: invoice.id, attempt: invoice.attempt_count },
            });
          }
        }
      } catch (err) {
        console.error("Payment-failed email error:", err);
      }
    }
  }

  // ─── Invoice paid — renewal receipt + past_due recovery ───
  if (event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = typeof invoice.customer === "string" ? invoice.customer : (invoice.customer as Stripe.Customer)?.id;

    if (customerId) {
      // Recovery: if they were past_due and this invoice paid, set active.
      const { data: profile } = await db
        .from("artist_profiles")
        .select("user_id, name, subscription_status, subscription_plan")
        .eq("stripe_customer_id", customerId)
        .single();

      if (profile?.subscription_status === "past_due") {
        const { error } = await db
          .from("artist_profiles")
          .update({ subscription_status: "active" })
          .eq("stripe_customer_id", customerId);
        if (error) console.error("Invoice paid recovery error:", error);
      }

      // Renewal receipt — only for recurring charges, not the initial
      // signup invoice (which is covered by subscription_created or the
      // checkout receipt). `billing_reason` is the source of truth.
      // Skip trial-ending invoices with zero amount.
      const isRenewal = invoice.billing_reason === "subscription_cycle";
      if (isRenewal && invoice.amount_paid > 0 && profile?.user_id) {
        try {
          const { data: { user } } = await db.auth.admin.getUserById(profile.user_id);
          if (user?.email) {
            const planLabel = ((profile.subscription_plan as string) || "Wallplace").charAt(0).toUpperCase() + ((profile.subscription_plan as string) || "Wallplace").slice(1);
            const renewedAt = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
            const nextBillingDate = invoice.period_end
              ? new Date(invoice.period_end * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
              : "next period";
            await sendEmail({
              idempotencyKey: `renewal_receipt:${invoice.id}`,
              template: "subscription_renewal_receipt",
              category: "orders_and_payouts",
              to: user.email,
              subject: `Receipt for your ${planLabel} subscription`,
              userId: profile.user_id,
              react: SubscriptionRenewalReceipt({
                firstName: (profile.name || "there").split(" ")[0],
                planName: planLabel,
                amount: { amount: invoice.amount_paid, currency: (invoice.currency || "gbp").toUpperCase() as "GBP" | "USD" | "EUR" },
                renewedAt,
                nextBillingDate,
                invoiceUrl: invoice.hosted_invoice_url || `${SITE}/artist-portal/billing`,
              }),
              metadata: { invoiceId: invoice.id },
            });
          }
        } catch (err) {
          console.error("Renewal receipt email error:", err);
        }
      }
    }
  }

  // ─── Payout failed — notify artist so they can fix bank details ───
  if (event.type === "payout.failed") {
    const payout = event.data.object as Stripe.Payout;
    const connectAccountId = (event as Stripe.Event & { account?: string }).account;
    if (connectAccountId) {
      const { data: artistProfile } = await db
        .from("artist_profiles")
        .select("user_id, name")
        .eq("stripe_connect_account_id", connectAccountId)
        .maybeSingle();
      if (artistProfile?.user_id) {
        const { data: { user } } = await db.auth.admin.getUserById(artistProfile.user_id);
        if (user?.email) {
          await sendEmail({
            idempotencyKey: `payout_failed:${payout.id}`,
            template: "artist_payout_failed",
            category: "orders_and_payouts",
            to: user.email,
            subject: "Payout couldn't be sent",
            userId: artistProfile.user_id,
            react: ArtistPayoutFailed({
              firstName: (artistProfile.name || "there").split(" ")[0],
              payoutAmount: { amount: payout.amount, currency: (payout.currency || "gbp").toUpperCase() as "GBP" | "USD" | "EUR" },
              reason: payout.failure_message || payout.failure_code || "Stripe rejected the transfer.",
              fixPayoutUrl: `${SITE}/artist-portal/billing`,
              supportUrl: `${SITE}/support`,
            }),
            metadata: { payoutId: payout.id },
          });
        }
      }
    }
  }

  // ─── Payout paid — notify the artist ───
  // Fires when Stripe sends money from the artist's Connect account to
  // their bank. We look the artist up via `destination` (the Connect
  // account id) and send the polished `artist_payout_sent` template.
  if (event.type === "payout.paid") {
    const payout = event.data.object as Stripe.Payout;
    // The Connect account this payout came from lives on event.account.
    const connectAccountId = (event as Stripe.Event & { account?: string }).account;
    if (connectAccountId) {
      const { data: artistProfile } = await db
        .from("artist_profiles")
        .select("user_id, name")
        .eq("stripe_connect_account_id", connectAccountId)
        .maybeSingle();
      if (artistProfile?.user_id) {
        const { data: { user } } = await db.auth.admin.getUserById(artistProfile.user_id);
        if (user?.email) {
          const amount = { amount: payout.amount, currency: (payout.currency || "gbp").toUpperCase() as "GBP" | "USD" | "EUR" };
          const arrival = payout.arrival_date
            ? new Date(payout.arrival_date * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
            : "shortly";
          await sendEmail({
            idempotencyKey: `payout_sent:${payout.id}`,
            template: "artist_payout_sent",
            category: "orders_and_payouts",
            to: user.email,
            subject: `Payout on the way: £${(payout.amount / 100).toFixed(2)}`,
            userId: artistProfile.user_id,
            react: ArtistPayoutSent({
              firstName: (artistProfile.name || "there").split(" ")[0],
              payoutAmount: amount,
              payoutDate: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
              expectedArrival: arrival,
              payoutUrl: `${SITE}/artist-portal/billing/payouts`,
              supportUrl: `${SITE}/support`,
            }),
            metadata: { payoutId: payout.id, connectAccountId },
          });
        }
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

    // KYC-needed email: Stripe populates `requirements.currently_due` when
    // the Connect account is missing info. We only email the artist side
    // (venue Connect accounts are payouts-to-venue and tend to be simpler).
    // Idempotency includes the requirements hash so repeated "nothing
    // changed" deliveries don't trigger extra sends.
    const currentlyDue = account.requirements?.currently_due || [];
    if (currentlyDue.length > 0) {
      try {
        const { data: artistProfile } = await db
          .from("artist_profiles")
          .select("user_id, name")
          .eq("stripe_connect_account_id", account.id)
          .maybeSingle();
        if (artistProfile?.user_id) {
          const { data: { user } } = await db.auth.admin.getUserById(artistProfile.user_id);
          if (user?.email) {
            const hash = currentlyDue.sort().join(",").slice(0, 60);
            await sendEmail({
              idempotencyKey: `stripe_kyc:${account.id}:${hash}`,
              template: "artist_stripe_kyc_needed",
              category: "orders_and_payouts",
              to: user.email,
              subject: "Stripe needs more info to keep payouts flowing",
              userId: artistProfile.user_id,
              react: ArtistStripeKycNeeded({
                firstName: (artistProfile.name || "there").split(" ")[0],
                requestedDocuments: currentlyDue.slice(0, 8),
                stripeUrl: `${SITE}/artist-portal/billing`,
                deadline: account.requirements?.current_deadline
                  ? new Date(account.requirements.current_deadline * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
                  : undefined,
                supportUrl: `${SITE}/support`,
              }),
              metadata: { accountId: account.id, currentlyDue },
            });
          }
        }
      } catch (err) {
        console.error("KYC email error:", err);
      }
    }
  }

  return NextResponse.json({ received: true });
}
