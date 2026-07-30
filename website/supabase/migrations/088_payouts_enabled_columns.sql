-- 088: payout-capability columns for canReceivePayout (C1, 04 §C1).
--
-- charges_enabled alone does not tell us we can forward money: a Connect account
-- can accept charges while payouts are disabled (mid-KYC, failed verification,
-- restricted for review). canReceivePayout gates on payouts_enabled and caches
-- the Stripe answer on the profile for 60s. artist_profiles already has
-- stripe_charges_enabled + stripe_charges_checked_at, so it only needs the
-- payouts flag. venue_profiles has neither and venues are now first-class payout
-- targets (per-artist/venue legs), so it needs all three.
--
-- Migration number: EXECUTION-DECISIONS D1 gives 04 the 080-089 range; 080-087
-- are taken, so this is 088. (The doc drafted it as 084, before that number was
-- taken by stripe_webhook_events.)

ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled BOOLEAN;

ALTER TABLE venue_profiles
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled    BOOLEAN,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled    BOOLEAN,
  ADD COLUMN IF NOT EXISTS stripe_charges_checked_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
