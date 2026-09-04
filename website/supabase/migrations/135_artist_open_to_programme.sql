-- 135: artist_profiles.open_to_programme, the Wallplace Programmes supply pool.
--
-- A Programme sells a venue twelve months of curated, rotated, installed work.
-- Nothing in the schema recorded which artists were willing to supply one, so
-- there was no query that answered "can this site be filled" and feasibility
-- was being assumed at quote time rather than established. This column is that
-- answer, and it is the whole of phase 1 in
-- docs/specs/2026-09-04-programmes-operating-model-design.md. The admin console
-- that reads it, and the programme status machine, are phases 2 and 3.
--
-- DEFAULT false, deliberately NOT the DEFAULT true carried by the three flags
-- beside it (open_to_free_loan, open_to_revenue_share,
-- open_to_outright_purchase). Those three cost an artist nothing to leave open;
-- the worst outcome is a venue enquiry they turn down. A programme is a
-- commitment: rent is around GBP 10 per piece per month, Wallplace chooses
-- which pieces hang and when (artist agreement 9A), and a piece cannot sell
-- elsewhere while it is up. Copying the true default would enrol all 16
-- existing artist_profiles rows in terms none of them has been shown, so
-- consent here has to be given rather than inherited.
--
-- NOT NULL, matching offers_pickup (migration 055), the other explicit opt-in
-- on this table. Unlike migration 126's cooling-off pair there is no third
-- state worth keeping: "never asked" and "asked and declined" both mean out of
-- the pool, and every reader wants the same single boolean.

ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS open_to_programme BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN artist_profiles.open_to_programme IS
  'Artist has opted in to Wallplace Programmes: a venue rents curated work for twelve months, Wallplace picks which pieces hang and pays the artist a monthly rent per piece (artist agreement 9A). Explicit opt-in, set by the artist in the profile editor. false means not in the pool, whether or not the artist was ever asked.';

NOTIFY pgrst, 'reload schema';
