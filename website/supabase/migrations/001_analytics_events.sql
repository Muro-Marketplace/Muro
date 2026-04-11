-- Analytics events table for tracking page views, QR scans, venue views, etc.
CREATE TABLE IF NOT EXISTS analytics_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type text NOT NULL,
  artist_slug text,
  work_id text,
  venue_user_id uuid,
  venue_name text,
  visitor_id text,
  referrer text,
  source text,
  qr_label_type text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ae_artist_slug ON analytics_events(artist_slug);
CREATE INDEX IF NOT EXISTS idx_ae_event_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_ae_created_at ON analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_ae_artist_type_date ON analytics_events(artist_slug, event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_ae_venue_user ON analytics_events(venue_user_id) WHERE venue_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ae_venue_name ON analytics_events(venue_name) WHERE venue_name IS NOT NULL;

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Featured artists table
CREATE TABLE IF NOT EXISTS featured_artists (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  artist_slug text NOT NULL,
  featured_date date NOT NULL DEFAULT CURRENT_DATE,
  featured_type text DEFAULT 'daily',
  reason text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(artist_slug, featured_date, featured_type)
);

CREATE INDEX IF NOT EXISTS idx_featured_date ON featured_artists(featured_date DESC);
ALTER TABLE featured_artists ENABLE ROW LEVEL SECURITY;

-- Artist referrals table
CREATE TABLE IF NOT EXISTS artist_referrals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_user_id uuid NOT NULL,
  referrer_slug text NOT NULL,
  referral_code text NOT NULL UNIQUE,
  referred_email text,
  referred_user_id uuid,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  converted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_referral_code ON artist_referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_referral_referrer ON artist_referrals(referrer_user_id);
ALTER TABLE artist_referrals ENABLE ROW LEVEL SECURITY;

-- Add stat cache columns to artist_profiles
ALTER TABLE artist_profiles ADD COLUMN IF NOT EXISTS total_views integer DEFAULT 0;
ALTER TABLE artist_profiles ADD COLUMN IF NOT EXISTS total_enquiries integer DEFAULT 0;
ALTER TABLE artist_profiles ADD COLUMN IF NOT EXISTS total_placements integer DEFAULT 0;
ALTER TABLE artist_profiles ADD COLUMN IF NOT EXISTS total_sales integer DEFAULT 0;
ALTER TABLE artist_profiles ADD COLUMN IF NOT EXISTS referral_code text UNIQUE;
ALTER TABLE artist_profiles ADD COLUMN IF NOT EXISTS email_digest_enabled boolean DEFAULT true;
ALTER TABLE artist_profiles ADD COLUMN IF NOT EXISTS last_digest_sent_at timestamptz;
