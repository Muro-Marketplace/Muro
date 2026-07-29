-- 046_artwork_requests_and_commissions.sql
-- Request 2 — venue-led artwork demand. Venues post what they're looking
-- for; artists browse + respond. Responses convert to placements,
-- offers, or commissions on accept.

CREATE TABLE IF NOT EXISTS artwork_requests (
  id TEXT PRIMARY KEY,
  venue_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_slug TEXT,
  wall_id UUID,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  artwork_types TEXT[] NOT NULL DEFAULT '{}',
  styles TEXT[] NOT NULL DEFAULT '{}',
  subjects TEXT[] NOT NULL DEFAULT '{}',
  mediums TEXT[] NOT NULL DEFAULT '{}',
  min_dimension_cm INTEGER,
  max_dimension_cm INTEGER,
  budget_min_pence INTEGER,
  budget_max_pence INTEGER,
  intent TEXT[] NOT NULL DEFAULT '{}',
  location TEXT,
  timescale TEXT,
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public','semi_public','private')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','closed','fulfilled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_artwork_requests_venue ON artwork_requests(venue_user_id);
CREATE INDEX IF NOT EXISTS idx_artwork_requests_status ON artwork_requests(status);
CREATE INDEX IF NOT EXISTS idx_artwork_requests_visibility ON artwork_requests(visibility);
CREATE INDEX IF NOT EXISTS idx_artwork_requests_created ON artwork_requests(created_at DESC);

CREATE TABLE IF NOT EXISTS artwork_request_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT NOT NULL REFERENCES artwork_requests(id) ON DELETE CASCADE,
  artist_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  artist_slug TEXT,
  response_type TEXT NOT NULL
    CHECK (response_type IN ('existing_works','placement','offer','commission','message')),
  message TEXT NOT NULL,
  work_ids TEXT[] NOT NULL DEFAULT '{}',
  proposed_offer_amount_pence INTEGER,
  proposed_commission_amount_pence INTEGER,
  proposed_commission_timeline TEXT,
  linked_offer_id TEXT REFERENCES purchase_offers(id) ON DELETE SET NULL,
  linked_placement_id TEXT,
  linked_commission_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent','accepted','declined','countered','withdrawn')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_response_request ON artwork_request_responses(request_id);
CREATE INDEX IF NOT EXISTS idx_response_artist ON artwork_request_responses(artist_user_id);
CREATE INDEX IF NOT EXISTS idx_response_status ON artwork_request_responses(status);

CREATE TABLE IF NOT EXISTS commissions (
  id TEXT PRIMARY KEY,
  request_id TEXT REFERENCES artwork_requests(id) ON DELETE SET NULL,
  artist_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  artist_slug TEXT,
  buyer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  buyer_type TEXT NOT NULL CHECK (buyer_type IN ('customer','venue')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_pence INTEGER NOT NULL CHECK (amount_pence > 0),
  currency TEXT NOT NULL DEFAULT 'GBP',
  timeline TEXT,
  deposit_pence INTEGER,
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed','accepted','in_progress','submitted','revisions','approved','paid','cancelled')),
  conversation_id TEXT,
  paid_at TIMESTAMPTZ,
  paid_order_id TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commissions_artist ON commissions(artist_user_id);
CREATE INDEX IF NOT EXISTS idx_commissions_buyer ON commissions(buyer_user_id);
CREATE INDEX IF NOT EXISTS idx_commissions_status ON commissions(status);

ALTER TABLE artwork_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE artwork_request_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
