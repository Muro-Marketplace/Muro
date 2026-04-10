-- Wallspace: Artist & Venue profiles + works tables
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New query)

-- Artist profiles
CREATE TABLE IF NOT EXISTS artist_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  profile_image TEXT DEFAULT '',
  banner_image TEXT DEFAULT '',
  short_bio TEXT DEFAULT '',
  extended_bio TEXT DEFAULT '',
  location TEXT DEFAULT '',
  primary_medium TEXT DEFAULT '',
  style_tags TEXT[] DEFAULT '{}',
  themes TEXT[] DEFAULT '{}',
  instagram TEXT DEFAULT '',
  website TEXT DEFAULT '',
  offers_originals BOOLEAN DEFAULT false,
  offers_prints BOOLEAN DEFAULT true,
  offers_framed BOOLEAN DEFAULT false,
  available_sizes TEXT[] DEFAULT ARRAY['A4', 'A3'],
  open_to_commissions BOOLEAN DEFAULT false,
  open_to_free_loan BOOLEAN DEFAULT true,
  open_to_revenue_share BOOLEAN DEFAULT true,
  revenue_share_percent INTEGER DEFAULT 10,
  open_to_outright_purchase BOOLEAN DEFAULT true,
  can_provide_frames BOOLEAN DEFAULT false,
  can_arrange_framing BOOLEAN DEFAULT false,
  delivery_radius TEXT DEFAULT 'Greater London',
  venue_types_suited_for TEXT[] DEFAULT '{}',
  is_founding_artist BOOLEAN DEFAULT false,
  profile_color TEXT DEFAULT '#C17C5A',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Artist works
CREATE TABLE IF NOT EXISTS artist_works (
  id TEXT PRIMARY KEY,
  artist_id UUID REFERENCES artist_profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  medium TEXT DEFAULT '',
  dimensions TEXT DEFAULT '',
  price_band TEXT DEFAULT '',
  pricing JSONB DEFAULT '[]',
  available BOOLEAN DEFAULT true,
  color TEXT DEFAULT '#C17C5A',
  image TEXT NOT NULL,
  orientation TEXT DEFAULT 'landscape',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Venue profiles
CREATE TABLE IF NOT EXISTS venue_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT DEFAULT '',
  location TEXT DEFAULT '',
  contact_name TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  address_line1 TEXT DEFAULT '',
  address_line2 TEXT DEFAULT '',
  city TEXT DEFAULT '',
  postcode TEXT DEFAULT '',
  wall_space TEXT DEFAULT '',
  description TEXT DEFAULT '',
  image TEXT DEFAULT '',
  approximate_footfall TEXT DEFAULT '',
  audience_type TEXT DEFAULT '',
  interested_in_free_loan BOOLEAN DEFAULT true,
  interested_in_revenue_share BOOLEAN DEFAULT true,
  interested_in_direct_purchase BOOLEAN DEFAULT false,
  interested_in_collections BOOLEAN DEFAULT false,
  preferred_styles TEXT[] DEFAULT '{}',
  preferred_themes TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_artist_profiles_slug ON artist_profiles(slug);
CREATE INDEX IF NOT EXISTS idx_artist_profiles_user_id ON artist_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_artist_works_artist_id ON artist_works(artist_id);
CREATE INDEX IF NOT EXISTS idx_venue_profiles_slug ON venue_profiles(slug);
CREATE INDEX IF NOT EXISTS idx_venue_profiles_user_id ON venue_profiles(user_id);

-- RLS policies
ALTER TABLE artist_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE artist_works ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_profiles ENABLE ROW LEVEL SECURITY;

-- Artist profiles: anyone can read, owners can write
CREATE POLICY "artist_profiles_select" ON artist_profiles FOR SELECT USING (true);
CREATE POLICY "artist_profiles_insert" ON artist_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "artist_profiles_update" ON artist_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "artist_profiles_delete" ON artist_profiles FOR DELETE USING (auth.uid() = user_id);

-- Artist works: anyone can read, artist owner can write
CREATE POLICY "artist_works_select" ON artist_works FOR SELECT USING (true);
CREATE POLICY "artist_works_insert" ON artist_works FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM artist_profiles WHERE id = artist_id AND user_id = auth.uid())
);
CREATE POLICY "artist_works_update" ON artist_works FOR UPDATE USING (
  EXISTS (SELECT 1 FROM artist_profiles WHERE id = artist_id AND user_id = auth.uid())
);
CREATE POLICY "artist_works_delete" ON artist_works FOR DELETE USING (
  EXISTS (SELECT 1 FROM artist_profiles WHERE id = artist_id AND user_id = auth.uid())
);

-- Venue profiles: anyone can read, owners can write
CREATE POLICY "venue_profiles_select" ON venue_profiles FOR SELECT USING (true);
CREATE POLICY "venue_profiles_insert" ON venue_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "venue_profiles_update" ON venue_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "venue_profiles_delete" ON venue_profiles FOR DELETE USING (auth.uid() = user_id);
