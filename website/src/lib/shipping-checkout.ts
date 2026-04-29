// Shared per-artist shipping calculator. Single source of truth for
// the cart-level shipping figure that goes on the display checkout
// page AND the Stripe Checkout Session line item, so the two can
// never drift. Before this helper, the display page consolidated
// per-artist (largest piece + 50% per additional) but the API used
// a flat fallback; small carts could show £80.49 in the app but
// charge £79.94 on the card.
//
// Region is "uk" or "international". Manual artist overrides win,
// otherwise the calculator estimates from dimensions/framed/region.

import { resolveShippingCost, tierLabel, SIGNATURE_THRESHOLD_GBP } from "./shipping-calculator";

export interface CartLineForShipping {
  artistSlug: string;
  artistName: string;
  shippingPrice?: number | null;
  internationalShippingPrice?: number | null;
  dimensions?: string | null;
  framed?: boolean;
  price: number;
  quantity: number;
}

export interface ArtistShippingGroup {
  artistSlug: string;
  artistName: string;
  shipping: number;
  needsSignature: boolean;
  longestTierLabel: string | null;
  estimatedDays: string | null;
  anyEstimated: boolean;
}

export interface OrderShipping {
  artistGroups: ArtistShippingGroup[];
  totalShipping: number;
}

const FALLBACK_MEDIUM_UK = 14.5;
const FALLBACK_MEDIUM_INT = 38.0;

export function calculateOrderShipping(
  items: CartLineForShipping[],
  region: "uk" | "international",
): OrderShipping {
  const isInternational = region === "international";
  const groupsBySlug = new Map<string, { artistName: string; lines: CartLineForShipping[] }>();
  for (const it of items) {
    const slug = it.artistSlug || "_unknown";
    if (!groupsBySlug.has(slug)) groupsBySlug.set(slug, { artistName: it.artistName, lines: [] });
    groupsBySlug.get(slug)!.lines.push(it);
  }

  const artistGroups: ArtistShippingGroup[] = [];
  for (const [slug, group] of groupsBySlug) {
    let needsSignature = false;
    let longestTierLabel: string | null = null;
    let estimatedDays: string | null = null;
    let anyEstimated = false;

    const perItem: number[] = [];
    for (const it of group.lines) {
      const manualPrice = isInternational && it.internationalShippingPrice != null
        ? it.internationalShippingPrice
        : it.shippingPrice;
      const resolved = resolveShippingCost({
        manualPrice: typeof manualPrice === "number" ? manualPrice : null,
        dimensions: it.dimensions || null,
        framed: it.framed ?? false,
        priceGbp: it.price,
        region,
      });
      let rate = resolved.cost;
      if (rate == null) rate = isInternational ? FALLBACK_MEDIUM_INT : FALLBACK_MEDIUM_UK;
      if (resolved.estimate?.requiresSignature || it.price >= SIGNATURE_THRESHOLD_GBP) needsSignature = true;
      if (resolved.source === "estimate" && resolved.estimate) {
        anyEstimated = true;
        if (
          !longestTierLabel ||
          (resolved.estimate.longestEdgeCm > 60 && longestTierLabel !== "Oversized, specialist courier")
        ) {
          longestTierLabel = tierLabel(resolved.estimate.tier);
          estimatedDays = resolved.estimate.estimatedDays;
        }
      }
      for (let q = 0; q < it.quantity; q++) perItem.push(rate as number);
    }

    if (perItem.length === 0) continue;
    perItem.sort((a, b) => b - a);
    // Largest piece full, then 50% of each additional. Round to pence
    // so display and API land on the same float.
    const groupShipping = Math.round((perItem[0] + perItem.slice(1).reduce((s, r) => s + r * 0.5, 0)) * 100) / 100;

    artistGroups.push({
      artistSlug: slug,
      artistName: group.artistName,
      shipping: groupShipping,
      needsSignature,
      longestTierLabel,
      estimatedDays,
      anyEstimated,
    });
  }

  const totalShipping = Math.round(artistGroups.reduce((s, g) => s + g.shipping, 0) * 100) / 100;
  return { artistGroups, totalShipping };
}
