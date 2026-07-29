"use strict";

// Routes that legitimately mutate without an @/lib/authz import.
// Every entry needs a reason. Adding one is a security decision: it is the
// reviewer's job to check the stated alternative control actually exists.
//
// Keys are repo-relative posix paths from `website/`. scripts/audit/check-public-routes.ts
// fails the build if a key stops resolving to a real file, so a renamed or
// deleted route cannot leave a stale exemption behind.
const PUBLIC_ROUTES = {
  "src/app/api/webhooks/stripe/route.ts":
    "Stripe webhook. Authenticated by constructEvent signature verification.",
  "src/app/api/webhooks/supabase/route.ts":
    "Supabase webhook. Authenticated by HMAC over the raw body (verifySignature).",
  "src/app/api/orders/track/route.ts":
    "Guest order tracking. Authenticated by signed token or email match, rate limited.",
  "src/app/api/newsletter/route.ts":
    "Public newsletter signup. Writes only the caller's own submitted email.",
  "src/app/api/waitlist/route.ts":
    "Public waitlist signup. Writes only the caller's own submitted details.",
  "src/app/api/contact/route.ts":
    "Public contact form. Writes an inbound enquiry, reads nothing.",
  "src/app/api/enquiry/route.ts":
    "Public enquiry form. Writes an inbound enquiry, reads nothing.",
  "src/app/api/curation/route.ts":
    "Public bespoke-curation enquiry. Associates a user only when a token is present.",
  "src/app/api/register-venue/route.ts":
    "Public venue registration. Creates a pending row for admin review.",
  "src/app/api/analytics/track/route.ts":
    "Anonymous event ingest. Append-only, no row is read back to the caller.",
  "src/app/api/account/email/unsubscribe/route.ts":
    "One-click unsubscribe from an email footer. Authenticated by the signed token in the link.",
  "src/app/api/walls/[id]/route.ts":
    "Ownership enforced by the shared resolveAndAuthorize() helper in the same file. " +
    "TODO: migrate to an assert* helper in @/lib/authz and remove this entry.",
};

// Routes exempt from the demo-guard requirement.
const DEMO_EXEMPT_ROUTES = {
  ...PUBLIC_ROUTES, // unauthenticated routes have no user id to test
  "src/app/api/demo/login/route.ts":
    "Signs the demo session in. Guarding it would make the demo unreachable.",
  "src/app/api/account/delete/route.ts":
    "Deleting a demo account is harmless and self-correcting on reseed.",
};

module.exports = { PUBLIC_ROUTES, DEMO_EXEMPT_ROUTES };
