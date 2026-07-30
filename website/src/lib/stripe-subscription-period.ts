// Reading a Stripe subscription's current period, in one place (E11b).
//
// Two traps, both of which have bitten this codebase:
//
//   1. SDK 22+ moved `current_period_start` / `current_period_end` OFF the
//      subscription and ONTO the subscription item. Reading them from the
//      subscription yields undefined.
//   2. `?? 0` then turns that undefined into the Unix epoch, so
//      `new Date(0 * 1000)` stamps 1970-01-01. The artist billing page showed a
//      subscription that expired 56 years ago, and the upgrade email quoted
//      "1 January 1970" as the next billing date.
//
// Lived in paid-loan-billing.ts until the artist-subscription webhook branch
// needed it too. It is not paid-loan specific, and a second copy is how the two
// would drift, so it lives here and both import it.

import type Stripe from "stripe";

/** Period bounds as epoch seconds, or null when Stripe did not send them. */
export function periodFromSubscription(subscription: Stripe.Subscription): {
  cpStart: number | null;
  cpEnd: number | null;
} {
  const firstItem = subscription.items?.data?.[0] as
    | { current_period_start?: number; current_period_end?: number }
    | undefined;
  return {
    cpStart: firstItem?.current_period_start ?? null,
    cpEnd: firstItem?.current_period_end ?? null,
  };
}

/** Epoch seconds to ISO, treating 0 and null alike so no row is stamped 1970. */
export function epochToIso(seconds: number | null | undefined): string | null {
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

/**
 * Epoch seconds as a UK date for customer-facing copy, or a phrase that reads
 * correctly when the date is unknown. Never "1 January 1970".
 */
export function epochToUkDate(
  seconds: number | null | undefined,
  fallback = "your next billing date",
): string {
  if (!seconds) return fallback;
  return new Date(seconds * 1000).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
