-- 113: 112 swept TABLES. Views hold grants too.
--
-- 112's two DO blocks filtered on `relkind = 'r'`, so `email_recent_sends` — the
-- one view in `public` — kept the full stock grant set for `anon` and
-- `authenticated`, TRUNCATE included. Verified after applying 112: six grants
-- left, all six on that view.
--
-- Nothing in `src/` reads it. It is an email-infrastructure view over
-- `email_events`, created in 016 and rebuilt in 070 as `security_invoker = true`
-- so it runs with the caller's rights rather than the definer's. That last part
-- means a client selecting from it is already stopped by the base table, which
-- 112 just took every client grant off. So this is the second lock on a door
-- with no handle, and it costs nothing.
--
-- The sweep covers every relkind that can carry a grant, not just views, so a
-- materialised view or a partitioned table added later is included without
-- anyone remembering. `r` is in the list too: re-running is a no-op and leaving
-- it out would mean two places to update.

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname, c.relkind
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'v', 'm', 'p', 'f')
  LOOP
    EXECUTE format(
      'REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon, authenticated', r.relname);
  END LOOP;
END $$;

-- Nothing reads this view, so it gets the full treatment rather than the three.
REVOKE ALL ON public.email_recent_sends FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
