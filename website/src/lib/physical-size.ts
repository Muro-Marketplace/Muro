// Is this string a physical size a buyer would recognise, or the image file's
// pixel dimensions?
//
// Owner-reported 2026-08-31: buying a piece off the wall showed
// "Gyeongbokgung Palace (Off the wall, 2795 × 4192 px)" in the basket, and
// "2795 × 4192 px" as the size. `artist_works.dimensions` is derived from the
// uploaded IMAGE, not from the artwork, so it is a pixel count for most rows
// (live data has "4160 × 6240 px", "5141 × 3427 px", and so on). Several code
// paths used it as a fallback size label, so the pixel string reached the
// basket, the order summary and the receipt.
//
// A pixel count is never a physical size, so it is refused outright rather
// than reformatted: there is no way to turn it into one without knowing the
// print resolution the artist intended.

/** True when the value is (or ends in) an image pixel measurement. */
export function isPixelDimensions(value: string | null | undefined): boolean {
  const v = (value || "").trim();
  if (!v) return false;
  return /\bpx\b\s*$/i.test(v) || /^\s*\d+\s*[×x]\s*\d+\s*px\b/i.test(v);
}

/**
 * The value if it is a usable physical size, otherwise `fallback`.
 *
 * Default fallback is "Original", the no-variant label the cart and checkout
 * already use, so an unlabelled piece reads as itself rather than as a file.
 */
export function physicalSizeLabel(
  value: string | null | undefined,
  fallback = "Original",
): string {
  const v = (value || "").trim();
  if (!v || isPixelDimensions(v)) return fallback;
  return v;
}
