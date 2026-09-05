/**
 * Optional size tiers on a collection.
 *
 * A collection used to be a fixed set of works at one `bundle_price`, with one
 * size pinned per work in `work_sizes` (migration 006). An artist selling a
 * print series in three sizes had to publish three near-identical collections,
 * which duplicated the images and split the saves across three pages.
 *
 * A tier carries the artist's own label, its own price, and its own pinned size
 * for every work. Tiers pin sizes per work rather than naming one shared size
 * label, because an artist's works rarely share labels: one sells as "A3" and
 * another as "30x40cm", and both belong in the same Medium tier.
 *
 * `size_tiers = []` is the untiered collection, which is every collection that
 * existed before this module. Its behaviour is unchanged.
 *
 * Tier prices are typed by the artist, never derived from the works' own
 * prices. That keeps the artist in control of the jump between tiers, and it
 * means a work being repriced cannot silently move a bundle price. It also has
 * a safety consequence worth stating: because the price is stored rather than
 * computed, a tier whose pinned size label has gone stale still prices
 * correctly, so the write path does not need to validate labels against the
 * works.
 */

import type { CollectionSizeTier, CollectionWorkSize } from "@/data/collections";

/** Tiers are a size picker, not a catalogue. Six is already generous. */
export const MAX_COLLECTION_TIERS = 6;

const MAX_LABEL_LENGTH = 40;
const MAX_DESCRIPTION_LENGTH = 200;
const MAX_TIER_PRICE = 100000;

export type ParseResult =
  | { tiers: CollectionSizeTier[] }
  | { error: string };

function parseWorkSizes(raw: unknown, workIds: string[]): CollectionWorkSize[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set(workIds);
  const out: CollectionWorkSize[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { workId, sizeLabel } = entry as {
      workId?: unknown;
      sizeLabel?: unknown;
    };
    if (typeof workId !== "string" || typeof sizeLabel !== "string") continue;
    // A workId outside the collection is drift from an editor whose work list
    // moved on, not an attack. Filtered rather than rejected, matching how the
    // route already treats `workIds` and `work_sizes`.
    if (!allowed.has(workId)) continue;
    out.push({ workId, sizeLabel });
  }
  return out;
}

/**
 * Validate an incoming `sizeTiers` payload against the collection's own work
 * list. Returns the cleaned tiers, or a single buyer-readable error string for
 * the route to return as a 400.
 *
 * A missing or non-array value means "untiered", not "malformed": the field is
 * optional and older clients do not send it at all.
 */
export function parseCollectionSizeTiers(
  raw: unknown,
  workIds: string[],
): ParseResult {
  if (!Array.isArray(raw)) return { tiers: [] };
  if (raw.length > MAX_COLLECTION_TIERS) {
    return { error: `A collection can have at most ${MAX_COLLECTION_TIERS} sizes.` };
  }

  const tiers: CollectionSizeTier[] = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return { error: "Each size tier must be an object." };
    }
    const { label, price, description, workSizes } = entry as {
      label?: unknown;
      price?: unknown;
      description?: unknown;
      workSizes?: unknown;
    };

    const cleanLabel = typeof label === "string" ? label.trim() : "";
    if (!cleanLabel) {
      return { error: "Every size needs a name." };
    }
    if (cleanLabel.length > MAX_LABEL_LENGTH) {
      return { error: `A size name can be at most ${MAX_LABEL_LENGTH} characters.` };
    }
    // The label is the key checkout re-prices against, so two tiers differing
    // only in casing would make the charge ambiguous.
    const key = cleanLabel.toLowerCase();
    if (seen.has(key)) {
      return { error: `Two sizes have the same name ("${cleanLabel}").` };
    }
    seen.add(key);

    // The form submits prices as strings; Number("") is 0 and Number(null) is
    // 0, so both are screened out before the coercion rather than becoming a
    // free bundle.
    const rawPrice =
      typeof price === "number"
        ? price
        : typeof price === "string" && price.trim() !== ""
          ? Number(price)
          : Number.NaN;
    if (!Number.isFinite(rawPrice) || rawPrice <= 0 || rawPrice > MAX_TIER_PRICE) {
      return { error: `Set a price for "${cleanLabel}".` };
    }

    const cleanDescription =
      typeof description === "string" && description.trim() !== ""
        ? description.trim().slice(0, MAX_DESCRIPTION_LENGTH)
        : undefined;

    const tier: CollectionSizeTier = {
      label: cleanLabel,
      price: rawPrice,
      workSizes: parseWorkSizes(workSizes, workIds),
    };
    if (cleanDescription) tier.description = cleanDescription;
    tiers.push(tier);
  }

  return { tiers };
}

/**
 * Look a tier up by the label a cart line claims. Case-insensitive and
 * whitespace-tolerant, consistent with the case-insensitive size matching on
 * the works path in api/checkout: a cosmetic casing difference should never be
 * the reason a sale fails.
 */
export function findCollectionTier(
  tiers: CollectionSizeTier[] | null | undefined,
  label: string | null | undefined,
): CollectionSizeTier | undefined {
  if (!Array.isArray(tiers) || tiers.length === 0) return undefined;
  if (typeof label !== "string") return undefined;
  const key = label.trim().toLowerCase();
  if (!key) return undefined;
  return tiers.find((t) => t.label.trim().toLowerCase() === key);
}

/**
 * The cheapest tier, or null when the collection is untiered.
 *
 * This is the tier every surface defaults to: it is the one the buyer page
 * opens on, and the one the "From £X" band quotes. Tiers are stored in the
 * artist's own order, which is not necessarily cheapest first.
 */
export function cheapestTier(
  tiers: CollectionSizeTier[] | null | undefined,
): CollectionSizeTier | null {
  if (!Array.isArray(tiers) || tiers.length === 0) return null;
  return tiers.reduce((min, t) => (t.price < min.price ? t : min), tiers[0]);
}

/** The cheapest tier's price, or null when the collection is untiered. */
export function cheapestTierPrice(
  tiers: CollectionSizeTier[] | null | undefined,
): number | null {
  return cheapestTier(tiers)?.price ?? null;
}

/**
 * The price string shown on cards and headers.
 *
 * Returns null when there is no usable price, rather than picking a fallback.
 * The call sites disagree on the wording for that case (the browse feed renders
 * an empty string, the artist profile renders "Price on enquiry") and this
 * change is not the place to unify them.
 *
 * One tier is a named price, not a range, so it renders plain.
 */
export function collectionPriceBand(
  bundlePrice: number | null | undefined,
  tiers: CollectionSizeTier[] | null | undefined,
): string | null {
  const cheapest = cheapestTierPrice(tiers);
  if (cheapest !== null) {
    const prefix = (tiers as CollectionSizeTier[]).length > 1 ? "From " : "";
    return `${prefix}£${cheapest}`;
  }
  if (typeof bundlePrice !== "number" || !Number.isFinite(bundlePrice) || bundlePrice <= 0) {
    return null;
  }
  return `£${bundlePrice}`;
}
