// QA flag D16. The labels page must offer venues as (name, slug) PAIRS: the
// QR route attributes a scan to a venue (revenue share, redirect, signed
// venue param) only via the `vs=<slug>` query param, so a dropdown built from
// display names alone silently breaks attribution on every label it prints.

export interface VenueOption {
  name: string;
  slug: string | null;
}

/**
 * Unique venue options from the artist's placements, first occurrence wins.
 * Rows without a display name are dropped (nothing to show); rows without a
 * slug are kept so the label can at least carry the compat `v=` name.
 */
export function buildVenueOptions(
  placements: Array<{ venue?: string | null; venue_slug?: string | null }>,
): VenueOption[] {
  const seen = new Map<string, VenueOption>();
  for (const p of placements) {
    if (!p.venue) continue;
    const key = p.venue_slug || p.venue;
    if (!seen.has(key)) seen.set(key, { name: p.venue, slug: p.venue_slug || null });
  }
  return [...seen.values()];
}

/**
 * Resolve a labels-page deep-link venue param against the loaded options.
 * Emails pass the SLUG (?venue=the-curzon); portal links pass the display
 * name (and, since D16, also ?venueSlug=). Slug match wins over name match.
 */
export function resolveVenueParam(
  options: VenueOption[],
  param: string | null,
): VenueOption | null {
  if (!param) return null;
  return (
    options.find((v) => v.slug === param) ||
    options.find((v) => v.name.toLowerCase() === param.toLowerCase()) ||
    null
  );
}
