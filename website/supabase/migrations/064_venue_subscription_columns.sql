-- 064_venue_subscription_columns.sql
--
-- Phase 2 chunk 2.0a. Adds the four subscription columns to
-- venue_profiles so isSubscribed (src/lib/subscriptions.ts) can stop
-- tolerating "column does not exist" errors and the tier-resolver
-- comment that flagged this as [future] can be retired.
--
-- Additive only. No behaviour change. Every existing venue row gets
-- subscription_status='none', which is correct: those venues have
-- never paid, and the helper already treats 'none' as inactive.

ALTER TABLE venue_profiles
  ADD COLUMN IF NOT EXISTS subscription_status text
    DEFAULT 'none'
    CHECK (subscription_status IN ('none','trialing','active','past_due','cancelled')),
  ADD COLUMN IF NOT EXISTS subscription_plan text
    CHECK (subscription_plan IS NULL OR subscription_plan IN ('standard','premium')),
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

CREATE INDEX IF NOT EXISTS venue_profiles_subscription_status_idx
  ON venue_profiles(subscription_status);

NOTIFY pgrst, 'reload schema';
