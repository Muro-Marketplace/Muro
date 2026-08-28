import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

// E39. This endpoint is unauthenticated: the only thing it checks is that the
// caller supplied a Stripe session id. It used to answer with customerEmail, the
// raw Stripe metadata, the cart and the full delivery address, so anyone holding
// a session id could read another customer's name, address and email. Session
// ids are high entropy, but they travel in URLs, browser history, referrers and
// logs, so "hard to guess" is not an access control.
//
// The response is now limited to what the confirmation page needs to render a
// receipt for a payment that has just completed: the id, the payment status, the
// total, and the line-item names and amounts. Nothing that identifies the buyer.
//
// Restoring the address and email for a signed-in buyer who owns the session is
// possible later, but it needs owner matching first, and the webhook does not
// populate buyer_user_id on the main path today (see E21), so a guest checkout,
// which is the common case here, could not benefit from it yet.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("id");

    if (!sessionId) {
      return NextResponse.json({ error: "Session ID required" }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items"],
    });

    return NextResponse.json({
      id: session.id,
      status: session.payment_status,
      amountTotal: (session.amount_total || 0) / 100,
      lineItems: session.line_items?.data.map((item) => ({
        name: item.description,
        quantity: item.quantity,
        amount: (item.amount_total || 0) / 100,
      })),
    });
  } catch (err) {
    console.error("Session retrieval error:", err);
    return NextResponse.json({ error: "Failed to retrieve session" }, { status: 500 });
  }
}
