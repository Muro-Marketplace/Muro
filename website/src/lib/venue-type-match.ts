// Does a venue's free-text type match a filter chip?
//
// QA 2026-08-30 bug 3: /spaces offers fixed chips ("Café", "Restaurant",
// "Hotel") and filtered with `v.type === chip`, but `venue_profiles.type` is
// free text a venue writes itself. Production holds "Café / Coffee Shop",
// "Restaurant / Bar" and "Hotel / Hospitality", none of which equal any chip,
// so 7 of 29 venues could not be surfaced by any filter: a quarter of supply
// was invisible to the exact artists looking for it.
//
// Matching is deliberately generous rather than exact. The alternative is
// constraining the column to an enum, which would either reject what venues
// have already written or silently rewrite it.

/** Lowercase, strip accents and punctuation, collapse whitespace. */
function canonical(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * True when `venueType` should appear under `filter`.
 *
 * "All" matches everything. Otherwise a venue matches when any of its
 * slash-separated segments matches the filter, in either direction, so
 * "Café / Coffee Shop" is found by "Café" and a venue typed simply "Coffee"
 * is found by "Coffee Shop".
 */
export function matchesVenueType(venueType: string | null | undefined, filter: string): boolean {
  if (!filter || filter === "All") return true;
  const want = canonical(filter);
  if (!want) return true;

  const have = canonical(venueType || "");
  if (!have) return false;
  if (have === want) return true;

  const segments = (venueType || "").split("/").map(canonical).filter(Boolean);
  return segments.some((seg) => seg === want || seg.includes(want) || want.includes(seg));
}
