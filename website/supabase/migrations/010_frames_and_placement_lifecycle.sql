-- ============================================
-- Migration 010: Frame options + placement lifecycle (F13, F27)
-- - artist_works.frame_options JSONB: [{label, priceUplift}]
-- - placements: sub-status timestamps for the "art on wall" flow
-- ============================================

-- Frame options on artworks (F27)
ALTER TABLE artist_works
  ADD COLUMN IF NOT EXISTS frame_options JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Placement lifecycle timestamps (F13)
-- NULL means that stage has not been reached yet. accepted_at is set when the
-- placement transitions from pending → active (mirrors responded_at but named
-- explicitly for the lifecycle timeline).
ALTER TABLE placements ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
ALTER TABLE placements ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;
ALTER TABLE placements ADD COLUMN IF NOT EXISTS installed_at TIMESTAMPTZ;
ALTER TABLE placements ADD COLUMN IF NOT EXISTS live_from TIMESTAMPTZ;
ALTER TABLE placements ADD COLUMN IF NOT EXISTS collected_at TIMESTAMPTZ;

-- Backfill accepted_at from responded_at where the placement was accepted
UPDATE placements
SET accepted_at = responded_at
WHERE accepted_at IS NULL AND status = 'active' AND responded_at IS NOT NULL;
