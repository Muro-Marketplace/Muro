/**
 * Dimension display helper.
 *
 * Some artwork rows carry pixel dimensions (e.g. "2420 × 3632 px") in
 * the `dimensions` field because the value was captured from the
 * uploaded image rather than a physical-size field. Surfacing pixel
 * counts on offer cards or QR labels is meaningless to a venue
 * choosing a print, so this helper detects the pixel form and either
 * hides it or substitutes a small placeholder physical size.
 *
 * Returns the original string when it already looks physical
 * (contains "cm", "mm", inch markers like `"`, or matches a size
 * label like "A4"), `null` when we have nothing useful to show.
 */

const PIXEL_HINT = /\bpx\b|pixels?\b/i;
const PHYSICAL_HINT = /\b(cm|mm|m|in|inch|inches|ft|feet|A\d|B\d)\b/i;
// Pure "NNNN × NNNN" with both values typical of image-pixel size
// (>= 200 and no physical unit anywhere). This catches values like
// "2420 × 3632" with no suffix.
const RAW_PIXEL_PAIR = /^\s*(\d{3,5})\s*[x×]\s*(\d{3,5})\s*$/i;

/**
 * Smallest sensible fallback when only pixel data is available.
 * Matches the QA-team default: any tiny placeholder reads as "we
 * don't have a real size, treat this as a hint" without claiming a
 * specific print dimension. Empty string disables the fallback.
 */
const FALLBACK_DIMENSIONS = "";

export function displayPhysicalDimensions(
  raw: string | null | undefined,
): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Already labelled as physical (cm, inches, A4, etc.) — show as-is.
  if (PHYSICAL_HINT.test(trimmed) && !PIXEL_HINT.test(trimmed)) {
    return trimmed;
  }

  // Explicitly labelled pixels, or a raw pair that's almost certainly
  // an image resolution rather than a print size. Drop it and let the
  // caller fall back to the placeholder (or nothing).
  if (PIXEL_HINT.test(trimmed) || RAW_PIXEL_PAIR.test(trimmed)) {
    return FALLBACK_DIMENSIONS || null;
  }

  // Anything else (e.g. "Medium", "Various sizes") passes through —
  // it's an artist-authored description, not a pixel artefact.
  return trimmed;
}
