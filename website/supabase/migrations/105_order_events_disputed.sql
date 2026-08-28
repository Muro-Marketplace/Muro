-- 105: give `order.disputed` a place in the lifecycle log (09 §D.1, item 3.7).
--
-- `POST /api/disputes` is new in this PR: until now the `disputes` table was
-- written by nothing at all, so there was no dispute to log. Now that a buyer or
-- an artist can open one, the order's own lifecycle log should show it, because
-- that log is what the K3 stepper and any payout reconciler read. A dispute that
-- exists only in an admin-only table is invisible to both.
--
-- `event_type` is CHECK-constrained (059) rather than an enum, so widening it is
-- a drop-and-add of the constraint. That is additive: every value that was legal
-- before is still legal, no existing row can violate the new list, and the table
-- is never rewritten because the new constraint is a strict superset.
--
-- NOT added: `order.dispute_resolved`. `eventForStatus` maps FROM orders.status,
-- and there is no 'dispute_resolved' status, so the value would be unreachable
-- from the only code path that writes these rows. An enum value nothing can
-- produce is a claim the schema cannot keep.

ALTER TABLE public.order_events
  DROP CONSTRAINT IF EXISTS order_events_event_type_check;

ALTER TABLE public.order_events
  ADD CONSTRAINT order_events_event_type_check CHECK (event_type IN (
    'order.placed',
    'order.processing',
    'order.out_for_delivery',
    'order.delivered',
    'order.delivery_confirmed',
    'order.cancelled',
    'order.refunded',
    'order.disputed'
  ));
