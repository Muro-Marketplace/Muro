-- 114: drop the four cached counter columns (owner decision 5, approved
--      2026-08-28).
--
-- `artist_profiles.total_views`, `total_placements`, `total_sales` and
-- `total_enquiries` are the columns behind 07 K5, and the reason AGENTS.md now
-- has a "Data invariants" section: their only writer was
-- `POST /api/admin/refresh-stats`, which no cron ever hit, so an artist's
-- dashboard reported 0 profile views against 2,295 real view events, with 1 of
-- 14 rows carrying any non-zero value at all.
--
-- Since K5: the dashboard and the public profile count live from
-- `analytics_events` via `lib/analytics/artist-totals.ts`, the refresh endpoint
-- and `stats-cache.ts` are deleted, `writable-fields.ts` denylists the names,
-- and the transform's mapping of the columns onto the public Artist shape has no
-- remaining reader (verified: no member access of totalViews/totalPlacements/
-- totalSales/totalEnquiries anywhere outside the transform itself).
--
-- So these are written by nothing, read for nothing, and hold values that were
-- wrong when they were live. The stale numbers are the reason to drop rather
-- than keep: any future reader would trust them, and that is exactly how K5
-- happened the first time.
--
-- Destructive, which is why it waited for the owner. The data lost is 14 rows
-- of near-uniformly-zero counters that never agreed with reality.

ALTER TABLE public.artist_profiles
  DROP COLUMN IF EXISTS total_views,
  DROP COLUMN IF EXISTS total_placements,
  DROP COLUMN IF EXISTS total_sales,
  DROP COLUMN IF EXISTS total_enquiries;

NOTIFY pgrst, 'reload schema';
