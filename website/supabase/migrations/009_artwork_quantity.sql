-- ============================================
-- Migration 009: Artwork quantity (F10)
-- Artists can declare how many units of a work are available.
-- NULL = unlimited / not tracked (back-compat with existing rows).
-- ============================================

ALTER TABLE artist_works
  ADD COLUMN IF NOT EXISTS quantity_available INTEGER DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_artist_works_quantity
  ON artist_works(quantity_available)
  WHERE quantity_available IS NOT NULL;
