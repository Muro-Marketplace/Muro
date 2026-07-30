-- 082: per-artist shipping attribution for multi-artist carts (E9, 04 §B2).
--
-- calculateOrderShipping() already computes shipping per artist group, but only
-- the total survived into cart_sessions, so the webhook had no way to attribute
-- postage to the artist who actually posts the parcel and pooled it onto the
-- first artist instead.
--
-- The plan names this migration 076, which sits inside 02's range (074-079).
-- EXECUTION-DECISIONS D1 gives 04 the range 080-089, and 080/081 are taken, so
-- this is 082.
--
-- NOT NULL with a '{}' default, so every pre-existing row reads as "no per-artist
-- figures" and buildArtistLegs falls back to a pro-rata split rather than
-- treating the shipping as unowed.

ALTER TABLE cart_sessions
  ADD COLUMN IF NOT EXISTS artist_shipping_pence JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN cart_sessions.artist_shipping_pence IS
  'artistSlug -> shipping pence for that artist''s group, from calculateOrderShipping(). Read by buildArtistLegs() to attribute postage per payout leg (E9).';

NOTIFY pgrst, 'reload schema';
