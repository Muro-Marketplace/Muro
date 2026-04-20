-- ============================================
-- Migration 007: Notifications + Placement Flags
-- - F18 backend: qr_enabled, monthly_fee_gbp on placements
-- - F8:  persistent notifications table with RLS
-- ============================================

-- 1. Placement flags (F18)
ALTER TABLE placements ADD COLUMN IF NOT EXISTS qr_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE placements ADD COLUMN IF NOT EXISTS monthly_fee_gbp NUMERIC DEFAULT NULL;

-- 2. Notifications table (F8)
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  link TEXT DEFAULT '',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id) WHERE read_at IS NULL;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "notifications_select_own" ON notifications
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "notifications_update_own" ON notifications
    FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Inserts go through the service role (server-side only), so no INSERT policy
-- is defined for authenticated users. Service role bypasses RLS.
