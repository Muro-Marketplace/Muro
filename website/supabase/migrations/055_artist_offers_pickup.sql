-- Migration 055: per-artist "Collect from artist" opt-in.
--
-- The checkout page lets buyers choose "Collect from artist" as a
-- fulfilment method. Previously this was always offered, regardless of
-- whether the artist was willing to hand work over in person. Some
-- artists work out of a studio they don't want strangers visiting, so
-- pickup needs to be explicit opt-in.
--
-- Defaults to FALSE so the change is safe to ship — existing artists
-- only start seeing pickup requests once they toggle the option on in
-- the profile editor.

ALTER TABLE artist_profiles
ADD COLUMN IF NOT EXISTS offers_pickup BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN artist_profiles.offers_pickup IS
  'Artist has opted in to letting buyers collect orders in person. Drives the "Collect from artist" fulfilment option at checkout.';
