# Service-role-only tables

`scripts/audit/check-regressions.ts` has referenced this file since it was
written. **It did not exist.** Created 2026-08-28.

## The pattern

These tables have RLS **enabled** and **no policy**. That is not an oversight and
the Supabase advisor's `rls_enabled_no_policy` INFO lint on them is expected.

They are read and written only by API routes holding the service-role key, which
bypasses RLS entirely. A client policy would open a direct-write path around the
route's business logic: its validation, its authorisation checks, its rate limit
and its audit row. Deny-all to clients is the correct secure state, and the
`REVOKE ALL ... FROM anon, authenticated, PUBLIC` alongside it matters
separately, because Supabase grants those roles explicitly rather than through
PUBLIC, so RLS alone leaves a table-level grant standing.

Every table below is in `scripts/audit/known-acceptable.json`. **The two lists
must agree**: a table in one and not the other is either an unexplained
suppression or a nightly job that fails on a deliberate design.

## The tables

| table | written by |
|---|---|
| `admin_audit_log` | `lib/admin-audit.ts`, every admin mutation |
| `admin_users` | `scripts/backfill-admin-users.ts` only. Migration 101 |
| `analytics_events` | `api/analytics/track` |
| `artist_applications` | `api/apply`, `api/admin/applications/[id]` |
| `artist_referrals` | the referral flow |
| `artwork_requests`, `artwork_request_responses` | `api/artwork-requests/**` |
| `cart_sessions` | `lib/cart-sessions.ts`, the checkout data-of-record |
| `commissions` | `api/artwork-requests/[id]/fulfill` |
| `conversation_reports` | `api/messages/report`. Migration 111 |
| `email_events`, `email_preferences`, `email_suppressions` | `lib/email/send.ts` |
| `feature_requests`, `feature_request_upvotes` | `api/feature-requests/**` |
| `featured_artists` | the homepage rotation |
| `moderation_queue` | `api/moderation`, `api/blogs/[id]` |
| `order_events` | `lib/orders/lifecycle.ts` |
| `placement_record_versions` | `api/placements/[id]/record`. Migration 111 |
| `placement_reviews` | `api/placements/[id]/review` |
| `programme_rent_accruals` | `lib/curation/programme-rent.ts`, called from the webhook's programme `invoice.paid` branch. Migration 122 |
| `purchase_offers` | `api/offers/**` |
| `stripe_webhook_events` | the webhook's event-dedup claim |
| `user_blocks` | `api/messages/block`. Migration 111 |
| `visualizer_quota_overrides` | admin grants only |

## Adding one

1. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` with no policy.
2. `REVOKE ALL ON TABLE ... FROM anon, authenticated, PUBLIC;`
3. `GRANT ALL ON TABLE ... TO service_role;`
4. Add `rls_enabled_no_policy_public_<table>` to `known-acceptable.json`.
5. Add a row above.

Migration 111 is the worked example. Skipping step 4 does not fail
`npm run check` — the advisor job is nightly, per ledger row 0b — so it fails
later and in a different place, which is how `artist_applications` and
`stripe_webhook_events` came to be live and unlisted for months.
