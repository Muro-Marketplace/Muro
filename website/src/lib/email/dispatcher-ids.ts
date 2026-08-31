// The registry ids the dispatcher can send, extracted so a script can read them
// without importing dispatcher.ts (which pulls in sendEmail, then supabase-admin,
// then `server-only`, which throws outside a Server Component).
//
// 09 item 4.1. This matters to the render harness for one reason: the dispatcher
// is the ONLY sender that substitutes `{{tokens}}` into a registry subject. Every
// sendEmail() caller passes its own subject, so a leftover token there is a
// docstring, while a leftover token HERE goes out in somebody's inbox.

/**
 * The dispatcher's own template NAMES, mapped to the registry ids they bind to.
 * A `sendTransactional({ template: "order_placed" })` is not naming a registry
 * id, which is why the audit has to resolve through here before deciding an id
 * is missing.
 */
export const DISPATCHER_NAME_TO_REGISTRY_ID: Readonly<Record<string, string>> = {
  artist_order_received: "artist_order_received",
  // Row 874: the artist heard nothing on any transition, including the one
  // that releases their payout.
  artist_order_delivered: "artist_order_delivered",
  order_placed: "customer_order_placed",
  order_processing: "customer_order_processing",
  order_out_for_delivery: "customer_order_out_for_delivery",
  order_delivered: "customer_order_delivered",
  order_cancelled: "customer_order_status_update",
  customer_confirm_delivery: "customer_confirm_delivery_48h",
};

export const DISPATCHER_TEMPLATE_IDS: ReadonlySet<string> = new Set([
  "artist_order_received",
  "artist_order_delivered",
  "customer_order_placed",
  "customer_order_processing",
  "customer_order_out_for_delivery",
  "customer_order_delivered",
  "customer_order_status_update",
  "customer_confirm_delivery_48h",
]);
