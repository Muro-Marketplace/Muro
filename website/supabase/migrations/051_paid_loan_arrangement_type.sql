-- ============================================
-- Migration 051: paid_loan arrangement type
-- ============================================
-- Rename the misleading "free_loan with monthly fee" pattern. We introduce
-- paid_loan as a distinct arrangement_type and migrate any rows where
-- monthly_fee_gbp > 0 from free_loan -> paid_loan. New rows can then go
-- through the cleanly-named value.
--
-- Background: prior code (CounterPlacementDialog, /api/placements) used
-- 'free_loan' to represent both genuinely-free loans AND paid loans with
-- a monthly fee, distinguishing them only by monthly_fee_gbp > 0. That
-- conflation makes portal data hard to reason about. From this migration
-- forward, 'free_loan' means the artist receives no fee and 'paid_loan'
-- means the venue pays a recurring monthly_fee_gbp.
--
-- Notes:
-- - placements.arrangement_type is TEXT NOT NULL (defined in the baseline
--   schema). Any prior CHECK constraint, if Postgres auto-generated one,
--   would follow the conventional name <table>_<column>_check. We DROP
--   IF EXISTS to be safe in either case.
-- - placements.monthly_fee_gbp is NUMERIC, added in migration 007
--   (007_notifications_and_placement_flags.sql).
-- - This migration is idempotent: re-running is a no-op because
--     * DROP CONSTRAINT IF EXISTS is safe whether or not the constraint
--       exists,
--     * ADD CONSTRAINT will succeed once the prior one is gone, and
--     * the backfill UPDATE's WHERE clause excludes already-migrated rows.

-- 1. Drop any existing CHECK constraint on arrangement_type.
ALTER TABLE placements DROP CONSTRAINT IF EXISTS placements_arrangement_type_check;

-- 2. Add the new four-value CHECK constraint.
ALTER TABLE placements
  ADD CONSTRAINT placements_arrangement_type_check
  CHECK (arrangement_type IN ('free_loan', 'paid_loan', 'revenue_share', 'purchase'));

-- 3. Backfill: any existing free_loan with a monthly fee is actually a paid_loan.
UPDATE placements
SET arrangement_type = 'paid_loan'
WHERE arrangement_type = 'free_loan'
  AND monthly_fee_gbp IS NOT NULL
  AND monthly_fee_gbp > 0;
