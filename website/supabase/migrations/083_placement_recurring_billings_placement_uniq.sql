-- 083: one live billing row per placement, and a real FK (E7c, 04 §B6).
--
-- The table's only uniqueness was UNIQUE (stripe_subscription_id), on a NULLABLE
-- column. NULLs do not conflict in Postgres, so a row written before the
-- subscription id was known gave no protection at all, and nothing stopped one
-- placement accumulating several live billing rows. That matters because
-- cancelPaidLoanBilling and the E7b dedup guard both ask "does this placement have
-- a live subscription?", and two rows make that question ambiguous.
--
-- Partial, not total: cancelled rows are archived by status rather than deleted
-- (per the plan's no-delete rule), so a venue who cancels must be able to start
-- again, which a total unique index would forbid.
--
-- The plan numbers this 078, which is inside 02's range (074-079).
-- EXECUTION-DECISIONS D1 gives 04 the range 080-089; 080/081/082 are taken.
--
-- The plan flags "UNCONFIRMED: whether placements.id is TEXT PRIMARY KEY" and says
-- to split the migration if not. Confirmed against the live project: placements.id
-- is `text` with `PRIMARY KEY (id)`, and placement_recurring_billings.placement_id
-- is `text NOT NULL`, so the FK is type-compatible and no split is needed. The
-- table has 0 rows, so neither statement can fail on existing data.

CREATE UNIQUE INDEX IF NOT EXISTS placement_recurring_billings_placement_live_uniq
  ON placement_recurring_billings(placement_id)
  WHERE status <> 'cancelled';

ALTER TABLE placement_recurring_billings
  DROP CONSTRAINT IF EXISTS placement_recurring_billings_placement_fk;

ALTER TABLE placement_recurring_billings
  ADD CONSTRAINT placement_recurring_billings_placement_fk
  FOREIGN KEY (placement_id) REFERENCES placements(id) ON DELETE CASCADE;

NOTIFY pgrst, 'reload schema';
