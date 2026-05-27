-- 062_arrangement_type_mixed.sql
--
-- Phase 1 chunk 1f. Spec asked to "add an explicit arrangement_type
-- column with a CHECK in ('free_loan','paid_loan','revenue_share',
-- 'purchase','mixed')". The column already exists in baseline
-- (supabase-tables-migration.sql), was last constrained by mig 051
-- to four values, and is currently TEXT NOT NULL. The only missing
-- piece versus the Phase 1 spec is the fifth value, 'mixed', for
-- placements that are both paid loan AND revenue share.
--
-- Deviations from the spec, captured in the Phase 2 readiness report:
--
--   * No fresh CASE backfill. Migration 051 already classified every
--     existing row into one of the four legacy values based on
--     monthly_fee_gbp. Re-running the spec's CASE here would
--     reclassify any paid_loan with qr_enabled=TRUE into 'mixed',
--     which retroactively changes the meaning of historical rows.
--     The hard constraint says "don't flip any existing read paths"
--     — reclassifying values has the same downstream effect. Phase 2
--     can flip future paid_loan + qr_enabled writes to 'mixed' once
--     it owns the write path.
--
--   * purchase_amount_pence does NOT exist on placements (the
--     'purchase' arrangement_type is sourced from the purchase_offers
--     table). The spec flagged this as a possible adjustment. We
--     leave the existing 'purchase' rows alone.
--
-- The migration is idempotent: re-running DROPs the previous CHECK
-- and re-creates it with the expanded value set.

ALTER TABLE placements DROP CONSTRAINT IF EXISTS placements_arrangement_type_check;

ALTER TABLE placements
  ADD CONSTRAINT placements_arrangement_type_check
  CHECK (arrangement_type IN ('free_loan','paid_loan','revenue_share','purchase','mixed'));

NOTIFY pgrst, 'reload schema';
