-- 066_admin_audit_log.sql
--
-- Phase 2.8 A1. Append-only log of every admin action that touches a
-- user's data (chat reads, dispute resolutions, blog approvals). Lets
-- us answer "did anyone read X's messages" without trusting in-app
-- behaviour. RLS-only readable; service-role writes.

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  context JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_admin_idx
  ON admin_audit_log(admin_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_action_idx
  ON admin_audit_log(action, created_at DESC);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
