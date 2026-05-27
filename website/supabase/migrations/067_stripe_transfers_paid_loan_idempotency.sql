-- 067_stripe_transfers_paid_loan_idempotency.sql
--
-- Phase 2.2 audit fix. The handleInvoicePaid path in
-- src/lib/placements/paid-loan-billing.ts calls scheduleTransfer with
-- order_id="placement:<id>:<invoice_id>" — a deterministic shape that
-- should dedupe across webhook retries of the same invoice.paid event.
-- The base stripe_transfers table (mig 004) has no UNIQUE constraint,
-- so a Stripe replay would insert a second pending transfer and the
-- payout cron would pay the artist twice.
--
-- This index covers BOTH legacy order payouts and the new paid-loan
-- payouts: the (order_id, recipient_user_id) tuple is unique by
-- construction in both flows. The helper in paid-loan-billing.ts also
-- gains a pre-insert existence check so the migration alone is enough
-- to make replays no-ops.
--
-- Additive only; the table already has non-unique single-column
-- indexes on order_id and recipient_user_id (mig 004) which we leave
-- alone for the existing query paths.

CREATE UNIQUE INDEX IF NOT EXISTS stripe_transfers_order_recipient_uniq
  ON stripe_transfers(order_id, recipient_user_id);

NOTIFY pgrst, 'reload schema';
