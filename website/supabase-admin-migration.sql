-- Admin Dashboard: artist_applications table
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS artist_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  location TEXT,
  instagram TEXT,
  website TEXT,
  primary_medium TEXT,
  portfolio_link TEXT,
  artist_statement TEXT,
  offers_originals BOOLEAN DEFAULT false,
  offers_prints BOOLEAN DEFAULT false,
  offers_framed BOOLEAN DEFAULT false,
  offers_commissions BOOLEAN DEFAULT false,
  open_to_free_loan BOOLEAN DEFAULT false,
  open_to_revenue_share BOOLEAN DEFAULT false,
  open_to_purchase BOOLEAN DEFAULT false,
  delivery_radius TEXT,
  venue_types TEXT[] DEFAULT '{}',
  themes TEXT[] DEFAULT '{}',
  hear_about TEXT,
  selected_plan TEXT DEFAULT 'core',
  status TEXT DEFAULT 'pending',
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies
ALTER TABLE artist_applications ENABLE ROW LEVEL SECURITY;

-- Anyone can submit an application (no auth required)
CREATE POLICY "Anyone can insert applications"
  ON artist_applications FOR INSERT
  WITH CHECK (true);

-- Authenticated users can read applications (admin check done in API)
CREATE POLICY "Authenticated users can read applications"
  ON artist_applications FOR SELECT
  USING (auth.role() = 'authenticated');

-- Service role handles updates (accept/reject)
CREATE POLICY "Service role can update applications"
  ON artist_applications FOR UPDATE
  USING (true);
