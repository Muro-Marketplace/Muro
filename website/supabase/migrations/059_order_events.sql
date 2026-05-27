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
-- - Backfill timestamps come from orders.status_history (JSONB array of
--   {status, timestamp} entries, mig 003) when present, so historical
--   "processing" / "delivered" events keep their real transition times.
--   Falls back to now() only when the history is missing or malformed.

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

-- Phase 2 lifecycle emails will ask "has order.<type> already fired for
-- this order?". The UNIQUE on idempotency_key answers a specific-key
-- question; this index answers the broader "any event of this type for
-- this order".
CREATE INDEX IF NOT EXISTS order_events_type_order_idx
  ON order_events(event_type, order_id);

ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;

-- Helper: pull the earliest timestamp for a given status from
-- orders.status_history, or NULL if the history is missing/malformed.
-- Inlined here (not as a permanent function) because it's only used by
-- this one-shot backfill.

-- Backfill: every order gets a placed event at its original created_at.
INSERT INTO order_events (order_id, event_type, idempotency_key, created_at)
SELECT
  o.id,
  'order.placed',
  'backfill:' || o.id || ':order.placed',
  o.created_at
FROM orders o
ON CONFLICT (idempotency_key) DO NOTHING;

-- Backfill: every order currently 'processing' also gets a processing
-- event, timestamped from status_history when available.
INSERT INTO order_events (order_id, event_type, idempotency_key, created_at)
SELECT
  o.id,
  'order.processing',
  'backfill:' || o.id || ':order.processing',
  COALESCE(
    (
      SELECT (elem->>'timestamp')::timestamptz
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(o.status_history) = 'array'
             THEN o.status_history
             ELSE '[]'::jsonb
        END
      ) AS elem
      WHERE elem->>'status' = 'processing'
      ORDER BY (elem->>'timestamp')::timestamptz ASC
      LIMIT 1
    ),
    o.created_at
  )
FROM orders o
WHERE o.status = 'processing'
ON CONFLICT (idempotency_key) DO NOTHING;

-- Backfill: every order currently 'delivered' also gets a delivered
-- event, timestamped from status_history when available.
INSERT INTO order_events (order_id, event_type, idempotency_key, created_at)
SELECT
  o.id,
  'order.delivered',
  'backfill:' || o.id || ':order.delivered',
  COALESCE(
    (
      SELECT (elem->>'timestamp')::timestamptz
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(o.status_history) = 'array'
             THEN o.status_history
             ELSE '[]'::jsonb
        END
      ) AS elem
      WHERE elem->>'status' = 'delivered'
      ORDER BY (elem->>'timestamp')::timestamptz ASC
      LIMIT 1
    ),
    o.created_at
  )
FROM orders o
WHERE o.status = 'delivered'
ON CONFLICT (idempotency_key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
