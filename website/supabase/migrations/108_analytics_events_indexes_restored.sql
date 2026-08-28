-- 108: restore three analytics_events indexes the repo drops and never recreates
--      (07 K10d, and the first measured instance of K11's thesis).
--
-- K10d asks whether the deleted `002_run_me.sql` was ever applied to production.
-- It was, and this is the proof: three indexes it created —
-- `idx_analytics_artist`, `idx_analytics_type`, `idx_analytics_venue` — are live
-- in production and are created by NO committed migration. `002_run_me.sql` was
-- added in b22c19d, deleted in 72b1f72 the same day, and never joined the
-- numbered series.
--
-- THE DEFECT THAT LEAVES BEHIND.
--
-- `001_analytics_events.sql` creates the same three indexes under its own names
-- (`idx_ae_artist_slug`, `idx_ae_event_type`, `idx_ae_venue_name`). Migration
-- `070_qa44_db_hardening.sql:88-90` then drops all three as "redundant duplicate
-- indexes" — correctly, because in PRODUCTION they duplicated the
-- `idx_analytics_*` set. But 070 could only drop what the repo knew about, and
-- the repo has never known about `idx_analytics_*`.
--
-- So the two environments diverge:
--
--   production      keeps idx_analytics_artist / _type / _venue (un-migrated,
--                   and doing 837 / 1079 / 130 scans, so load-bearing)
--   a fresh build   creates 001's three, drops them at 070, and ends with NO
--                   index on analytics_events(artist_slug), (event_type) or
--                   (venue_name) at all
--
-- `analytics_events` is the highest-write, highest-read table in the system.
-- A preview branch, a CI database or a rebuilt production would sequential-scan
-- every artist analytics query. That is K11's argument — "a fresh database built
-- from the repo alone reaches the same schema as production" — failing, in one
-- measurable place.
--
-- Every OTHER index 070 drops was checked against production and is genuinely
-- covered by a UNIQUE constraint index that a committed migration creates
-- (artist_profiles_user_id_key, artist_profiles_slug_key,
-- artist_profiles_referral_code_key, artist_referrals_referral_code_key,
-- cart_sessions_stripe_session_id_key, newsletter_subscribers_email_key,
-- placement_records_placement_id_key, venue_profiles_slug_key,
-- venue_profiles_user_id_key). This is the only unreplaced drop.
--
-- The names here match PRODUCTION, not 001, so applying this is a genuine no-op
-- there rather than a second copy under a different name. Purely additive.

CREATE INDEX IF NOT EXISTS idx_analytics_artist
  ON public.analytics_events (artist_slug);

CREATE INDEX IF NOT EXISTS idx_analytics_type
  ON public.analytics_events (event_type);

CREATE INDEX IF NOT EXISTS idx_analytics_venue
  ON public.analytics_events (venue_name) WHERE venue_name IS NOT NULL;
