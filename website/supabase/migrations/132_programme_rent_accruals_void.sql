-- 132: void columns for programme_rent_accruals (refund/dispute clawback gap).
--
-- The gap: a Wallplace Programme venue pays a monthly or quarterly
-- subscription. On each paid invoice, accrueProgrammeRent (migration 131,
-- src/lib/curation/programme-rent.ts) writes one programme_rent_accruals row
-- per placed artwork, and a monthly cron (settleProgrammeRent) later pays
-- each artist their unsettled total via Stripe Connect. Nothing anywhere
-- reverses this when the venue's payment comes back: the charge.refunded
-- webhook handler resolves an `orders` row by stripe_payment_intent_id and
-- returns early with `no_matching_order` when there isn't one, which is
-- EVERY programme refund, because programmes live in curation_requests, not
-- orders. The venue is refunded in full; the artists keep, or go on to
-- receive, rent for the refunded period; Wallplace absorbs the gap with no
-- record and no recovery path.
--
-- These two columns are voidProgrammeAccrualsForInvoice's (src/lib/curation/
-- programme-rent.ts) write surface, called from the charge.refunded and
-- charge.dispute.created webhook handlers once an invoice is resolved for the
-- refunded/disputed charge:
--
--   - An accrual that has NOT yet been settled (settled_at IS NULL) is
--     stamped voided_at/voided_reason. settleProgrammeRent (updated in this
--     same task to filter voided_at IS NULL) will then never pay it out --
--     this is the loss PREVENTED, and it costs nothing but a flag flip
--     because the money never left the platform.
--
--   - An accrual that has ALREADY been settled (settled_at IS NOT NULL) is
--     left completely alone. That money already went to the artist via
--     Stripe Connect; voiding the row now would misrepresent a real,
--     completed transfer, and clawing it back automatically would be wrong.
--     A human is alerted instead (sendAdminAlert), with the amount that is
--     unrecoverable without a conversation.
--
-- Both columns are nullable, and neither has a default: every existing row
-- (every accrual ever written before this migration) is unaffected. NULL
-- means "never voided", which is how every row already reads today, so no
-- backfill is needed or possible.
--
-- Follows migration 131's own conventions for this table: ADD COLUMN IF NOT
-- EXISTS (idempotent-safe re-run), a COMMENT ON COLUMN for each addition, and
-- a trailing NOTIFY pgrst so PostgREST picks up the new columns without a
-- restart.

ALTER TABLE programme_rent_accruals
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_reason TEXT;

COMMENT ON COLUMN programme_rent_accruals.voided_at IS
  'Refund/dispute clawback: when voidProgrammeAccrualsForInvoice (src/lib/curation/programme-rent.ts) stamped this row after the venue''s programme invoice was refunded or disputed. NULL means never voided. Only ever set on a row that was still settled_at IS NULL at the time -- an already-settled (already paid out) row is never voided, see the module header for why.';
COMMENT ON COLUMN programme_rent_accruals.voided_reason IS
  'Refund/dispute clawback: free-text reason recorded alongside voided_at, e.g. the Stripe charge or dispute id that triggered the void. NULL whenever voided_at is NULL.';

NOTIFY pgrst, 'reload schema';
