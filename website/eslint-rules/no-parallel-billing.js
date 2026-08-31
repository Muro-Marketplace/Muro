"use strict";

/**
 * K2 (07 §2.7). Subscription creation lives in one place per product.
 *
 * Two implementations could each start a monthly charge for the same placement:
 * `api/placements/[id]/payment/setup` (Stripe Checkout in subscription mode) and
 * `startPaidLoanBilling` in `lib/placements/paid-loan-billing.ts`
 * (`stripe.subscriptions.create` server-side). Their dedup guards could not see
 * each other's state, so flipping PAID_LOAN_V2 on would have billed one venue
 * twice for one placement.
 *
 * Adding a file to ALLOWED is a deliberate, reviewable act. That is the point.
 */

/**
 * Files permitted to create a Stripe subscription or a subscription-mode
 * Checkout session. Suffix-matched against the POSIX-normalised path.
 */
const ALLOWED = [
  // Paid-loan monthly fee: the venue clicks "Set up payment".
  "src/app/api/placements/[id]/payment/setup/route.ts",
  // The artist's own Wallplace plan.
  "src/app/api/subscribe/route.ts",
  // Managed curation retainer. NB: vestigial as of Wallplace Programmes Task 1
  // (the managed_monthly/managed_quarterly tiers this was written for are
  // retired, and no subscription-mode call remains in this file), kept rather
  // than removed because a stale entry here is inert, not a hole.
  "src/app/api/curation/route.ts",
  // Wallplace Programmes, Task 4. The sole subscription entry point for the
  // quoted `programme` product: builds the checkout session for an
  // already-quoted curation_requests row (../admin/curation/quote/route.ts
  // writes the quote; this route is the only place that turns it into a
  // Stripe session). curation/route.ts above never creates one for a
  // programme row (it is quote-first, no Stripe session at enquiry time), so
  // this is a new billing entry point, not a second implementation of an
  // existing one.
  "src/app/api/curation/[id]/checkout/route.ts",
];

/** @type {import("eslint").Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid stripe.subscriptions.create and subscription-mode " +
        "stripe.checkout.sessions.create outside the files that own a billing " +
        "entry point.",
    },
    schema: [],
    messages: {
      parallelBilling:
        "Subscription creation lives in one place per product. Adding a second " +
        "creator is how K2 happened: two implementations could each start a " +
        "monthly charge for the same placement, and neither dedup guard could " +
        "see the other. If this file really is a new billing entry point, add " +
        "it to ALLOWED in eslint-rules/no-parallel-billing.js and say why.",
    },
  },

  create(context) {
    const fn = (context.filename || context.getFilename()).replace(/\\/g, "/");

    // Lint production code, not the mocks a test harness stands up.
    if (/\.test\.[jt]sx?$/.test(fn)) return {};
    if (ALLOWED.some((allowed) => fn.endsWith(allowed))) return {};

    /** `<something>.subscriptions.create(...)` */
    function isSubscriptionsCreate(callee) {
      return (
        callee.type === "MemberExpression" &&
        !callee.computed &&
        callee.property.type === "Identifier" &&
        callee.property.name === "create" &&
        callee.object.type === "MemberExpression" &&
        !callee.object.computed &&
        callee.object.property.type === "Identifier" &&
        callee.object.property.name === "subscriptions"
      );
    }

    /** `<something>.checkout.sessions.create(...)` */
    function isCheckoutSessionsCreate(callee) {
      return (
        callee.type === "MemberExpression" &&
        !callee.computed &&
        callee.property.type === "Identifier" &&
        callee.property.name === "create" &&
        callee.object.type === "MemberExpression" &&
        !callee.object.computed &&
        callee.object.property.type === "Identifier" &&
        callee.object.property.name === "sessions"
      );
    }

    /**
     * True when the first argument is an object literal carrying
     * `mode: "subscription"`.
     *
     * A one-off payment Checkout session is not a billing entry point and must
     * stay lintable-free, so only the subscription mode is flagged. A params
     * object built in a variable is out of reach here; that is the accepted
     * limit of a syntactic rule, and the integration test in
     * tests/integration/paid-loan-single-path.test.ts covers the file-level
     * invariant regardless.
     */
    function isSubscriptionMode(node) {
      const first = node.arguments[0];
      if (!first || first.type !== "ObjectExpression") return false;
      return first.properties.some(
        (prop) =>
          prop.type === "Property" &&
          !prop.computed &&
          ((prop.key.type === "Identifier" && prop.key.name === "mode") ||
            (prop.key.type === "Literal" && prop.key.value === "mode")) &&
          prop.value.type === "Literal" &&
          prop.value.value === "subscription",
      );
    }

    return {
      CallExpression(node) {
        const callee = node.callee;
        if (!callee || callee.type !== "MemberExpression") return;

        if (isSubscriptionsCreate(callee)) {
          context.report({ node, messageId: "parallelBilling" });
          return;
        }

        if (isCheckoutSessionsCreate(callee) && isSubscriptionMode(node)) {
          context.report({ node, messageId: "parallelBilling" });
        }
      },
    };
  },
};
