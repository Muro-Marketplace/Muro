// Phase 2 chunk 2.0b. Single source of truth that translates the legacy
// orders.status column into the new order_events vocabulary (mig 059).
//
// Two consumers:
//   1. The order status mutation paths in src/app/api/orders/[id]/route.ts
//      (and admin override paths). When status flips, they look up the
//      corresponding event_type here and insert a matching row into
//      order_events.
//   2. The Phase 2.3 (J1) email dispatcher trigger reads from
//      order_events. It re-uses the same mapping to know which template
//      to fire.
//
// `artist_notified` is the only status that maps to null: it's an
// internal staging flag, not a customer-facing lifecycle event.

export type OrderEventType =
  | "order.placed"
  | "order.processing"
  | "order.out_for_delivery"
  | "order.delivered"
  | "order.delivery_confirmed"
  | "order.cancelled"
  | "order.refunded"
  | "order.disputed";

export const ORDER_STATUS_TO_EVENT: Record<string, OrderEventType | null> = {
  confirmed: "order.placed",
  processing: "order.processing",
  shipped: "order.out_for_delivery",
  delivered: "order.delivered",
  cancelled: "order.cancelled",
  // Audit follow-up: refunded transitions also drop a lifecycle event
  // so the K3 stepper / payout reconciler see refund state.
  refunded: "order.refunded",
  // 09 item 3.7. `disputed` used to map to null, so opening a dispute left
  // no trace on the order at all and the stepper could not show one. It maps
  // to a real event now (mig 105 widened the CHECK to match). The event is
  // logged and emails nobody: POST /api/disputes mails both parties itself,
  // and a second trigger here would be the duplicate-send class K1 removed.
  disputed: "order.disputed",
  artist_notified: null,
  awaiting_dispatch: null,
};

export function eventForStatus(status: string | null | undefined): OrderEventType | null {
  if (!status) return null;
  const key = status.toLowerCase().trim();
  if (!(key in ORDER_STATUS_TO_EVENT)) return null;
  return ORDER_STATUS_TO_EVENT[key];
}
