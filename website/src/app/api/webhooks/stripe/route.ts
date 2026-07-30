import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { scheduleTransfer } from "@/lib/stripe-connect";
import { notifyArtistNewOrder, notifyVenueOrderFromPlacement, notifyCurationCustomerPaid } from "@/lib/email";
import { createNotification } from "@/lib/notifications";
import { sendEmail } from "@/lib/email/send";
import { CustomerOrderReceipt } from "@/emails/templates/orders/CustomerOrderReceipt";
import { resolveArtistNamesBulk } from "@/emails/_helpers/resolve-artist-name";
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
import { loadCartSession } from "@/lib/cart-sessions";
import { signOrderToken } from "@/lib/order-tracking-token";
import {
  handleInvoicePaid as handleInvoicePaidPaidLoan,
  handleInvoicePaymentFailed as handleInvoicePaymentFailedPaidLoan,
  handleSubscriptionDeleted as handleSubscriptionDeletedPaidLoan,
} from "@/lib/placements/paid-loan-billing";
import { recordOrderEvent } from "@/lib/orders/lifecycle";
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
              managed_monthly: "Managed, monthly rotation",
              managed_quarterly: "Managed, quarterly refresh",
            };
            await notifyCurationCustomerPaid({
              email: existing.contact_email,
              contactName: existing.contact_name,
              venueName: existing.venue_name,
              tierLabel: tierLabels[existing.tier] || existing.tier,
              amountGbp: amountPaid,
            }).catch((err) => { if (err) console.error("notifyCurationCustomerPaid error:", err); });
          }
        }
      }
      return NextResponse.json({ received: true });
    }
  }

  // ─── Purchase-offer checkout (Request 1 — venue-only offers) ───
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.checkout_kind === "purchase_offer") {
      const offerId = session.metadata.offer_id;
      if (offerId) {
        const paidOrderId = `OFR-${session.id.slice(-8)}`;
        const nowIso = new Date().toISOString();
        const workIds = (session.metadata.offer_work_ids || "").split(",").filter(Boolean);
        const totalGbp = (session.amount_total || 0) / 100;
        const feePence = Number(session.metadata.offer_platform_fee_pence || 0);
        const netPence = Number(session.metadata.offer_artist_net_pence || 0);
        const artistUserId = session.metadata.offer_artist_user_id || null;

        // E6. The order row is written FIRST and the offer is flipped to paid
        // only once it lands. The old order was the other way round with the
        // insert's failure swallowed into a console.warn, which is why both
        // real paid offers in prod carry a paid_order_id pointing at an order
        // row that does not exist: `orders.shipping` is NOT NULL and this
        // insert omitted it, so every purchase-offer payment failed with 23502
        // and nobody found out. Money in, no order, no payout, no email.
        const { error: insErr } = await db.from("orders").insert({
          id: paidOrderId,
          stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
          buyer_email: session.customer_email || session.metadata.offer_buyer_email || "",
          items: [{
            offer_id: offerId,
            work_ids: workIds,
            collection_id: session.metadata.offer_collection_id || null,
          }],
          // NOT NULL, and the offer flow collects no delivery address. Same
          // nine-field shape the cart path writes so the order views, which all
          // read shipping?.fullName and friends, keep working.
          shipping: {
            fullName: "",
            email: session.customer_email || session.metadata.offer_buyer_email || "",
            phone: "",
            addressLine1: "",
            addressLine2: "",
            city: "",
            postcode: "",
            country: "GB",
            notes: `Accepted offer ${offerId}. No delivery address collected at checkout.`,
          },
          subtotal: totalGbp,
          shipping_cost: 0,
          total: totalGbp,
          status: "confirmed",
          // jsonb column — store the array raw (Plan B Task 13).
          status_history: [{ status: "confirmed", timestamp: nowIso }],
          source: "purchase_offer",
          artist_slug: session.metadata.offer_artist_slug || null,
          artist_user_id: artistUserId,
          venue_revenue: 0,
          venue_revenue_share_percent: 0,
          platform_fee: feePence / 100,
          platform_fee_percent: Number(session.metadata.offer_platform_fee_percent || 0),
          artist_revenue: netPence / 100,
          fulfilment_method: "ship",
          created_at: nowIso,
        });

        // 23505 is our own retry landing on a row we already wrote: idempotent,
        // carry on. Anything else means the money is captured and we have no
        // order, so fail loudly and let Stripe retry rather than marking the
        // offer paid against an order that isn't there.
        if (insErr && (insErr as { code?: string }).code !== "23505") {
          console.error("[offer order insert] failed, offer left unpaid for retry", {
            offerId,
            paidOrderId,
            code: (insErr as { code?: string }).code,
            message: insErr.message,
          });
          return NextResponse.json({ error: "Order save failed" }, { status: 500 });
        }

        await db
          .from("purchase_offers")
          .update({
            status: "paid",
            paid_at: nowIso,
            paid_order_id: paidOrderId,
            updated_at: nowIso,
          })
          .eq("id", offerId);

        // E10: the offer path never decremented stock, so a work sold via an
        // accepted offer stayed on sale. Read-then-write to match the cart
        // path; replacing that pattern with an atomic decrement is D5's task,
        // and inventing a second mechanism here would just add a third.
        for (const workId of workIds) {
          try {
            const { data: work } = await db
              .from("artist_works")
              .select("quantity_available")
              .eq("id", workId)
              .single();
            const current = work?.quantity_available;
            if (typeof current === "number") {
              const next = Math.max(0, current - 1);
              const updates: Record<string, unknown> = { quantity_available: next };
              if (next === 0) updates.available = false;
              await db.from("artist_works").update(updates).eq("id", workId);
            }
          } catch (err) {
            console.warn("[offer] quantity decrement skipped", { workId, err });
          }
        }

        // E6: pay the artist. Without this the platform kept 100% of every
        // accepted offer and no stripe_transfers ledger row was ever written.
        if (artistUserId && netPence > 0) {
          try {
            const { data: artistConnect } = await db
              .from("artist_profiles")
              .select("stripe_connect_account_id, stripe_connect_onboarding_complete")
              .eq("user_id", artistUserId)
              .single();
            if (artistConnect?.stripe_connect_account_id && artistConnect.stripe_connect_onboarding_complete) {
              await scheduleTransfer({
                orderId: paidOrderId,
                recipientType: "artist",
                recipientUserId: artistUserId,
                connectAccountId: artistConnect.stripe_connect_account_id,
                amountCents: netPence,
                immediate: false,
              });
            } else {
              // The checkout pre-flight should have stopped this, so it means
              // onboarding lapsed between session creation and payment.
              console.error("[offer] artist cannot be paid out, transfer skipped", {
                paidOrderId,
                artistUserId,
                netPence,
              });
            }
          } catch (transferErr) {
            console.error("[offer] artist transfer error:", transferErr);
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
        // Server-side cart row is the data-of-record (Plan B Task 6). The
        // 500-char metadata cap used to truncate big carts; cart_sessions
        // carries the full payload.
        const saved = await loadCartSession(session.id);
        if (!saved) {
          console.error("[webhook] cart_sessions miss for", session.id, "— refusing to process");
          return NextResponse.json(
            { error: "Cart session not found", sessionId: session.id },
            { status: 500 },
          );
        }
        // Stripe amount_total already includes shipping (added as line item in checkout)
        const total = (session.amount_total || 0) / 100;
        const cartItems = saved.cart as Array<{ price?: number; qty?: number; quantity?: number }>;
        const subtotal = cartItems.reduce((sum: number, i) => sum + (i.price || 0) * (Number(i.qty ?? i.quantity ?? 1)), 0) || total;
        const shippingCost = Math.max(0, total - subtotal);
        const orderId = `WS-${session.id.slice(-8)}`;
        const source = saved.source || session.metadata?.source || "direct";
        const venueSlug = saved.venueSlug || session.metadata?.venue_slug || "";
        const artistSlugs = (saved.artistSlugs || []).join(",") || session.metadata?.artist_slugs || "";
        const firstArtistSlug = artistSlugs.split(",")[0] || "";
        const savedShipping = saved.shipping as Record<string, string>;

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

        // Per-line venue revenue share. Multi-artist carts can mix
        // placements at the same venue with different revenue_share_percent
        // values, so we look up every artist's placement at this venue in
        // one round-trip and apply each rate to its own line. Shipping is
        // exempt; only artwork value contributes to the venue cut.
        const lineArtistSlugs = (cartItems as Array<{ artistSlug?: string }>)
          .map((i) => i.artistSlug || "")
          .filter(Boolean);
        const uniqueLineSlugs = Array.from(new Set(lineArtistSlugs));
        const placementByArtistSlug = new Map<string, { id: string; revenue_share_percent: number }>();
        if (venueSlug && uniqueLineSlugs.length > 0) {
          const { data: rows } = await db.from("placements")
            .select("id, artist_slug, revenue_share_percent")
            .in("artist_slug", uniqueLineSlugs)
            .eq("venue_slug", venueSlug)
            .eq("status", "active");
          for (const row of (rows || []) as Array<{ id: string; artist_slug: string; revenue_share_percent: number | null }>) {
            placementByArtistSlug.set(row.artist_slug, {
              id: row.id,
              revenue_share_percent: row.revenue_share_percent || 0,
            });
          }
          // Schema still records a single placement_id per order. Pick the
          // first cart line whose artist has a placement so the choice is
          // deterministic across replayed webhook deliveries.
          for (const item of cartItems as Array<{ artistSlug?: string }>) {
            const slug = item.artistSlug || "";
            const place = placementByArtistSlug.get(slug);
            if (place) {
              placementId = place.id;
              break;
            }
          }
        }

        // Sum the per-line venue cut. Lines whose artist has no placement
        // at the venue contribute 0.
        venueRevenue = (cartItems as Array<{ artistSlug?: string; price?: number; qty?: number; quantity?: number }>).reduce((sum, item) => {
          const slug = item.artistSlug || "";
          const pct = placementByArtistSlug.get(slug)?.revenue_share_percent ?? 0;
          const lineValue = (item.price || 0) * Number(item.qty ?? item.quantity ?? 1);
          return sum + lineValue * (pct / 100);
        }, 0);
        venueRevenue = Math.round(venueRevenue * 100) / 100;
        // Blended effective rate against the subtotal, stored on the
        // order for dashboard / receipt display. Equals the single-rate
        // value when every line shares the same placement.
        venueRevSharePct = subtotal > 0
          ? Math.round((venueRevenue / subtotal) * 100 * 100) / 100
          : 0;

        // Platform fee stays at a single rate against subtotal (the
        // first-artist plan). Multi-artist fee splitting is a separate
        // concern from the venue split. Shipping is not subject to the
        // cut and flows straight through to the artist, who pays the
        // courier out of pocket.
        platformFee = Math.round(subtotal * (platformFeePct / 100) * 100) / 100;
        artistRevenue = Math.round((subtotal - venueRevenue - platformFee + shippingCost) * 100) / 100;

        const paymentIntentId = typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id || "";

        // Collection (in-store) sales hand the artwork over at the
        // point of purchase, so there's no shipping/processing/shipped
        // lifecycle to track. Mark the order delivered straight away
        // and pin delivered_at so refund-window logic still works.
        const fulfilmentMethod = (savedShipping as { fulfilmentMethod?: string })?.fulfilmentMethod || session.metadata?.fulfilment_method || "ship";
        const isCollection = fulfilmentMethod === "collection";
        const initialStatus: "confirmed" | "delivered" = isCollection ? "delivered" : "confirmed";
        const nowIso = new Date().toISOString();

        const orderRow: Record<string, unknown> = {
          id: orderId,
          stripe_payment_intent_id: paymentIntentId,
          buyer_email: session.customer_email || savedShipping?.email || "",
          items: cartItems,
          shipping: {
            fullName: savedShipping?.fullName || "",
            email: savedShipping?.email || "",
            phone: savedShipping?.phone || "",
            addressLine1: savedShipping?.addressLine1 || "",
            addressLine2: savedShipping?.addressLine2 || "",
            city: savedShipping?.city || "",
            postcode: savedShipping?.postcode || "",
            country: savedShipping?.country || "GB",
            notes: savedShipping?.notes || "",
          },
          subtotal,
          shipping_cost: shippingCost,
          total,
          status: initialStatus,
          // jsonb column — store the array raw (Plan B Task 13).
          // For collection orders we record the confirmed → delivered
          // jump in one go so the customer-facing tracker reads cleanly
          // ("Order placed · Delivered") without intermediate pips.
          status_history: isCollection
            ? [
                { status: "confirmed", timestamp: nowIso },
                { status: "delivered", timestamp: nowIso },
              ]
            : [{ status: "confirmed", timestamp: nowIso }],
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
          fulfilment_method: fulfilmentMethod,
          collection_notes: (savedShipping as { collectionNotes?: string })?.collectionNotes || null,
          delivered_at: isCollection ? nowIso : null,
          created_at: nowIso,
        };

        // F30, idempotency: skip if we've already processed this payment intent.
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

        // Try full insert. If the DB rejects an unknown column, strip
        // ONLY the columns the error mentions and retry. The previous
        // behaviour was to fall back to a minimal "base" row that
        // dropped every attribution column (artist_slug, artist_user_id,
        // venue_slug, placement_id, source, …) — orders saved fine but
        // were invisible to the artist's GET because nothing pointed
        // back to them. Pattern matches the placements POST retry.
        let { error } = await db.from("orders").insert(orderRow);
        if (error) {
          // Unique-constraint violation = another concurrent delivery won the race.
          // Treat as success so Stripe doesn't keep retrying.
          if ((error as { code?: string }).code === "23505") {
            console.log("Order already exists (unique violation), treating webhook as processed");
            return NextResponse.json({ received: true, duplicate: true });
          }
          // Iterative strip-and-retry. Each loop drops only the columns
          // the error specifically called out, keeping attribution intact
          // for any column the DB does know about.
          const optionalCols = [
            "source",
            "artist_slug",
            "artist_user_id",
            "venue_slug",
            "venue_revenue_share_percent",
            "venue_revenue",
            "artist_revenue",
            "platform_fee_percent",
            "platform_fee",
            "placement_id",
            "fulfilment_method",
            "collection_notes",
            "delivered_at",
            "status_history",
            "stripe_payment_intent_id",
          ];
          const stripped = new Set<string>();
          const safeRow: Record<string, unknown> = { ...orderRow };
          // PostgrestError | null, the loop nulls it on success to break out.
          // Without the explicit union TS infers PostgrestError (the type of
          // the initial value) and the `lastError = null` assignment errors.
          let lastError: typeof error | null = error;
          while (lastError) {
            const msg = String(lastError.message || "").toLowerCase();
            const newStrip = optionalCols.filter(
              (c) => !stripped.has(c) && new RegExp(`\\b${c}\\b`).test(msg),
            );
            if (newStrip.length === 0) break;
            newStrip.forEach((c) => {
              stripped.add(c);
              delete safeRow[c];
            });
            console.warn(
              `Order insert missing columns [${Array.from(stripped).join(", ")}], retrying:`,
              lastError.message,
            );
            const retry = await db.from("orders").insert(safeRow);
            if (!retry.error) {
              lastError = null;
              break;
            }
            if ((retry.error as { code?: string }).code === "23505") {
              return NextResponse.json({ received: true, duplicate: true });
            }
            lastError = retry.error;
          }
          error = lastError;
        }

        if (error) {
          // F31, return non-200 so Stripe retries instead of silently dropping.
          console.error("Supabase order save error:", error);
          return NextResponse.json({ error: "DB save failed" }, { status: 500 });
        } else {
          // J1 (Phase 2.3): log the initial order.placed event +
          // dispatch the matching Phase 2.0c emails. Best-effort,
          // legacy templates below continue to fire for backwards
          // compatibility.
          try {
            const buyerEmail = orderRow.buyer_email as string | undefined;
            const artistUserId = orderRow.artist_user_id as string | undefined;
            let artistEmail: string | null = null;
            if (artistUserId) {
              const { data: artistAuth } = await db.auth.admin.getUserById(artistUserId);
              artistEmail = artistAuth.user?.email ?? null;
            }
            await recordOrderEvent({
              orderId: String(orderRow.id),
              newStatus: "confirmed",
              buyerEmail: buyerEmail ?? null,
              artistEmail,
              data: {
                firstName: buyerEmail ? buyerEmail.split("@")[0] : "there",
                orderNumber: String(orderRow.id),
                orderUrl: `${SITE}/customer-portal/orders`,
              },
              metadata: { stripe_session_id: session.id },
            });
          } catch (lifecycleErr) {
            console.error("[webhook checkout] lifecycle hook:", lifecycleErr);
          }
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

          // Notification payload comes from the saved cart row; images
          // are inline on each item now (no parallel array, no truncation).
          const cartItemsForNotify = cartItems as Array<{ title?: string; image?: string }>;
          const firstItemTitle = cartItemsForNotify[0]?.title || "Artwork";

          // Resolve artist display names by slug in one round-trip.
          // Without this, item.artistName fell back to the slug
          // ("maya-chen") and the email showed an ID instead of a name.
          const slugMap = await resolveArtistNamesBulk(
            db,
            (cartItemsForNotify as Array<{ artistSlug?: string }>).map((i) => i.artistSlug),
          );

          // Customer order receipt (legally required under CCR 2013).
          // Keyed by payment_intent so Stripe retries don't double-send.
          const buyerEmail = session.customer_email || savedShipping?.email;
          if (buyerEmail) {
            const buyerName = savedShipping?.fullName || "there";
            // Adapt the cart items shape to the OrderSummary component.
            const orderItems = (cartItemsForNotify as Array<{
              title?: string; artistName?: string; artistSlug?: string; qty?: number; quantity?: number; size?: string; image?: string; price?: number;
            }>).map((item) => {
              const slug = item.artistSlug || firstArtistSlug || "";
              const resolved = slugMap.get(slug);
              const fallbackName = item.artistName && !/^[a-z0-9-]+$/.test(item.artistName) ? item.artistName : null;
              return {
                title: item.title || "Artwork",
                artistName: resolved || fallbackName || slug || "Artist",
                quantity: Number(item.qty ?? item.quantity ?? 1),
                size: item.size,
                image: item.image || `${SITE}/placeholder-work.jpg`,
                lineTotal: {
                  amount: Math.round((item.price ?? 0) * Number(item.qty ?? item.quantity ?? 1) * 100),
                  currency: "GBP" as const,
                },
              };
            });

            // Persist the enriched items (with display names + images) on
            // the orders row so subsequent shipping/delivery emails can
            // read them deterministically without re-running the lookup.
            // Best-effort, failure here is non-fatal; the receipt email
            // already has what it needs in scope.
            try {
              await db.from("orders").update({ items: orderItems }).eq("id", orderId);
            } catch (persistErr) {
              console.warn("[webhook] persisting enriched items failed:", persistErr);
            }
            // Mint a signed tracking token bound to {orderId, email} so
            // /orders/track can authenticate the lookup without trusting
            // bare email match. Best-effort: if the secret isn't
            // configured the email still sends, just without the token.
            let trackingToken: string | undefined;
            try {
              trackingToken = await signOrderToken({ orderId, email: buyerEmail });
            } catch (err) {
              console.warn("[webhook] signOrderToken failed:", err);
            }
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
                trackingToken,
                items: orderItems,
                subtotal: { amount: Math.round(subtotal * 100), currency: "GBP" },
                shipping: { amount: Math.round(shippingCost * 100), currency: "GBP" },
                total: { amount: Math.round(total * 100), currency: "GBP" },
                billingAddress: {
                  name: buyerName,
                  line1: savedShipping?.addressLine1 || "",
                  line2: savedShipping?.addressLine2 || undefined,
                  city: savedShipping?.city || "",
                  postcode: savedShipping?.postcode || "",
                  country: savedShipping?.country || "GB",
                },
                shippingAddress: {
                  name: buyerName,
                  line1: savedShipping?.addressLine1 || "",
                  line2: savedShipping?.addressLine2 || undefined,
                  city: savedShipping?.city || "",
                  postcode: savedShipping?.postcode || "",
                  country: savedShipping?.country || "GB",
                },
                supportUrl: `${SITE}/support`,
              }),
              metadata: { orderId, paymentIntentId },
            });
          }

          // Notify artist, email + in-app bell notification.
          if (artistUserId) {
            const { data: { user: artistUser } } = await db.auth.admin.getUserById(artistUserId);
            const { data: artistProfile } = await db.from("artist_profiles").select("name").eq("user_id", artistUserId).single();
            if (artistUser?.email && artistProfile) {
              // Two emails to the artist: the celebration ("you made a sale")
              // and the operational receipt (order confirmation). They serve
              // different purposes, the first is emotional, the second
              // itemised and record-worthy. Idempotency keys are distinct.
              await sendEmail({
                idempotencyKey: `artist_work_sold:${paymentIntentId || orderId}`,
                template: "artist_work_sold",
                category: "orders_and_payouts",
                to: artistUser.email,
                subject: `You made a sale, ${firstItemTitle}`,
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
                subject: `Order ${orderId}, ${firstItemTitle}`,
                userId: artistUserId,
                react: ArtistOrderConfirmation({
                  firstName: (artistProfile.name || "there").split(" ")[0],
                  orderNumber: orderId,
                  workTitle: firstItemTitle,
                  buyerFirstName: (savedShipping?.fullName || "your buyer").split(" ")[0],
                  orderUrl: `${SITE}/artist-portal/orders/${orderId}`,
                  nextSteps: [
                    "Ship within 3 business days",
                    "Mark as shipped in the portal",
                    "Payout lands 2 business days after delivery",
                  ],
                }),
                metadata: { orderId, paymentIntentId },
              });
              // Legacy helper is a no-op now, the new pipeline covers it.
              void notifyArtistNewOrder;
            }
            // In-app sale notification, deep-linked to the artist orders
            // page so they can acknowledge the sale and start fulfilment.
            createNotification({
              userId: artistUserId,
              kind: "sale",
              title: "Your artwork sold",
              body: `${firstItemTitle}, £${artistRevenue.toFixed(2)} to you (${orderId})`,
              link: "/artist-portal/orders",
            }).catch(() => {});
          }
          // Notify venue if revenue share exists, email + in-app bell.
          if (venueSlug && venueRevenue > 0) {
            const { data: vp } = await db.from("venue_profiles").select("user_id, name").eq("slug", venueSlug).single();
            if (vp?.user_id) {
              const { data: { user: venueUser } } = await db.auth.admin.getUserById(vp.user_id);
              const { data: ap } = await db.from("artist_profiles").select("name").eq("slug", firstArtistSlug).single();
              if (venueUser?.email) {
                await notifyVenueOrderFromPlacement({ email: venueUser.email, venueName: vp.name, artistName: ap?.name || firstArtistSlug, itemTitle: firstItemTitle, total, venueRevenue }).catch((err) => { if (err) console.error("notifyVenueOrderFromPlacement error:", err); });
              }
              createNotification({
                userId: vp.user_id,
                kind: "sale",
                title: "Placement sale",
                body: `${firstItemTitle} sold, £${venueRevenue.toFixed(2)} to your venue (${orderId})`,
                link: "/venue-portal/orders",
              }).catch(() => {});
            }
          }

          // ─── Stripe Connect transfers ───
          // Collection orders are paid out immediately, the work is
          // handed over at the venue counter so there's no shipping
          // risk to insure against. Shipped orders keep the 14-day
          // hold (released early on delivery confirmation).
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
                  immediate: isCollection,
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
                  immediate: isCollection,
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
        // Non-fatal, Stripe subscription is already recorded.
        console.error("Referral credit error:", referralErr);
      }
    }
  }

  // ─── Trial ending soon ───
  // Stripe fires `customer.subscription.trial_will_end` 3 days before trial
  // end. The template is also fired on invoice.upcoming if the customer
  // has 1 day left, we rely on Stripe's single event and make one send.
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

    // Upgrade-race guard. When an artist upgrades from one plan to
    // another, /api/subscribe stores the previous subscription id in
    // metadata so the webhook handler can cancel it once the NEW
    // subscription's `customer.subscription.created` lands and the
    // profile has flipped to `active` on the new plan. Stripe then
    // fires a `customer.subscription.deleted` for the OLD subscription
    // shortly after. Without this guard, the handler would blindly
    // overwrite `subscription_status` to `canceled` for the customer,
    // wiping out the just-set active state, and the billing page
    // would render "Your subscription has been canceled" right after
    // a successful upgrade. The fix: only touch the profile if the
    // deleted subscription is still the profile's current one.
    const { data: profile } = await db
      .from("artist_profiles")
      .select("user_id, name, subscription_plan, stripe_subscription_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle<{
        user_id: string | null;
        name: string | null;
        subscription_plan: string | null;
        stripe_subscription_id: string | null;
      }>();

    const isStale = profile && profile.stripe_subscription_id && profile.stripe_subscription_id !== subscription.id;
    if (isStale) {
      // Old subscription being cancelled as part of an upgrade. The
      // newer subscription has already been recorded against the
      // profile; do nothing here. Skip the cancellation email too —
      // the artist isn't really being cancelled.
      return NextResponse.json({ received: true });
    }

    const { error } = await db
      .from("artist_profiles")
      .update({ subscription_status: "canceled" })
      .eq("stripe_customer_id", customerId);

    if (error) console.error("Subscription delete error:", error);

    // Cancellation confirmation email.
    try {
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

      // Dunning email, keyed on attempt so each retry sends one reminder.
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

  // ─── Phase 2.2 G3: paid-loan recurring billing ───
  // Handled first so the artist-payout side fires before the generic
  // subscription receipt path. Helper returns false when the
  // invoice/subscription doesn't belong to a placement_recurring_billings
  // row, so the original artist_profiles subscription handler still
  // runs for SaaS subs.
  if (event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice;
    try {
      await handleInvoicePaidPaidLoan(invoice);
    } catch (err) {
      console.error("[stripe webhook] paid-loan invoice.paid:", err);
    }
  }
  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    try {
      await handleInvoicePaymentFailedPaidLoan(invoice);
    } catch (err) {
      console.error("[stripe webhook] paid-loan invoice.payment_failed:", err);
    }
  }
  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    try {
      await handleSubscriptionDeletedPaidLoan(subscription);
    } catch (err) {
      console.error("[stripe webhook] paid-loan subscription.deleted:", err);
    }
  }

  // ─── Invoice paid, renewal receipt + past_due recovery ───
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

      // Renewal receipt, only for recurring charges, not the initial
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

  // ─── Payout failed, notify artist so they can fix bank details ───
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

  // ─── Payout paid, notify the artist ───
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
          const amountLabel = `£${(payout.amount / 100).toFixed(2)}`;

          // Bell notification, fires alongside the email so the
          // artist sees the payout in-app immediately, not just via
          // their inbox. Idempotency on payout_id at the email layer
          // protects against double-notifying on retried webhooks.
          createNotification({
            userId: artistProfile.user_id,
            kind: "payout_sent",
            title: `Payout sent · ${amountLabel}`,
            body: `Expected to land ${arrival}`,
            link: "/artist-portal/billing/payouts",
          }).catch((err) => console.warn("[stripe webhook] payout notification failed:", err));

          await sendEmail({
            idempotencyKey: `payout_sent:${payout.id}`,
            template: "artist_payout_sent",
            category: "orders_and_payouts",
            to: user.email,
            subject: `Payout on the way: ${amountLabel}`,
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

  // ─── Transfer reversed, mark payout as failed ───
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
