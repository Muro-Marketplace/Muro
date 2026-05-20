-- 050_notification_prefs.sql
--
-- Backfill notification-preference columns so the new
-- /api/account/preferences GET/PATCH endpoint has somewhere to read and
-- write per-role. Defaults are all opt-in (`true`) so the act of running
-- this migration does not silently change communication preferences.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS makes it safe to re-run.
--
-- Note on customer_profiles: the file `supabase/migrations/001_analytics_events.sql`
-- in the repo defines customer_profiles, but that early migration was never
-- applied to production (the prod DB was bootstrapped from
-- `supabase-all-migrations.sql` at the repo root, which omits the table). To
-- avoid making this migration fail in environments where customer_profiles
-- doesn't exist, the customer ALTER is wrapped in a conditional DO block. If
-- a future plan introduces the table, re-running this migration will pick up
-- the columns.
--
-- artist_profiles already has email_digest_enabled + message_notifications_enabled;
-- this only adds order_notifications_enabled.
-- venue_profiles already has message_notifications_enabled; this only adds
-- email_digest_enabled. (Plan C does not surface order_notifications_enabled
-- to venues — venues don't place orders — so it is intentionally not added.)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'customer_profiles'
  ) THEN
    ALTER TABLE customer_profiles
      ADD COLUMN IF NOT EXISTS email_digest_enabled boolean DEFAULT true,
      ADD COLUMN IF NOT EXISTS message_notifications_enabled boolean DEFAULT true,
      ADD COLUMN IF NOT EXISTS order_notifications_enabled boolean DEFAULT true;
  END IF;
END $$;

ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS order_notifications_enabled boolean DEFAULT true;

ALTER TABLE venue_profiles
  ADD COLUMN IF NOT EXISTS email_digest_enabled boolean DEFAULT true;
