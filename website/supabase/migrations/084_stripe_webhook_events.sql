-- 084: a global replay guard for the Stripe webhook (D1, 04 §B0).
--
-- The webhook had no event-id table; idempotency was per-branch and ad hoc (the
-- cart branch on stripe_payment_intent_id, the offer branch on a status
-- compare-and-set, curation on a status read). A Stripe redelivery that reached a
-- branch with no guard could act twice. This table lets the handler claim each
-- event.id once, so any redelivery is a no-op.
--
-- The plan names this 074_stripe_webhook_events.sql, but 074 is taken
-- (074_rls_gap_closure.sql) and 074-079 is 02's range under EXECUTION-DECISIONS
-- D1. This migration is owned by the 04 doc, whose range is 080-089; 080-083 are
-- taken, so it is 084.

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id   TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Service role only. The webhook runs with the service key, which bypasses RLS;
-- enabling RLS with no policy means nothing else can read or write the table.
ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS stripe_webhook_events_created_idx
  ON stripe_webhook_events(created_at);

NOTIFY pgrst, 'reload schema';
