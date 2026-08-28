-- 123: schema prerequisites for the 2026-08-28 transaction hardening plan.
--
-- NUMBERING NOTE: applied to prod under the ledger name "122_hardening_schema"
-- before the parallel outreach branch's 122_placements_created_by_user_id
-- landed on disk via merge; the FILE is renumbered 123 to keep disk unique,
-- and the prod ledger name is unchanged (the ledger has never been 1:1 with
-- disk numbering, see the bootstrap note in writable-fields.ts).
--
-- (a) placement_recurring_billings is a MONEY LEDGER, and its two FKs to
--     auth.users were ON DELETE CASCADE: deleting a user destroyed the
--     billing history and made handleInvoicePaid silently no-op on every
--     future invoice for that placement (missing-events gap 2). Ledger rows
--     now survive erasure with the user reference nulled, matching the
--     117 erasure semantics everywhere else.
-- (b) artist_profiles.stripe_customer_id gains a partial UNIQUE index: every
--     SaaS subscription write keys on it, and a duplicate would let one
--     Stripe customer stamp two profiles (audit R2.15).
-- (c) notifications gains an idempotency_key with a partial unique index so
--     Stripe redeliveries and double-fire paths cannot double-bell
--     (audit R6.F6). NULL keys (legacy callers) stay unconstrained.

ALTER TABLE placement_recurring_billings
  ALTER COLUMN payer_user_id DROP NOT NULL,
  ALTER COLUMN payee_user_id DROP NOT NULL;

ALTER TABLE placement_recurring_billings
  DROP CONSTRAINT placement_recurring_billings_payer_user_id_fkey,
  ADD CONSTRAINT placement_recurring_billings_payer_user_id_fkey
    FOREIGN KEY (payer_user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  DROP CONSTRAINT placement_recurring_billings_payee_user_id_fkey,
  ADD CONSTRAINT placement_recurring_billings_payee_user_id_fkey
    FOREIGN KEY (payee_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS artist_profiles_stripe_customer_id_uniq
  ON artist_profiles(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_idempotency_key_uniq
  ON notifications(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

NOTIFY pgrst, 'reload schema';
