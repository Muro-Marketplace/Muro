-- 045_purchase_offers.sql
-- Request 1 — Purchase offers on works or whole collections.

CREATE TABLE IF NOT EXISTS purchase_offers (
  id TEXT PRIMARY KEY,
  buyer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  buyer_type TEXT NOT NULL CHECK (buyer_type IN ('customer','venue')),
  buyer_email TEXT,
  artist_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  artist_slug TEXT,
  work_ids TEXT[] NOT NULL DEFAULT '{}',
  collection_id TEXT,
  amount_pence INTEGER NOT NULL CHECK (amount_pence > 0),
  currency TEXT NOT NULL DEFAULT 'GBP',
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','declined','countered','expired','withdrawn','paid')),
  conversation_id TEXT,
  expires_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  paid_order_id TEXT,
  parent_offer_id TEXT REFERENCES purchase_offers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_target_shape CHECK (
    (cardinality(work_ids) > 0 AND collection_id IS NULL) OR
    (cardinality(work_ids) = 0 AND collection_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_offers_buyer ON purchase_offers(buyer_user_id);
CREATE INDEX IF NOT EXISTS idx_offers_artist ON purchase_offers(artist_user_id);
CREATE INDEX IF NOT EXISTS idx_offers_status ON purchase_offers(status);
CREATE INDEX IF NOT EXISTS idx_offers_created ON purchase_offers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_offers_collection ON purchase_offers(collection_id) WHERE collection_id IS NOT NULL;

ALTER TABLE purchase_offers ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
