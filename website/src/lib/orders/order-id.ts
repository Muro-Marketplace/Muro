// Order-id derivation and collision handling for the Stripe webhook (D3).
//
// `WS-${session.id.slice(-8)}` took only 8 characters, so two different payments
// could collide on the same order id. The webhook then saw the second insert's
// 23505 and reported it as a duplicate, so the second buyer's money was taken with
// no order written. Two parts fix it: widen the id past the point of plausible
// collision, and, on a 23505, verify it really is the same payment before dropping.

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Derive an order id from a Stripe session id. The part after the last underscore
 * of a session id (`cs_live_a1B2c3...`) is 24+ chars of Stripe entropy; 16 makes a
 * collision cryptographically implausible where 8 was not. `orders.id` is TEXT so
 * the wider value fits, and nothing in the app assumes the old 8-char shape.
 */
export function orderIdFromSession(prefix: string, sessionId: string): string {
  const entropy = sessionId.split("_").pop() || sessionId;
  return `${prefix}-${entropy.slice(-16).toUpperCase()}`;
}

/**
 * On a 23505 for `orders.id`, decide whether this is a genuine Stripe redelivery
 * (same payment intent, safe to treat as a duplicate) or an id collision between
 * two different payments (must NOT be dropped: the second buyer paid and has no
 * order).
 *
 * Anything that is not a confirmed same-payment match is a collision, so the bias
 * is always a loud retry over a silent drop. The global replay guard (D1) already
 * catches same-event redelivery upstream, so in practice this fires only for a
 * null-intent redelivery (both sides null, treated as duplicate) or a true
 * collision.
 */
export async function classifyOrderIdConflict(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Pick<SupabaseClient<any, any, any>, "from">,
  orderId: string,
  paymentIntentId: string | null,
): Promise<"duplicate" | "collision"> {
  const { data: clash } = await db
    .from("orders")
    .select("stripe_payment_intent_id")
    .eq("id", orderId)
    .maybeSingle();
  const clashIntent = (clash as { stripe_payment_intent_id?: string | null } | null)
    ?.stripe_payment_intent_id;
  if (clash && clashIntent === paymentIntentId) return "duplicate";
  return "collision";
}
