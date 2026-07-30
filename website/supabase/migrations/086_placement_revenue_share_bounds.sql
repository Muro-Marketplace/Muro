-- 086: bound placements.revenue_share_percent to 0..100 (D9, 04 §B4).
--
-- The column had no CHECK (the only constraint mentioning "revenue_share" is
-- placements_arrangement_type_check, which lists it as an arrangement_type enum
-- value, not a bound on the percent). So a counter-offer could set 150% and the
-- artist's net went negative in buildArtistLegs (venueCut = gross * 1.5).
--
-- The clamp UPDATEs run first so the constraint can be added even on an
-- environment with bad data. Prod is already clean (0 rows out of bounds,
-- verified), so here they are no-ops.
--
-- The plan pairs this with a unique index on active placements. That is NOT
-- included: prod has real duplicate active (artist_slug, venue_slug, work_title)
-- rows (e.g. two active "Vietnamese Village" placements for fin-coles at
-- the-mayfield; 18 active rows at testing-venue across 4 titles), so the index
-- cannot be created without first retiring duplicates, which is an owner decision
-- (flag, do not delete). The plan's UNCONFIRMED about work_title resolves against
-- it: work_title does not disambiguate multi-work placements. The webhook is made
-- deterministic in code instead (order by created_at, first-wins), which is what
-- the plan says to do "regardless".

UPDATE placements SET revenue_share_percent = 100 WHERE revenue_share_percent > 100;
UPDATE placements SET revenue_share_percent = 0   WHERE revenue_share_percent < 0;

ALTER TABLE placements
  ADD CONSTRAINT placements_revenue_share_bounds
  CHECK (revenue_share_percent IS NULL OR (revenue_share_percent >= 0 AND revenue_share_percent <= 100));

NOTIFY pgrst, 'reload schema';
