-- ============================================
-- Migration 008: Placement requester tracking
-- Required for F22 (accept/reject from either side)
-- ============================================

ALTER TABLE placements
  ADD COLUMN IF NOT EXISTS requester_user_id UUID REFERENCES auth.users(id);

-- Backfill: for legacy rows, assume the artist was the requester
-- (historical default — the venue was the one who accepted).
UPDATE placements
SET requester_user_id = artist_user_id
WHERE requester_user_id IS NULL
  AND artist_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_placements_requester
  ON placements(requester_user_id);
