-- 104: close the artwork post-limit TOCTOU (row 21, supervisor D64).
--
-- `api/artist-works` counts the artist's works, compares to their tier cap, and
-- then inserts later through `upsertWork`. Two concurrent POSTs both read the
-- count before either insert lands, so both pass a cap they should not, and an
-- artist on Core (8) can hold 9 or more. It is a public API, so the window is
-- reachable by anyone with a session, not just by a fast client.
--
-- A plain `INSERT ... SELECT WHERE (SELECT count(*)) < limit` does NOT fix it.
-- Under READ COMMITTED each statement takes its own snapshot at statement start,
-- so two concurrent inserts that begin before either commits still see the same
-- count and both proceed. The check and the insert have to be serialised per
-- artist, in one transaction.
--
-- An advisory transaction lock keyed on the artist does that without blocking
-- anything else: it does not lock the artist_profiles row (so a profile edit
-- racing an upload is unaffected) and it releases automatically at COMMIT or
-- ROLLBACK, so a crashed call cannot leave an artist unable to upload.
--
-- WHY THIS ONLY CLAIMS A SLOT, rather than doing the whole insert.
--
-- `upsertWork` is not a single INSERT. It is a strip-and-retry ladder: full
-- write, then core-only, then each extended column applied individually, so a
-- failure on one newer column cannot silently kill the rest of the save.
-- Reimplementing that in SQL would be a second copy of a subtle path, which is
-- the exact class of duplication doc 07 exists to remove. So this function
-- inserts the four NOT NULL columns and returns; `upsertWork` then finds the row
-- and takes its update path, unchanged.
--
-- The caller deletes the claimed row if the save that follows fails, so a failed
-- upload does not permanently consume a slot.

CREATE OR REPLACE FUNCTION public.claim_artist_work_slot(
  p_artist_id UUID,
  p_work_id   TEXT,
  p_limit     INTEGER,
  p_title     TEXT,
  p_image     TEXT
) RETURNS TABLE(claimed BOOLEAN, created BOOLEAN, current_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_mine  BOOLEAN;
  v_taken BOOLEAN;
BEGIN
  -- One namespace constant so this cannot collide with an unrelated advisory
  -- lock elsewhere. Held to the end of THIS transaction only.
  PERFORM pg_advisory_xact_lock(4821, hashtext(p_artist_id::TEXT));

  SELECT EXISTS (
    SELECT 1 FROM artist_works WHERE id = p_work_id AND artist_id = p_artist_id
  ) INTO v_mine;

  SELECT count(*)::INTEGER INTO v_count FROM artist_works WHERE artist_id = p_artist_id;

  -- An edit of an existing work is not a new work and never consumes a slot,
  -- which is what the route's own comment has always said.
  IF v_mine THEN
    RETURN QUERY SELECT TRUE, FALSE, v_count;
    RETURN;
  END IF;

  -- The id exists but belongs to someone else. Do not insert and do not consume
  -- a slot; upsertWork owns that refusal, and duplicating it here would be two
  -- places deciding one thing.
  SELECT EXISTS (SELECT 1 FROM artist_works WHERE id = p_work_id) INTO v_taken;
  IF v_taken THEN
    RETURN QUERY SELECT TRUE, FALSE, v_count;
    RETURN;
  END IF;

  IF v_count >= p_limit THEN
    RETURN QUERY SELECT FALSE, FALSE, v_count;
    RETURN;
  END IF;

  INSERT INTO artist_works (id, artist_id, title, image)
  VALUES (p_work_id, p_artist_id, p_title, p_image);

  RETURN QUERY SELECT TRUE, TRUE, v_count + 1;
END;
$$;

-- Same SECURITY DEFINER lockdown as 085 and 087: Supabase grants EXECUTE to anon
-- and authenticated explicitly (not via PUBLIC), so all three must be revoked or
-- any signed-in caller could insert artist_works rows for an artist they do not
-- own, bypassing both RLS and the cap this function exists to enforce. The live
-- ACL after applying must read postgres=X, service_role=X only.
REVOKE ALL ON FUNCTION public.claim_artist_work_slot(UUID, TEXT, INTEGER, TEXT, TEXT)
  FROM anon, authenticated, PUBLIC;

NOTIFY pgrst, 'reload schema';
