-- ============================================
-- Migration 004: Pre-Launch Features
-- Terms acceptance, Stripe Connect, Saved items
-- ============================================

-- 1. Terms acceptance tracking
CREATE TABLE IF NOT EXISTS terms_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  user_email TEXT NOT NULL,
  user_type TEXT NOT NULL,
  terms_version TEXT NOT NULL,
  terms_type TEXT NOT NULL,
  accepted_at TIMESTAMPTZ DEFAULT now(),
  ip_address TEXT DEFAULT '',
  user_agent TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_terms_acceptances_user_id ON terms_acceptances(user_id);
CREATE INDEX IF NOT EXISTS idx_terms_acceptances_email ON terms_acceptances(user_email);

ALTER TABLE terms_acceptances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "terms_insert" ON terms_acceptances FOR INSERT WITH CHECK (true);
CREATE POLICY "terms_select" ON terms_acceptances FOR SELECT USING (auth.uid() = user_id);

-- 2. Stripe Connect columns on venue_profiles
ALTER TABLE venue_profiles ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT DEFAULT '';
ALTER TABLE venue_profiles ADD COLUMN IF NOT EXISTS stripe_connect_onboarding_complete BOOLEAN DEFAULT false;

-- 3. Stripe Connect columns on artist_profiles
ALTER TABLE artist_profiles ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT DEFAULT '';
ALTER TABLE artist_profiles ADD COLUMN IF NOT EXISTS stripe_connect_onboarding_complete BOOLEAN DEFAULT false;

-- 4. Stripe transfers tracking
CREATE TABLE IF NOT EXISTS stripe_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL,
  recipient_type TEXT NOT NULL,
  recipient_user_id UUID,
  stripe_transfer_id TEXT NOT NULL,
  stripe_connect_account_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'gbp',
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_transfers_order_id ON stripe_transfers(order_id);
CREATE INDEX IF NOT EXISTS idx_stripe_transfers_recipient ON stripe_transfers(recipient_user_id);

ALTER TABLE stripe_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transfers_select" ON stripe_transfers FOR SELECT USING (auth.uid() = recipient_user_id);

-- 5. Saved items (customer favourites)
CREATE TABLE IF NOT EXISTS saved_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  item_type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, item_type, item_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_items_user ON saved_items(user_id);

ALTER TABLE saved_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "saved_items_select" ON saved_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "saved_items_insert" ON saved_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "saved_items_delete" ON saved_items FOR DELETE USING (auth.uid() = user_id);

-- 6. Enforce one active placement per artist+venue combo
CREATE UNIQUE INDEX IF NOT EXISTS idx_placements_unique_active
  ON placements(artist_slug, venue_slug)
  WHERE status = 'active';
