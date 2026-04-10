import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabase } from "@/lib/supabase";
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

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    try {
      // Save order to Supabase
      const { error } = await supabase.from("orders").insert({
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
        subtotal: (session.amount_total || 0) / 100,
        shipping_cost: 0,
        total: (session.amount_total || 0) / 100,
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

  return NextResponse.json({ received: true });
}
