-- 058_moderation_queue.sql
--
-- Phase 1 chunk 1a. Single generic moderation queue keyed by entity_type
-- so blogs (I1/I2), feature requests (K1/A5), and feedback (K2/A6) all
-- flow through one admin pool.
--
-- Additive only. No reads are wired to this table yet — Phase 2 owns the
-- API and the admin UI.
--
-- Access pattern: API routes hit it via the service-role Supabase client
-- (see src/lib/supabase-admin.ts) after gating on getAdminUser() in
-- src/lib/admin-auth.ts. RLS is enabled with no permissive policies so
-- anon and authenticated clients can't read or write it directly. This
-- matches the codebase's prevailing "admin-only via service role"
-- pattern (cf. migration 044_feature_requests.sql).

CREATE TABLE IF NOT EXISTS moderation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL
    CHECK (entity_type IN ('blog','feature_request','feedback')),
  entity_id UUID NOT NULL,
  submitted_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_by_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','edited')),
  decided_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  reason TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS moderation_queue_status_idx
  ON moderation_queue(status, created_at DESC);

CREATE INDEX IF NOT EXISTS moderation_queue_entity_idx
  ON moderation_queue(entity_type, entity_id);

ALTER TABLE moderation_queue ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
