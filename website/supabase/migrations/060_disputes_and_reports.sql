-- 060_disputes_and_reports.sql
--
-- Phase 1 chunk 1d. Tables for A1 (admin chat scoped to disputes) and
-- A2 (dispute panel) plus a generic abuse-report queue.
--
-- Additive only. No code reads/writes these yet — Phase 2 owns the UI
-- and the admin surfaces.
--
-- RLS pattern matches curation_requests (mig 013): authenticated users
-- can SELECT their own rows; everything else (insert, update, admin
-- read) goes through the service-role client.

CREATE TABLE IF NOT EXISTS disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opener_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id TEXT,
  order_id TEXT,
  placement_id TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','resolved','closed')),
  category TEXT,
  description TEXT NOT NULL,
  resolution TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS disputes_opener_idx ON disputes(opener_user_id);
CREATE INDEX IF NOT EXISTS disputes_status_idx ON disputes(status, created_at DESC);
CREATE INDEX IF NOT EXISTS disputes_order_idx
  ON disputes(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS disputes_placement_idx
  ON disputes(placement_id) WHERE placement_id IS NOT NULL;

ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "disputes_select_own" ON disputes
    FOR SELECT USING (auth.uid() = opener_user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reported_entity_type TEXT,
  reported_entity_id TEXT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','reviewed','dismissed','escalated')),
  reviewed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reports_reporter_idx ON reports(reporter_user_id);
CREATE INDEX IF NOT EXISTS reports_status_idx ON reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS reports_reported_entity_idx
  ON reports(reported_entity_type, reported_entity_id)
  WHERE reported_entity_type IS NOT NULL;

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "reports_select_own" ON reports
    FOR SELECT USING (auth.uid() = reporter_user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
