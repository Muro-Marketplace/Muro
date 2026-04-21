-- ============================================
-- Migration 014: Venue approval on loan / consignment record (F43)
-- ============================================

ALTER TABLE placement_records
  ADD COLUMN IF NOT EXISTS venue_approved BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE placement_records
  ADD COLUMN IF NOT EXISTS venue_approved_at TIMESTAMPTZ;
