-- 089_stripe_transfers_payout_hardening.sql
--
-- Payout-ledger hardening for C3 (recordBlockedLeg needs last_error and the
-- 'blocked' status) and C4 (the retry sweep needs retry_count / next_attempt_at).
-- Both are provisioned together because EXECUTION-DECISIONS D1 gives 04 the
-- 080-089 range and 080-088 are already taken, so 089 is the only slot left; the
-- columns are a single cohesive set on one table. C4's sweep code lands in a later
-- iteration and reads retry_count / next_attempt_at; they are inert until then.
--
-- stripe_transfers is empty in prod (Stripe Connect is not live), so the backfill
-- UPDATE and the new CHECK/NOT NULL are trivially safe.

ALTER TABLE stripe_transfers
  ADD COLUMN IF NOT EXISTS retry_count     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error      TEXT,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ NOT NULL DEFAULT now();

-- The status column has always been bare TEXT with no CHECK (mig 004). Lock the
-- vocabulary now that ops tooling and recordBlockedLeg's 'blocked' depend on it.
UPDATE stripe_transfers
   SET status = 'pending'
 WHERE status NOT IN ('pending','paid','failed','cancelled','reversed','blocked');

ALTER TABLE stripe_transfers
  DROP CONSTRAINT IF EXISTS stripe_transfers_status_check;
ALTER TABLE stripe_transfers
  ADD CONSTRAINT stripe_transfers_status_check
  CHECK (status IN ('pending','paid','failed','cancelled','reversed','blocked'));

-- Sweep index (C4): retryable work, cheapest first.
CREATE INDEX IF NOT EXISTS stripe_transfers_retryable_idx
  ON stripe_transfers(next_attempt_at)
  WHERE status IN ('pending','failed');

NOTIFY pgrst, 'reload schema';
