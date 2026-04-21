-- ============================================
-- Migration 013: Curation requests (F38)
-- Paid "curated matching for venues" — venues submit a brief + pay
-- a fixed fee, Wallplace hand-curates a shortlist.
-- ============================================

CREATE TABLE IF NOT EXISTS curation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Contact (may be provided by an anonymous submitter)
  venue_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT DEFAULT '',

  -- Brief
  tier TEXT NOT NULL CHECK (tier IN ('single_wall', 'full_space', 'bespoke')),
  venue_type TEXT DEFAULT '',
  location TEXT DEFAULT '',
  style_notes TEXT DEFAULT '',
  audience_notes TEXT DEFAULT '',
  mood_notes TEXT DEFAULT '',
  budget_gbp TEXT DEFAULT '',
  wall_count INTEGER,
  timeframe TEXT DEFAULT '',
  references_notes TEXT DEFAULT '',

  -- Payment
  stripe_checkout_session_id TEXT DEFAULT '',
  stripe_payment_intent_id TEXT DEFAULT '',
  amount_paid_gbp NUMERIC,
  paid_at TIMESTAMPTZ,

  -- Fulfilment
  status TEXT NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment', 'awaiting_quote', 'paid', 'in_progress', 'shortlist_sent', 'completed', 'cancelled', 'refunded')),
  admin_notes TEXT DEFAULT '',

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_curation_requests_status ON curation_requests(status);
CREATE INDEX IF NOT EXISTS idx_curation_requests_email ON curation_requests(contact_email);
CREATE INDEX IF NOT EXISTS idx_curation_requests_requester ON curation_requests(requester_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_curation_requests_session_unique
  ON curation_requests(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL
    AND stripe_checkout_session_id <> '';

ALTER TABLE curation_requests ENABLE ROW LEVEL SECURITY;

-- Authenticated submitters can read their own requests (by user_id when
-- logged in). Anonymous submissions are managed via the service role only.
DO $$ BEGIN
  CREATE POLICY "curation_requests_select_own" ON curation_requests
    FOR SELECT USING (auth.uid() = requester_user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Inserts and updates go through the service role (API routes), so no
-- authenticated INSERT/UPDATE policy.
