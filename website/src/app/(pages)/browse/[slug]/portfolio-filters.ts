// Pure helpers for the artist profile's portfolio grid.
//
// Extracted from ArtistProfileClient so the two things a buyer's money
// depends on (which works a theme actually selects, and which size tier
// "Buy Now" puts in the cart) are testable without mounting the page.
//
// B6: the theme picker filtered by asking whether `title + medium`
// contained the theme string. A work's own theme tags were never
// consulted, so it was wrong in both directions: a theme like
// "Hospitality-friendly" or "Office collection" never appears in a
// title or a medium and emptied the portfolio for an artist genuinely
// tagged with it, while a theme like "Colour" matched any work with the
// word in its title regardless of subject.
//
// B7: the bulk Buy Now took `tiers[tiers.length - 1]` with a comment
// claiming it was the largest tier. Pricing arrays keep the artist's
// entry order and are never sorted, so the last row is simply the last
// one the artist typed. The offer modal's asking-price hint next to it
// uses Math.max, so the two could name different money for the same
// selection.

/** The shape this module needs from a pricing row. */
export interface TierLike {
  label: string;
  price: number;
}

/** The shape this module needs from a work. */
export interface ThemedWorkLike {
  title: string;
  medium: string;
  description?: string;
  /** Per-work theme tags, where a record carries them. */
  themes?: string[] | null;
}

/**
 * Read a work's own theme tags defensively.
 *
 * Works are typed without a `themes` field today (it is an artist-level
 * column), and seed records, DB rows and legacy in-memory data all reach
 * this component through the same prop, so the read is structural rather
 * than type-driven: anything that is not an array of non-empty strings is
 * treated as untagged.
 */
export function workThemeTags(work: ThemedWorkLike): string[] {
  const raw = (work as { themes?: unknown }).themes;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * Does `work` belong under `theme`?
 *
 * Tagged works match on their tags, case-insensitively and on the whole
 * tag, so "Colour" no longer swallows "Colours of Autumn" and
 * "Hospitality-friendly" no longer matches nothing. Untagged works keep
 * the historical substring behaviour, widened to include the work's
 * description because that is where an untagged work's subject matter
 * is actually written down.
 */
export function workMatchesTheme(work: ThemedWorkLike, theme: string): boolean {
  const needle = theme.trim().toLowerCase();
  if (!needle) return true;

  const tags = workThemeTags(work);
  if (tags.length > 0) {
    return tags.some((t) => t.toLowerCase() === needle);
  }

  const haystack = [work.title, work.medium, work.description ?? ""]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

/**
 * The portfolio grid's works for the selected theme. `"All"` is the
 * picker's sentinel for no filter.
 */
export function filterWorksByTheme<T extends ThemedWorkLike>(
  works: readonly T[],
  activeTheme: string,
): T[] {
  if (!activeTheme || activeTheme === "All") return works.slice();
  return works.filter((w) => workMatchesTheme(w, activeTheme));
}

/**
 * The highest-priced tier, or null when the work has no priced tier.
 *
 * Matches how the bulk offer modal derives its asking price (Math.max
 * over the same array), so the hint and the cart line can no longer
 * disagree. Ties keep the earlier entry, which is the artist's own
 * ordering. Non-finite and negative prices are ignored rather than
 * winning by accident.
 */
export function largestPricedTier<T extends TierLike>(
  tiers: readonly T[] | null | undefined,
): T | null {
  if (!Array.isArray(tiers) || tiers.length === 0) return null;
  let best: T | null = null;
  let bestPrice = -Infinity;
  for (const tier of tiers) {
    const price = Number(tier?.price);
    if (!Number.isFinite(price) || price < 0) continue;
    if (price > bestPrice) {
      bestPrice = price;
      best = tier;
    }
  }
  return best;
}
