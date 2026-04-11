import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
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

        const { error } = await db.from("orders").insert({
          id: `WS-${session.id.slice(-8)}`,
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
          total: subtotal + shippingCost,
          status: "confirmed",
          created_at: new Date().toISOString(),
        });

        if (error) {
          console.error("Supabase order save error:", error);
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
