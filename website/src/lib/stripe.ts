import Stripe from "stripe";

/**
 * The Stripe API version this codebase is written against.
 *
 * 04 §"Open questions", item 2. This used to be unset, which does NOT mean
 * "latest": it means the version configured on the Stripe ACCOUNT applies, and
 * that is a dashboard setting. So the request/response shapes every handler
 * reads were decided somewhere outside this repository, and a version bump made
 * in the dashboard would change them with no code change, no deploy and no
 * review.
 *
 * The shapes that would break quietly are the invoice and subscription ones
 * `lib/placements/paid-loan-billing.ts` reads, and the
 * `subscription.items.data[0].current_period_end` field
 * `lib/stripe-subscription-period.ts` exists to normalise because Stripe has
 * already moved it once.
 *
 * Pinned to the version THIS SDK is built for, not to the newest available.
 * That is the conservative pin: the runtime now returns exactly the shapes the
 * TypeScript types describe, rather than the two being allowed to differ.
 *
 * The pin cannot silently drift. `apiVersion` is typed as a single string
 * literal by the installed SDK, so bumping the `stripe` package without
 * updating this line fails `npm run typecheck` with the old and new versions
 * both named in the error. Upgrading is then a deliberate act with a visible
 * diff, which is the whole point.
 */
export const STRIPE_API_VERSION = "2026-03-25.dahlia";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: STRIPE_API_VERSION,
  typescript: true,
});
