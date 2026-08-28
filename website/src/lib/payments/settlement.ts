// Has this checkout session actually been paid?
//
// 04 D1 / item 0.2. `checkout.session.completed` does NOT mean "paid". It means
// the customer finished the checkout flow. For a delayed payment method — BACS
// Direct Debit, SEPA, bank transfer, and some cards under SCA — Stripe fires it
// with `payment_status: "unpaid"` and settles days later, or never.
//
// Without this gate the webhook books the order, decrements stock and schedules
// the artist's transfer against money that has not arrived. Stripe's own
// `checkout.session.async_payment_succeeded` is the event that means it did, and
// this repo already handles it, so refusing the unsettled `completed` loses
// nothing: the same session comes back when it settles.

import type Stripe from "stripe";

/**
 * Stripe's three values, and what each means here.
 *
 *   paid                 the money is in. Proceed.
 *   no_payment_required  a zero-total session (a 100% discount, or a trial that
 *                        bills nothing today). Nothing is owed, so this is
 *                        settled, and gating on `=== "paid"` as the plan
 *                        literally says would refuse a legitimate £0 order.
 *   unpaid               a delayed method that has not cleared. Refuse.
 *
 * ANY OTHER VALUE IS REFUSED, including one Stripe adds later. The two failures
 * are not symmetric: accepting an unknown value books orders and schedules
 * payouts against money that may never arrive, silently, which is the exact
 * thing this gate exists to stop. Refusing one halts booking, which is loud,
 * noticed within minutes and reversible by adding the value here.
 *
 * An ABSENT `payment_status` is the one exception, and it is a compatibility
 * case rather than an unknown-semantics one: older API versions omit the field,
 * and every existing test fixture that builds a session by hand omits it too.
 * The version pin added alongside this makes its presence deterministic in
 * production going forward.
 */
export function isSettled(session: Pick<Stripe.Checkout.Session, "payment_status">): boolean {
  const status = session.payment_status;
  if (status === undefined || status === null) return true;
  return status === "paid" || status === "no_payment_required";
}
