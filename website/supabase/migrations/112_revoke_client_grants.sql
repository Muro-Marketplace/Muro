-- 112: take back grants no client role has ever needed (owner decision 12).
--
-- Supabase's stock default privileges grant `anon` and `authenticated` the full
-- set — SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER — on every
-- table in `public`. That is the platform default, not something Wallplace did,
-- and PostgREST exposes no verb for the last three, so none of it is reachable
-- through the API today. It is still wider than anything needs, and two things
-- make the width matter rather than being theoretical:
--
--   1. TRUNCATE is NOT subject to row-level security. RLS filters SELECT,
--      INSERT, UPDATE and DELETE; a table-level TRUNCATE right is not a row
--      operation and no policy constrains it. So on every one of these tables,
--      RLS is not the last line of defence people assume it is.
--
--   2. The 20 tables in part 1 are service-role-only by design: RLS on, zero
--      policies, documented in docs/security/service-role-only-tables.md. Their
--      protection is the ABSENCE of a policy. Add one permissive policy to any
--      of them, for any reason, and the standing table grant is already there to
--      meet it. `contact_submissions` is the sharpest case in the same family:
--      one SELECT policy away from publishing every name, address and message
--      body it holds.
--
-- Two parts, and the split is deliberate.
--
-- PART 1 revokes EVERYTHING from the service-role-only tables. Safe by
-- construction: RLS with no policy already denies every client operation, so any
-- code path this could break is a path that does not work today. Verified: the
-- only client-looking reference (`account/email/unsubscribe/page.tsx` touching
-- `email_preferences`) is a server component using the service-role client.
--
-- PART 2 revokes only TRUNCATE, REFERENCES and TRIGGER, everywhere else. Those
-- tables DO serve clients through RLS policies, so their SELECT/INSERT/UPDATE/
-- DELETE grants stay exactly as they are. This changes no reachable behaviour
-- and closes the RLS-does-not-cover-TRUNCATE gap across the whole schema.
--
-- Reversible: re-GRANT. Nothing is dropped and no row is touched.

-- ── Part 1: service-role-only tables ─────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND c.relrowsecurity
       AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;

-- ── Part 2: the three nobody needs, on every other table ─────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format(
      'REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;

-- Future tables inherit the same defaults, so this does not have to be
-- remembered on every migration. Scoped to the role that owns the schema.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
