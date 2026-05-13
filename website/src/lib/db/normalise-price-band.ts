/**
 * Prefix the £ symbol to any numeric token in a price band string that
 * isn't already prefixed. Catches DB rows like "180 - 320" or "From 150"
 * and turns them into "£180 - £320" / "From £150" so the public
 * surfaces aren't missing the currency mark.
 *
 * Pure helper, lives in its own file so the unit test doesn't drag in
 * the Supabase client at module-load time.
 */
export function normalisePriceBand(raw: string | null | undefined): string {
  if (!raw) return "";
  // Replace any digit run that isn't immediately preceded by £ (or $/€,
  // a digit, or a dot) with a £-prefixed version. The dot must be
  // excluded so the fractional part of "£29.99" doesn't get re-prefixed
  // into "£29.£99" (the original regression that prompted this fix).
  return raw.replace(
    /(^|[^£$€\d.])(\d[\d,]*(?:\.\d+)?)/g,
    (_match, prefix, num) => `${prefix}£${num}`,
  );
}
