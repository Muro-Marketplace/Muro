-- Add postcode and coordinates to artist_profiles
-- Run this against your Supabase project via the SQL editor or CLI

ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS postcode TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS lat FLOAT,
  ADD COLUMN IF NOT EXISTS lng FLOAT;
