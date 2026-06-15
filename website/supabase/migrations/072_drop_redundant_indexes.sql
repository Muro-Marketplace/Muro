-- 072_drop_redundant_indexes.sql
--
-- Bug 42 (unused indexes). The Supabase performance advisor flags ~79 indexes
-- with zero recorded scans. Investigation (2026-06-15) found the project is
-- still pre-launch / very low traffic: every flagged index is 8-16 kB on a
-- near-empty table, and index statistics were last reset 2026-03-30. On a DB
-- that has barely been queried, "zero scans" overwhelmingly means the query
-- path has not run yet, NOT that the index is useless. Those indexes back
-- foreign keys and known filter/sort patterns and are intentional; dropping
-- them would risk post-launch performance for a negligible saving (the entire
-- set is roughly 1 MB). They are RETAINED and scheduled for re-evaluation once
-- real traffic has accumulated representative stats. See
-- docs/adr/0006-unused-index-policy.md and scripts/audit/unused-indexes.sql.
--
-- The only genuinely-safe drops, independent of traffic, are PREFIX-REDUNDANT
-- indexes: each is a strict leading-column prefix of a wider index on the same
-- table, so the wider index already serves every query the narrow one could.
-- Dropping these removes write overhead with no read-path regression:
--
--   walls.walls_user_idx
--     -> covered by walls_user_owner_type_idx, which is actively used
--        (215 scans on production), so the single-column index is dead weight.
--
--   placement_reviews.idx_placement_reviews_placement
--     -> covered by idx_placement_reviews_unique, whose leading column is the
--        same placement column, so placement-prefix lookups use it instead.
--
-- Tables are tiny, so a plain (non-concurrent) DROP is instant and the drops
-- are trivially reversible (recreate the index) if a future need appears.

DROP INDEX IF EXISTS public.walls_user_idx;
DROP INDEX IF EXISTS public.idx_placement_reviews_placement;

NOTIFY pgrst, 'reload schema';
