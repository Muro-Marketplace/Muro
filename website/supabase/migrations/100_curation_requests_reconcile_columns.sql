-- 100: reconcile state for managed curation subscriptions (D21).
--
-- Authorised by EXECUTION-DECISIONS D57.4 (which named the status widen; the two
-- timestamp columns are included here because D21's reconcilers write them, and
-- splitting them across migrations would only invite a PGRST204 "column not
-- found" on the first renewal).
--
-- Managed curation is a Stripe subscription, but nothing reconciled its lifecycle:
-- a renewal, a cancellation or a failed payment left curation_requests.status
-- frozen at 'in_progress'. The webhook reconcilers (src/lib/curation/billing.ts)
-- now move it to 'past_due'/'paused'/'cancelled' and stamp these columns, so the
-- status CHECK has to permit the two new states.
--
-- Widening a CHECK is additive: the new predicate is a strict superset of the old
-- one, so every existing row still satisfies it (Postgres has no in-place CHECK
-- edit, hence drop-then-add). No data is touched.
--
-- Numbering per D57.2/.3: next number above the highest on disk (099 -> 100);
-- gaps are never backfilled because a migration's filename is its apply order on
-- a fresh database.

ALTER TABLE curation_requests
  ADD COLUMN IF NOT EXISTS last_invoice_paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

ALTER TABLE curation_requests DROP CONSTRAINT IF EXISTS curation_requests_status_check;
ALTER TABLE curation_requests ADD CONSTRAINT curation_requests_status_check
  CHECK (status IN (
    'pending_payment', 'awaiting_quote', 'paid', 'in_progress', 'shortlist_sent',
    'completed', 'cancelled', 'refunded', 'past_due', 'paused'
  ));

COMMENT ON COLUMN curation_requests.last_invoice_paid_at IS
  'When the most recent managed-curation subscription invoice was paid. Stamped by the invoice.paid reconciler (D21).';
COMMENT ON COLUMN curation_requests.cancelled_at IS
  'When the managed-curation subscription was confirmed cancelled in Stripe. Stamped by the subscription.deleted reconciler (D21).';

NOTIFY pgrst, 'reload schema';
