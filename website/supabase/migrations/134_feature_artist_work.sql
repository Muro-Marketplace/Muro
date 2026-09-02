-- 134: feature_artist_work(), atomic "one live boost per artist" for Artwork
-- of the Week.
--
-- POST /api/artist-works/[id]/feature read the artist's works, checked for a
-- live boost, then updated in a second round-trip. Two concurrent requests
-- from the same artist could both pass the read and both write, leaving two
-- works "of the week" for a week. Same shape as the race that
-- claim_artist_work_slot() (migration 104) closed, and the same fix: take the
-- per-artist advisory lock (same lock class, so slot claims and boosts
-- serialise together) and do the check and the write in one transaction.
--
-- Returns exactly one row. outcome is 'featured' (row updated), 'boost_live'
-- (another of the artist's works is still boosted; live_work_id and
-- live_until say which) or 'not_found' (no work with that id belongs to that
-- artist). Ownership is enforced inside: the UPDATE matches artist_id too.

CREATE OR REPLACE FUNCTION public.feature_artist_work(
  p_artist_id UUID,
  p_work_id   TEXT,
  p_now       TIMESTAMPTZ,
  p_until     TIMESTAMPTZ
) RETURNS TABLE(outcome TEXT, live_work_id TEXT, live_until TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_live_id    TEXT;
  v_live_until TIMESTAMPTZ;
  v_updated    INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(4821, hashtext(p_artist_id::TEXT));

  SELECT w.id, w.featured_until INTO v_live_id, v_live_until
  FROM artist_works w
  WHERE w.artist_id = p_artist_id
    AND w.id <> p_work_id
    AND w.featured_until IS NOT NULL
    AND w.featured_until > p_now
  ORDER BY w.featured_until DESC
  LIMIT 1;

  IF v_live_id IS NOT NULL THEN
    RETURN QUERY SELECT 'boost_live'::TEXT, v_live_id, v_live_until;
    RETURN;
  END IF;

  UPDATE artist_works
  SET featured_until = p_until
  WHERE id = p_work_id AND artist_id = p_artist_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'featured'::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ;
END;
$$;

REVOKE ALL ON FUNCTION public.feature_artist_work(UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ)
  FROM anon, authenticated, PUBLIC;

NOTIFY pgrst, 'reload schema';
