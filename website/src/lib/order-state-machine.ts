//
// Order lifecycle (linear pipeline):
//   confirmed → artist_notified → awaiting_dispatch → processing →
//   shipped → delivered.
//
// Off-pipeline terminal-ish states:
//   cancelled, refunded, disputed.
//
// Cancelled is reachable from any state up through processing (after
// shipped, the buyer's remedies are dispute or refund, not cancel).
// Refunded is reachable from delivered (post-arrival refund) and from
// disputed (dispute resolved in buyer's favour). Disputed is reachable
// from shipped/delivered (something arrived wrong/broken). delivered is
// no longer strictly terminal — refunds and disputes can follow.
// Backward transitions and skips are blocked so the artist can't, say,
// mark an order delivered the moment it's paid (which would release the
// 14-day pending transfer early).

export const ORDER_STATUSES = [
  "confirmed",
  "artist_notified",
  "awaiting_dispatch",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
  "disputed",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  // Skip-ahead allowed for artists who go straight from receipt to making/dispatching.
  confirmed: ["artist_notified", "processing", "cancelled"],
  artist_notified: ["awaiting_dispatch", "processing", "cancelled"],
  awaiting_dispatch: ["processing", "shipped", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered", "disputed"],
  delivered: ["refunded", "disputed"],
  cancelled: [],
  refunded: [],
  disputed: ["refunded", "delivered"],
};

export type TransitionResult = { ok: true } | { ok: false; reason: string };

function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: OrderStatus, to: OrderStatus): TransitionResult {
  if (!isOrderStatus(from)) {
    return { ok: false, reason: `Unknown current status: ${from}` };
  }
  if (!isOrderStatus(to)) {
    return { ok: false, reason: `Unknown target status: ${to}` };
  }
  if (TRANSITIONS[from].includes(to)) {
    return { ok: true };
  }
  return {
    ok: false,
    reason: `Order is ${from}; cannot move to ${to}.`,
  };
}
