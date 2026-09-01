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
  "src/app/api/newsletter/confirm/route.ts":
    "Double opt-in confirmation link. Authenticated by the 122-bit token in the URL, " +
    "the same bearer model as the unsubscribe endpoint: whoever has the link read the " +
    "inbox it was delivered to. Single-use (the token is cleared on success), expires " +
    "after 7 days, and rate limited.",
  "src/app/api/waitlist/route.ts":
    "Public waitlist signup. Writes only the caller's own submitted details.",
  "src/app/api/contact/route.ts":
    "Public contact form. Writes an inbound enquiry, reads nothing.",
  "src/app/api/enquiry/route.ts":
    "Public enquiry form. Writes an inbound enquiry, reads nothing.",
  "src/app/api/curation/route.ts":
    "Public bespoke-curation enquiry. Associates a user only when a token is present.",
  "src/app/api/curation/[id]/checkout/route.ts":
    "Wallplace Programmes, Task 4. Quoted-programme checkout link, emailed by the admin " +
    "quote route once a programme has been priced. Authenticated by the row's id: an " +
    "unguessable, non-enumerable UUIDv4 (gen_random_uuid()), the same 122 bits of " +
    "randomness as the newsletter confirmation token above. Unlike that token, though, " +
    "this link is reusable and never expires, so it carries none of the newsletter " +
    "route's single-use or 7-day-expiry protection; do not describe it as if it did. " +
    "What actually protects this route: the amount charged is never caller-supplied " +
    "(it is quoted_amount_gbp, written only by an authenticated admin), the route 409s " +
    "until that quote exists, the row's status must be pending_payment (closing the " +
    "re-payment hole a paid, refunded or cancelled row would otherwise leave open, since " +
    "quoted_amount_gbp itself is never cleared), and it is rate limited via the same " +
    "checkRateLimit the newsletter confirm route uses.",
  "src/app/api/register-venue/route.ts":
    "Public venue registration. Creates a pending row for admin review.",
  "src/app/api/apply/route.ts":
    "Public artist application. Anyone may apply, so there is no user to authorise. " +
    "It moved to the service-role client in 074/X3, which dropped both WITH CHECK (true) " +
    "INSERT policies on artist_applications: the route is now the only writer. " +
    "Alternative controls: applySchema validation, checkRateLimit, a pending status " +
    "the applicant cannot set past, and an insert of nothing but the submitted form.",
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
  // E23a. Signup finalisation, authenticated by a one-time token rather than a
  // session. A demo session never traverses OAuth or the welcome step: the demo
  // ids are pre-seeded and entered through demo/login, so a guard here could
  // only ever block a real signup.
  "src/app/api/auth/oauth-finalize/route.ts":
    "OAuth signup finalisation, token-authenticated. No demo session reaches it.",
  "src/app/api/auth/welcome/route.ts":
    "Post-signup welcome step, token-authenticated. No demo session reaches it.",
  // E23a. Admin surfaces: an admin is never a demo user, and support needs these
  // to work against demo data when reproducing a report.
  "src/app/api/admin/applications/[id]/route.ts":
    "Admin surface. An admin is never a demo user; support acts on demo data deliberately.",
  // Task 8. Founding-cohort toggle (PATCH is_founding_artist), same shape as
  // the other admin surfaces below.
  "src/app/api/admin/artists/route.ts":
    "Admin surface. An admin is never a demo user; support acts on demo data deliberately.",
  "src/app/api/admin/blogs/[id]/route.ts":
    "Admin surface. An admin is never a demo user; support acts on demo data deliberately.",
  "src/app/api/admin/curation/route.ts":
    "Admin surface. An admin is never a demo user; support acts on demo data deliberately.",
  "src/app/api/admin/curation/quote/route.ts":
    "Admin surface. An admin is never a demo user; support acts on demo data deliberately.",
  "src/app/api/admin/curation/refund/route.ts":
    "Admin surface. An admin is never a demo user; support acts on demo data deliberately.",
  "src/app/api/admin/disputes/[id]/route.ts":
    "Admin surface. An admin is never a demo user; support acts on demo data deliberately.",
  "src/app/api/admin/moderation/route.ts":
    "Admin surface. An admin is never a demo user; support acts on demo data deliberately.",
  // Task 7 Part B. Links/unlinks a placement to a Wallplace Programme.
  "src/app/api/admin/placements/[id]/link-programme/route.ts":
    "Admin surface. An admin is never a demo user; support acts on demo data deliberately.",
};

module.exports = { PUBLIC_ROUTES, DEMO_EXEMPT_ROUTES };
