/**
 * Where the checkout route is allowed to read shipping inputs from.
 *
 * `/api/checkout` re-prices every item line against `artist_works` before it
 * mints a Stripe session, and has done since the 2026-08-28 audit. Shipping
 * was never given the same treatment: `calculateOrderShipping` was handed
 * `it.shippingPrice`, `it.dimensions` and `it.price` straight off the request
 * body. The helper it feeds is correct, it was simply being told what the
 * caller wanted to be true.
 *
 * Proven against production on 2026-08-30: a cart posted with
 * `shippingPrice: 0` minted a live session for £49.99 with no shipping line,
 * where the honest cart was £53.49. Forging the item price did nothing,
 * because item prices are re-priced. Shipping was the hole.
 *
 * Precedence mirrors what the artwork page shows the buyer, so the quote does
 * not move when the numbers stop being client-supplied:
 *   1. the selected size's own `shippingPrice`, inside the `pricing` jsonb,
 *   2. the work-level `artist_works.shipping_price`,
 *   3. null, which lets the shared helper fall back to a dimensional estimate.
 *
 * International is artist-level (`artist_profiles.international_shipping_price`)
 * because that is where the artist sets it and where the artwork page reads it.
 */

export type WorkShippingRow = {
  shipping_price?: number | null;
  dimensions?: string | null;
  pricing?: Array<{ label?: string | null; shippingPrice?: number | null }> | null;
};

export type ArtistShippingRow = {
  international_shipping_price?: number | null;
};

function positiveOrZero(value: unknown): number | null {
  // Number(null) is 0 and Number("") is 0, so coercing first would turn "the
  // artist set no price" into "shipping is free". That is the exploit this
  // module exists to close, arriving from the other direction.
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * The UK shipping price for one line, from the database only.
 *
 * Returns null when the artist has set no manual price, which is a real
 * answer: the caller then estimates from dimensions rather than charging 0.
 */
export function resolveWorkShippingPrice(
  work: WorkShippingRow | null | undefined,
  sizeLabel: string | null | undefined,
): number | null {
  if (!work) return null;

  // Case-insensitive, to match how the route already resolves the price tier
  // for the same label. A size that prices from one tier must not take its
  // shipping from another.
  const label = sizeLabel?.trim().toLowerCase();
  if (label) {
    const tier = work.pricing?.find((p) => p?.label?.trim().toLowerCase() === label);
    const perSize = positiveOrZero(tier?.shippingPrice);
    if (perSize !== null) return perSize;
  }

  return positiveOrZero(work.shipping_price);
}

/** One line's shipping inputs, resolved server-side. */
export type ResolvedLineShipping = {
  shippingPrice: number | null;
  internationalShippingPrice: number | null;
  dimensions: string | null;
};

/**
 * Resolve every shipping input the route is able to resolve.
 *
 * `fallback` carries the client's values and is used only for lines with no
 * `workId` to look up: legacy carts and collection bundles, which have no
 * `artist_works` row to consult. Those lines are already the weaker path for
 * item pricing too, and narrowing them is tracked separately; passing the
 * fallback here keeps this change to the surface it fixes.
 */
export function resolveLineShipping(args: {
  work: WorkShippingRow | null | undefined;
  artist: ArtistShippingRow | null | undefined;
  sizeLabel: string | null | undefined;
  fallback?: ResolvedLineShipping;
}): ResolvedLineShipping {
  const { work, artist, sizeLabel, fallback } = args;

  if (!work) {
    return {
      shippingPrice: fallback?.shippingPrice ?? null,
      internationalShippingPrice:
        positiveOrZero(artist?.international_shipping_price) ??
        fallback?.internationalShippingPrice ??
        null,
      dimensions: fallback?.dimensions ?? null,
    };
  }

  return {
    shippingPrice: resolveWorkShippingPrice(work, sizeLabel),
    internationalShippingPrice: positiveOrZero(artist?.international_shipping_price),
    dimensions: work.dimensions?.trim() || null,
  };
}
