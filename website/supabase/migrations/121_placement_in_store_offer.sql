-- 121: the in-store ("buy off the wall") offer moves to the PLACEMENT
-- (owner decision 2026-08-28, superseding the work-level tick box of 120).
--
-- Reasoning: online sells a configurable product (size, frame, shipped);
-- in store sells one specific physical object, in one size, in whatever
-- frame it hangs in. The same work placed at two venues can be framed and
-- priced differently, so the offer belongs to the placement. The artist
-- sets it when marking the piece live on the wall: one prefilled price
-- (placed size tier, plus frame uplift when framed) and a frame-included
-- tick. An offer exists exactly when in_store_price is NOT NULL.
--
-- artist_works.available_in_store (120) stays in place as a legacy fallback
-- for carts created between the two deploys; nothing writes it any more.

ALTER TABLE placements
  ADD COLUMN IF NOT EXISTS in_store_price NUMERIC,
  ADD COLUMN IF NOT EXISTS in_store_frame_included BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN placements.in_store_price IS
  'Buy-off-the-wall price for THIS placed piece, set by the artist at '
  'live-on-wall. NULL = no in-store offer. Cleared when the piece sells.';

COMMENT ON COLUMN placements.in_store_frame_included IS
  'Whether the frame the piece hangs in is included in an off-the-wall sale.';

NOTIFY pgrst, 'reload schema';
