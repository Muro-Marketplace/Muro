-- 101: create admin_users properly (03 §1.4 step 1, E30b/E35d).
--
-- `src/lib/admin-auth.ts` has queried this table since ADR 0001, and it has
-- never existed. The only SQL reference in the repo is a conditional RLS enable
-- in 034_rls_core_tables.sql, guarded by an IF EXISTS that has always been
-- false. Confirmed against prod 2026-08-28: `SELECT to_regclass('public.admin_users')`
-- returns NULL.
--
-- So the deployed predicate is not the three-source conjunction ADR 0001
-- describes. The PostgREST select errors, `data` comes back null,
-- `Array.isArray(null)` is false, and the branch always returns false. The live
-- rule collapses to:
--
--   user_metadata.user_type = 'admin'  AND  email IN ADMIN_EMAILS
--
-- Creating the table is purely additive: it grants nobody anything on its own
-- (it ships empty, and it is the second operand of an OR whose first operand is
-- unchanged), and it is the prerequisite for ever removing the user_metadata
-- conjunct without locking every admin out. That removal is a separate,
-- owner-gated step; 03 §1.4 is explicit that create-and-backfill must land
-- first, and this is the create.
--
-- Idempotent, because an out-of-band table may exist in an environment other
-- than the one checked.

CREATE TABLE IF NOT EXISTS admin_users (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Who granted it. Nullable because the first rows are backfilled from
  -- ADMIN_EMAILS by a script, with no acting admin to attribute them to.
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  note       TEXT
);

-- Service role only. Every read goes through admin-auth.ts, which uses the
-- service key and bypasses RLS. Enabling RLS with no policy means anon and
-- authenticated can read and write nothing, so the table cannot become a
-- self-service route to admin.
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Belt and braces alongside RLS: revoke the table grants outright, so a future
-- policy added without thinking cannot open it up. 071/076 established this
-- pattern after finding that a column REVOKE is a silent no-op while a table
-- grant stands.
REVOKE ALL ON TABLE admin_users FROM anon, authenticated, PUBLIC;
GRANT ALL ON TABLE admin_users TO service_role;

COMMENT ON TABLE admin_users IS
  'Server-owned admin grants. Second operand of the admin predicate in src/lib/admin-auth.ts, alongside the ADMIN_EMAILS env allowlist. Service-role only: never expose to anon or authenticated.';

NOTIFY pgrst, 'reload schema';
