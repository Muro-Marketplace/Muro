-- 045_artist_charges_cache.sql
--
-- 60-second cache columns for the Stripe Connect charges_enabled
-- pre-flight check (Plan B Task 7). canArtistAcceptOrders() reads
-- these to avoid hitting Stripe on every checkout.

ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled boolean,
  ADD COLUMN IF NOT EXISTS stripe_charges_checked_at timestamptz;
