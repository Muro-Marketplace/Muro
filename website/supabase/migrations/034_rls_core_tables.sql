-- ============================================
-- Migration 034: RLS on core tables (Phase 0 security hardening)
-- ============================================
--
-- Context:
-- Core user-data tables (artist_profiles, venue_profiles, artist_works,
-- placements, orders, artist_applications, reviews, conversations) were
-- never given explicit RLS policies. If Supabase's default anon SELECT
-- grant is in place, an attacker with the public anon key can read every
-- row from the browser.
--
-- Strategy:
-- 1. Enable RLS on every core table.
-- 2. Keep existing policies (migration 012 already wrote some for messages,
--    refund_requests, and others).
-- 3. Add deny-by-default for INSERT/UPDATE/DELETE by not creating
--    client-facing policies for mutations. All mutations happen via the
--    server-side service-role client (which bypasses RLS), so client
--    writes are blocked.
-- 4. Add explicit SELECT policies for the rows clients legitimately need:
--      - own profile rows
--      - public profile rows (where review_status = 'approved')
--      - own orders
--      - placement rows where the viewer is a party
--
-- Verification:
-- After applying, confirm the anon role cannot read arbitrary rows:
--   -- Should return 0 rows when run against the anon role:
--   select count(*) from artist_profiles;
--   select count(*) from orders;
--
-- Rollback:
-- To disable RLS again (NOT recommended):
--   alter table <name> disable row level security;

-- ---------- artist_profiles ----------
ALTER TABLE artist_profiles ENABLE ROW LEVEL SECURITY;

-- Anyone may read an approved artist's profile (public discovery).
DROP POLICY IF EXISTS "artist_profiles_select_public" ON artist_profiles;
CREATE POLICY "artist_profiles_select_public" ON artist_profiles
  FOR SELECT USING (review_status = 'approved');

-- Authenticated users may read their own profile (even when pending).
DROP POLICY IF EXISTS "artist_profiles_select_own" ON artist_profiles;
CREATE POLICY "artist_profiles_select_own" ON artist_profiles
  FOR SELECT USING (auth.uid() = user_id);

-- No client-side INSERT/UPDATE/DELETE policies — mutations go through
-- service role via /api/artist-profile.

-- ---------- venue_profiles ----------
ALTER TABLE venue_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "venue_profiles_select_public" ON venue_profiles;
CREATE POLICY "venue_profiles_select_public" ON venue_profiles
  FOR SELECT USING (true);
  -- Venues are intentionally fully public — the /venues page lists them.
  -- If venue PII ever needs protecting, scope this to a `published = true`
  -- column on the table.

DROP POLICY IF EXISTS "venue_profiles_select_own" ON venue_profiles;
CREATE POLICY "venue_profiles_select_own" ON venue_profiles
  FOR SELECT USING (auth.uid() = user_id);

-- ---------- artist_works ----------
ALTER TABLE artist_works ENABLE ROW LEVEL SECURITY;

-- Public works show on /browse. Private works (belonging to a pending
-- artist or soft-deleted) are gated via the artist_profiles join in the
-- API, but the policy can still surface them to authenticated owners.
DROP POLICY IF EXISTS "artist_works_select_public" ON artist_works;
CREATE POLICY "artist_works_select_public" ON artist_works
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM artist_profiles ap
      WHERE ap.user_id = artist_works.artist_user_id
        AND ap.review_status = 'approved'
    )
  );

DROP POLICY IF EXISTS "artist_works_select_own" ON artist_works;
CREATE POLICY "artist_works_select_own" ON artist_works
  FOR SELECT USING (auth.uid() = artist_user_id);

-- ---------- placements ----------
ALTER TABLE placements ENABLE ROW LEVEL SECURITY;

-- Only the two parties on a placement may read it.
DROP POLICY IF EXISTS "placements_select_party" ON placements;
CREATE POLICY "placements_select_party" ON placements
  FOR SELECT USING (
    auth.uid() = artist_user_id OR auth.uid() = venue_user_id
  );

-- No client-side writes — /api/placements handles all mutations.

-- ---------- orders ----------
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Buyers, artists on the order, and venues on the linked placement may read.
-- `buyer_user_id` is nullable for guest checkouts — those can never be read
-- by anon (guest looks up via the one-time confirmation URL + order id).
DROP POLICY IF EXISTS "orders_select_buyer" ON orders;
CREATE POLICY "orders_select_buyer" ON orders
  FOR SELECT USING (auth.uid() = buyer_user_id);

DROP POLICY IF EXISTS "orders_select_artist" ON orders;
CREATE POLICY "orders_select_artist" ON orders
  FOR SELECT USING (auth.uid() = artist_user_id);

-- Venue reads its share orders via the placement. We don't join venue_user_id
-- on orders, so scope through placement_id where available.
DROP POLICY IF EXISTS "orders_select_venue" ON orders;
CREATE POLICY "orders_select_venue" ON orders
  FOR SELECT USING (
    placement_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM placements p
      WHERE p.id = orders.placement_id
        AND p.venue_user_id = auth.uid()
    )
  );

-- ---------- artist_applications ----------
ALTER TABLE artist_applications ENABLE ROW LEVEL SECURITY;

-- Applications contain contact PII. Only admins may read them; they come
-- through /api/admin/applications which uses the service role. Authenticated
-- users don't need to read the applications table (the flow switches them
-- to artist_profiles on approval), so no SELECT policy = no client read.
-- Anyone may INSERT via the /api/apply route (service-role, no client policy).

-- ---------- reviews ----------
-- Check if the table exists first — reviews may not be migrated yet.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reviews') THEN
    EXECUTE 'ALTER TABLE reviews ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "reviews_select_public" ON reviews';
    EXECUTE 'CREATE POLICY "reviews_select_public" ON reviews FOR SELECT USING (true)';
  END IF;
END $$;

-- ---------- conversations (if exists) ----------
-- messages RLS is already handled by migration 012. `conversations` may be
-- an implicit view or a materialised table — either way, reads should be
-- scoped to participants.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conversations') THEN
    EXECUTE 'ALTER TABLE conversations ENABLE ROW LEVEL SECURITY';

    -- Conversation is readable if the viewer appears as a party on any
    -- message in that conversation.
    EXECUTE $POL$
      DROP POLICY IF EXISTS "conversations_select_party" ON conversations;
      CREATE POLICY "conversations_select_party" ON conversations
        FOR SELECT USING (
          EXISTS (
            SELECT 1 FROM messages m
            WHERE m.conversation_id = conversations.id
              AND (m.sender_id = auth.uid() OR m.recipient_user_id = auth.uid())
          )
        );
    $POL$;
  END IF;
END $$;

-- ---------- admin_users (if exists) ----------
-- Admin list — never readable by non-service-role code.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_users') THEN
    EXECUTE 'ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY';
    -- No SELECT policy = default deny.
  END IF;
END $$;

-- ---------- Post-flight sanity comment ----------
-- After this migration ships, run this in the Supabase SQL editor
-- against the anon role to confirm the lockdown:
--
--   SET LOCAL ROLE anon;
--   SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public';
--   SELECT count(*) FROM artist_profiles;  -- 0 if no approved rows, or only approved
--   SELECT count(*) FROM placements;       -- should be 0 for anon
--   SELECT count(*) FROM orders;           -- should be 0 for anon
--   SELECT count(*) FROM artist_applications; -- should be 0 for anon
--   RESET ROLE;
