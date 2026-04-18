-- ============================================
-- Migration 006: Collection work sizes
-- Persist which size (from work.pricing[]) the artist
-- has included for each work in a collection.
-- Shape: [{ workId: string, sizeLabel: string }]
-- ============================================

ALTER TABLE artist_collections
  ADD COLUMN IF NOT EXISTS work_sizes JSONB NOT NULL DEFAULT '[]'::jsonb;
