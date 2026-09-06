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
  "src/app/api/webhooks/resend/route.ts":
    "Resend delivery webhook (WS5.2). Authenticated by the svix signature over the raw " +
    "body (verifySvixSignature, timestamp-bounded); refuses everything when " +
    "RESEND_WEBHOOK_SECRET is unset.",
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
    "Public enquiry form (POST). The artist-facing GET/PATCH added for E27 both " +
    "resolve the caller via getAuthenticatedUser and scope every read and write to " +
    "the artist_slug derived from the token's own artist_profiles row.",
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
  "src/app/api/reports/route.ts":
    "Content reporting (artwork, artist profile, venue profile, collection). Requires a " +
    "Bearer token (reports.reporter_user_id is NOT NULL with an FK to auth.users), so the " +
    "caller is always identified. It imports nothing from @/lib/authz because there is no " +
    "ownership predicate to assert: you report someone ELSE'S content by definition, and an " +
    "assert*() here would refuse exactly the callers the route exists for. The controls that " +
    "replace it: reportSchema closes both the entity type and the reason to fixed enums; the " +
    "reported owner is resolved from the entity's own table and never read from the body; a " +
    "self-report is refused; the entity must exist (404 otherwise); checkRateLimit caps it at " +
    "6/min; and the only row written is a report naming the caller as reporter. Mirrors " +
    "api/messages/report, which has the same shape for conversations.",
  "src/app/api/analytics/track/route.ts":
    "Anonymous event ingest. Append-only, no row is read back to the caller.",
  "src/app/api/account/email/unsubscribe/route.ts":
    "One-click unsubscribe from an email footer. Authenticated by the signed token in the link.",
  "src/app/api/walls/[id]/route.ts":
    "Ownership enforced by the shared resolveAndAuthorize() helper in the same file. " +
    "TODO: migrate to an assert* helper in @/lib/authz and remove this entry.",
  // Task 3 (Artwork of the Week, migration 133 / artist_works.featured_until;
  // migration 134 / feature_artist_work()).
  "src/app/api/artist-works/[id]/feature/route.ts":
    "Authorises by self-scoped on artist_id: getArtistProfileByUserId resolves the " +
    "caller's own artist_profiles row from their session, and that id is passed as " +
    "p_artist_id into feature_artist_work() (migration 134), which matches it inside " +
    "the function, both for the live-boost check and for the UPDATE, so the " +
    "service-role client can only ever read or write the caller's own artist_works " +
    "row. The same pattern the ratchet in authz-import-ratchet.test.ts describes " +
    "as real authorisation, just not routed through the shared @/lib/authz helpers.",
};

module.exports = { PUBLIC_ROUTES };
