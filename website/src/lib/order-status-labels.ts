// Canonical labels for every order status surfaced to customers. Used by
// /orders/track AND OrderStatusTracker. ORDER_STEPS is the linear pipeline
// (the row of pips); cancelled/refunded/disputed are off-pipeline terminal
// states with their own badges.

export type OrderStatus =
  | "confirmed"
  | "artist_notified"
  | "awaiting_dispatch"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded"
  | "disputed";

interface Step {
  key: OrderStatus;
  label: string;
}

export const ORDER_STEPS: Step[] = [
  { key: "confirmed", label: "Order placed" },
  { key: "artist_notified", label: "Artist notified" },
  { key: "awaiting_dispatch", label: "Awaiting dispatch" },
  { key: "processing", label: "Processing" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
];

const TERMINAL = new Set<OrderStatus>([
  "delivered",
  "cancelled",
  "refunded",
  "disputed",
]);

export function isTerminalStatus(s: string): boolean {
  return TERMINAL.has(s as OrderStatus);
}

export function labelForStatus(s: string): string {
  const step = ORDER_STEPS.find((x) => x.key === s);
  if (step) return step.label;
  switch (s) {
    case "cancelled":
      return "Cancelled";
    case "refunded":
      return "Refunded";
    case "disputed":
      return "Disputed";
    default:
      return "In progress";
  }
}

// States the customer can request a refund from. Pre-dispatch is always
// fair game (the artist hasn't shipped yet). After delivery the window is
// 14 days, matching the UK Consumer Contracts Regulations 14-day cooling-
// off period for distance sales. shipped/disputed/cancelled/refunded
// don't expose a refund button — disputes and post-shipment claims go
// through the dispute flow, and cancelled/refunded already terminated.
const PRE_DISPATCH: readonly OrderStatus[] = [
  "confirmed",
  "artist_notified",
  "awaiting_dispatch",
  "processing",
];

const POST_DELIVERY_REFUND_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export function isRefundEligible(
  order: { status: string; delivered_at?: string | null },
  now: Date = new Date(),
): boolean {
  if ((PRE_DISPATCH as readonly string[]).includes(order.status)) return true;
  if (order.status === "delivered" && order.delivered_at) {
    const elapsed = now.getTime() - new Date(order.delivered_at).getTime();
    return elapsed >= 0 && elapsed < POST_DELIVERY_REFUND_WINDOW_MS;
  }
  return false;
}
