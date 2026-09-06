/**
 * `orders.items` exists in two shapes and every reader has to handle both.
 *
 * The cart writes the checkout shape at order creation:
 *     { title, qty, price }            // price in POUNDS
 *
 * The Stripe webhook then overwrites the column with an enriched shape while
 * building the receipt email:
 *     { title, quantity, lineTotal: { amount, currency } }   // amount in PENCE
 *
 * The enriched shape carries neither `qty` nor `price`, so a reader written
 * against the cart shape computes `undefined * undefined` and shows the buyer
 * a line of nothing. Measured against production on 2026-08-30: 11 of 17
 * orders are enriched, so two thirds of all orders rendered £0.00 on the
 * customer portal and on the public tracking page. The artist portal had the
 * dual-shape read and was correct; this module is that logic, extracted, so
 * the three surfaces cannot drift apart again.
 *
 * Both shapes stay supported. The enriched one is not a migration of the
 * other, it is what the webhook writes today, and legacy rows predating the
 * webhook still hold the cart shape.
 */

/** An item as it may appear on `orders.items`, in either shape. */
export type RawOrderItem = {
  title?: string | null;
  size?: string | null;
  image?: string | null;
  artistName?: string | null;
  artistSlug?: string | null;
  /** Cart shape. */
  qty?: number | null;
  /** Cart shape, in pounds. */
  price?: number | null;
  /** Enriched shape. */
  quantity?: number | null;
  /** Enriched shape, amount in pence. */
  lineTotal?: { amount?: number | null; currency?: string | null } | null;
};

/** One item, normalised to the fields a receipt line needs. */
export type OrderItemLine = {
  title: string;
  quantity: number;
  /** Line total in pounds: quantity already applied. */
  lineTotal: number;
  /** From `lineTotal.currency` when the enriched shape carries one. */
  currency: string | null;
  /**
   * The artwork image, which the stored item already carried and this reader
   * used to drop, so every order surface named the piece in text alone. Null
   * for a legacy row saved without one; WorkThumb renders its placeholder.
   */
  image: string | null;
};

function finiteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Read one item from either shape.
 *
 * Falls back to a quantity of 1 and a total of 0 rather than throwing, because
 * these render in a buyer's order history where a crashed page is worse than a
 * zero. A zero here means the row holds neither shape, which is worth knowing.
 */
export function readOrderItem(item: RawOrderItem | null | undefined): OrderItemLine {
  const raw = item ?? {};
  const quantity = finiteNumber(raw.quantity ?? raw.qty ?? 1) ?? 1;

  // Prefer the enriched pence amount, which is authoritative: it is what
  // Stripe charged. Fall back to pounds times quantity for legacy rows.
  const pence = finiteNumber(raw.lineTotal?.amount);
  const price = finiteNumber(raw.price);
  const lineTotal =
    pence !== null ? pence / 100 : price !== null ? price * quantity : 0;

  return {
    image: raw.image?.trim() || null,
    title: raw.title?.trim() || "Artwork",
    quantity,
    lineTotal,
    currency: raw.lineTotal?.currency || null,
  };
}

/** Read a whole `orders.items` array, tolerating a non-array column. */
export function readOrderItems(items: unknown): OrderItemLine[] {
  if (!Array.isArray(items)) return [];
  return items.map((item) => readOrderItem(item as RawOrderItem));
}

/** Sum of the line totals, in pounds. */
export function orderItemsSubtotal(items: unknown): number {
  return readOrderItems(items).reduce((sum, line) => sum + line.lineTotal, 0);
}
