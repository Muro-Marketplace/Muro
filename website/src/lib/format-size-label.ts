/**
 * Normalize a size label to "<inches>" (<cm>×<cm> cm)" for buyer-
 * facing display.
 *
 * Labels are stored as freeform strings on `SizePricing.label`.
 * Historic data has all sorts of bracketed content:
 *   - "8×10\" (A4)"           legacy paper-size code
 *   - "8×10\" (8×10\")"       duplicated inches (the bug we're fixing)
 *   - "8×10\""                no brackets at all
 *   - "8×10\" (20×25 cm)"     already correct → returned untouched
 *   - "50 × 70 cm"            pure cm, no brackets, leave as-is
 *
 * The orientation is preserved, "16×12\"" stays "16×12\" (41×30 cm)"
 * (landscape), "12×16\"" stays "12×16\" (30×41 cm)" (portrait).
 *
 * Display-only, does NOT mutate stored data. Apply at every site
 * that shows a size label to a customer; leave the editor inputs
 * alone so artists can keep typing whatever they want.
 */
export function formatSizeLabelForDisplay(label: string | null | undefined): string {
  if (!label) return "";
  const original = label.trim();
  if (!original) return "";

  // Strip any existing parenthetical content. We always re-derive the
  // bracketed cm from the leading inch numbers, so whatever was in
  // there before doesn't matter.
  const withoutParens = original.replace(/\s*\([^)]*\)/g, "").trim();

  // Match the inch part, "<num>×<num>" with an inch marker (" or in
  // or inch). Width × height, order preserved.
  const inchRe =
    /(\d+(?:\.\d+)?)\s*[×x×Xx]\s*(\d+(?:\.\d+)?)\s*(?:["″]|\bin(?:ch(?:es)?)?\b)/;
  const inchMatch = withoutParens.match(inchRe);
  if (inchMatch) {
    const w = parseFloat(inchMatch[1]);
    const h = parseFloat(inchMatch[2]);
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      const wCm = Math.round(w * 2.54);
      const hCm = Math.round(h * 2.54);
      // Format inch numbers without trailing zeros.
      const wInch = stripTrailingZero(w);
      const hInch = stripTrailingZero(h);
      return `${wInch}×${hInch}" (${wCm}×${hCm} cm)`;
    }
  }

  // No inch marker, leave whatever the artist typed. Pure cm,
  // paper-size codes (A4, A3), or freeform descriptions all flow
  // through unchanged.
  return original;
}

function stripTrailingZero(n: number): string {
  // 8.0 → "8", 8.5 → "8.5"
  return Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(2)));
}
