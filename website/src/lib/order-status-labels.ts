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
