-- 117: account deletion has never been able to complete, for anyone real
--      (owner decision 15, the structural half).
--
-- Decision 15 asked for a one-off scrub of data left behind by completed
-- deletions. Measured against prod: there is NOTHING to scrub — zero orphaned
-- profiles, zero "[deleted-...]" tags, zero scrubbed messages. Checking WHY
-- found the real defect: seven foreign keys reference auth.users with NO
-- ACTION, so `auth.admin.deleteUser` violates a constraint for any user who
-- has a profile, an order, a sent message, an enquiry or a placement — that
-- is, every user the route exists for. Every attempted deletion has died at
-- the final step with "Could not delete auth user".
--
-- (The route's four phantom writes, fixed earlier today, meant the scrubs
-- BEFORE that step were also failing; the two bugs together produced the
-- clean-looking zero-residue state: nothing was ever scrubbed AND nobody was
-- ever deleted.)
--
-- The route's design is anonymise-and-keep: profile rows survive as
-- "[deleted-…]" shells so works, placements and order history keep their
-- joins; orders are retained for tax with the buyer anonymised; messages keep
-- their thread structure with the content replaced. The FK semantics that
-- MATCH that design are ON DELETE SET NULL, which is also what this schema
-- already uses everywhere else (reviewed_by, actor_user_id, changed_by_user_id
-- are all SET NULL). NOT CASCADE: cascading artist_profiles would rip out
-- works and everything hanging off them, which is more than erasure asks and
-- would break the anonymised history the route deliberately keeps.
--
-- The two profile user_id columns must become nullable for SET NULL to be
-- possible. Their UNIQUE constraints are unaffected: Postgres permits any
-- number of NULLs in a unique btree.

ALTER TABLE public.artist_profiles ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.venue_profiles  ALTER COLUMN user_id DROP NOT NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname, c.conrelid::regclass::text AS tbl,
           (SELECT a.attname FROM pg_attribute a
             WHERE a.attrelid = c.conrelid AND a.attnum = c.conkey[1]) AS col
      FROM pg_constraint c
     WHERE c.contype = 'f'
       AND c.confrelid = 'auth.users'::regclass
       AND c.connamespace = 'public'::regnamespace
       AND c.confdeltype = 'a'  -- NO ACTION only; SET NULL / CASCADE stay as they are
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES auth.users(id) ON DELETE SET NULL',
      r.tbl, r.conname, r.col);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
