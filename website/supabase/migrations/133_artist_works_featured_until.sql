-- 133: artist_works.featured_until, the "Artwork of the Week" boost.
--
-- Owner decision 2026-09-02: Premium and Pro artists can push one artwork to
-- the top of the /browse gallery for seven days. The whole model is this one
-- timestamp: a work is "of the week" while featured_until is in the future,
-- so expiry is a comparison, not a cron. Written only by
-- POST /api/artist-works/[id]/feature (server-owned in writable-fields.ts);
-- the portal's ordinary save cannot touch it.

ALTER TABLE artist_works
  ADD COLUMN IF NOT EXISTS featured_until TIMESTAMPTZ;

COMMENT ON COLUMN artist_works.featured_until IS
  'Artwork of the Week: the work sorts first in the /browse gallery while this is in the future. Set by POST /api/artist-works/[id]/feature for Premium and Pro artists, one live boost per artist. NULL means never boosted or boost expired and cleared.';

CREATE INDEX IF NOT EXISTS artist_works_featured_until_idx
  ON artist_works (featured_until)
  WHERE featured_until IS NOT NULL;

NOTIFY pgrst, 'reload schema';
