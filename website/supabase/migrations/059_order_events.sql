-- 059_order_events.sql
--
-- Phase 1 chunk 1b. Append-only event log so lifecycle emails (J1/J2)
-- and customer order-tracking (K3) share one source of truth in Phase 2.
--
-- Reads still go to orders.status. This table is parallel, not a
-- replacement. Phase 2 will swap reads over once the trigger surface
-- is wired.
--
-- Notes:
-- - orders.id is TEXT (see supabase-tables-migration.sql), so order_id
--   matches that type rather than UUID.
-- - idempotency_key is UNIQUE so retries are no-ops. The backfill uses
--   a deterministic key shape `backfill:<order_id>:<event_type>` per
--   spec, which means re-running this migration is safe.
-- - Backfill is sparse on purpose: every row gets `order.placed`, plus
--   `order.processing` if currently in 'processing' and `order.delivered`
--   if currently in 'delivered'. Other states ('shipped', 'cancelled')
--   only emit the placed event because we don't have reliable historical
--   timestamps for the intermediate transitions.

CREATE TABLE IF NOT EXISTS order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'order.placed',
    'order.processing',
    'order.out_for_delivery',
    'order.delivered',
    'order.delivery_confirmed',
    'order.cancelled',
    'order.refunded'
  )),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_events_order_id_idx
  ON order_events(order_id, created_at);

ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;

-- Backfill: every order gets a placed event at its original created_at.
INSERT INTO order_events (order_id, event_type, idempotency_key, created_at)
SELECT
  o.id,
  'order.placed',
  'backfill:' || o.id || ':order.placed',
  o.created_at
FROM orders o
ON CONFLICT (idempotency_key) DO NOTHING;

-- Backfill: any order currently 'processing' also gets a processing
-- event. created_at uses now() because we don't store the transition
-- time on the row.
INSERT INTO order_events (order_id, event_type, idempotency_key)
SELECT
  o.id,
  'order.processing',
  'backfill:' || o.id || ':order.processing'
FROM orders o
WHERE o.status = 'processing'
ON CONFLICT (idempotency_key) DO NOTHING;

-- Backfill: any order currently 'delivered' also gets a delivered event.
INSERT INTO order_events (order_id, event_type, idempotency_key)
SELECT
  o.id,
  'order.delivered',
  'backfill:' || o.id || ':order.delivered'
FROM orders o
WHERE o.status = 'delivered'
ON CONFLICT (idempotency_key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
