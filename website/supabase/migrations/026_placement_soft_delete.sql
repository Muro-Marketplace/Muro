-- ============================================
-- Migration 026: Placement soft-delete + cancelled state
-- ============================================
--
-- The bin icon on My Placements used to hard-delete the row, which
-- nuked it for BOTH parties and lost the shared history. We now
-- soft-delete per-side: the deleter hides the row from their own
-- list while the counterparty still sees it (either as "declined" if
-- the offer never went through, or as "cancelled" if it was active
-- and the deleter pulled out). When both sides have hidden the row
-- it can be cleaned up safely.

ALTER TABLE placements
  ADD COLUMN IF NOT EXISTS hidden_for_artist BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hidden_for_venue  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by_user_id UUID REFERENCES auth.users(id);

-- "cancelled" becomes a new terminal status for the Active -> pulled-
-- out transition. The existing check constraint (if any) in your env
-- may need widening; we don't touch it here because it's environment-
-- specific. Application code maps "cancelled" display via
-- lib/placements/status.ts.

CREATE INDEX IF NOT EXISTS idx_placements_hidden_for_artist
  ON placements(hidden_for_artist)
  WHERE hidden_for_artist = false;

CREATE INDEX IF NOT EXISTS idx_placements_hidden_for_venue
  ON placements(hidden_for_venue)
  WHERE hidden_for_venue = false;
