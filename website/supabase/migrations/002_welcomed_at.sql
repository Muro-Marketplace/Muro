-- 037: welcomed_at flag for first-touch onboarding emails
--
-- We fire the welcome email exactly once per profile and set this column
-- to the send time. Next firing reads it and short-circuits. The column
-- is nullable + has no default so anyone backfilled before this migration
-- still gets the welcome on their next eligible trigger.

alter table artist_profiles
  add column if not exists welcomed_at timestamptz;

alter table venue_profiles
  add column if not exists welcomed_at timestamptz;

-- Index so the welcome cron's "WHERE welcomed_at IS NULL" scan stays fast
-- even when the table grows. Partial index keeps it small.
create index if not exists artist_profiles_welcomed_at_null_idx
  on artist_profiles (id) where welcomed_at is null;

create index if not exists venue_profiles_welcomed_at_null_idx
  on venue_profiles (id) where welcomed_at is null;
