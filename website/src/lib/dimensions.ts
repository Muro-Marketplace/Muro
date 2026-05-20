/**
 * Dimension display helper.
 *
 * Two failure modes exist on the `dimensions` field:
 *   1. Pixel dimensions ("2420 × 3632 px") captured from the uploaded
 *      image instead of a physical-size field. Meaningless to a venue
 *      choosing a print.
 *   2. Implausibly large physical dimensions ("128 × 192 in
 *      (325 × 487 cm)") that look like data error — either pixel data
 *      mis-labelled as inches, or a unit confusion during a migration.
 *      A 325 cm × 487 cm "print" is bigger than most walls.
 *
 * Both surface on offer cards + QR labels, which is where venues see
 * them. This helper hides anything that can't be trusted as a real
 * print dimension. The QA guidance was "use smallest possible
 * dimensions e.g. 3x2" when in doubt, so for unknown / unreliable
 * values we either drop them or fall back to a tiny static label.
 *
 * Returns the original string when it parses as a plausible print
 * size (any side ≤ MAX_REASONABLE_CM), the FALLBACK_DIMENSIONS string
 * when we want to substitute a placeholder, or `null` to hide.
 */

import { parseDimensions } from "@/lib/shipping-calculator";

const PIXEL_HINT = /\bpx\b|pixels?\b/i;
const PHYSICAL_HINT = /\b(cm|mm|m|in|inch|inches|ft|feet|A\d|B\d)\b/i;
// Pure "NNNN × NNNN" with both values typical of image-pixel size
// (>= 100 on both sides, no physical unit anywhere). Catches values
// like "2420 × 3632" with no suffix. Loosened to permit "*" and
// decimal suffixes since some legacy rows store fractional pixel
// counts (e.g. "5141.0 × 3427.0") and would otherwise miss the
// detector here.
const RAW_PIXEL_PAIR = /^\s*(\d{3,6})(?:\.\d+)?\s*[x×*]\s*(\d{3,6})(?:\.\d+)?\s*$/i;

// Anything bigger than this on a single side is almost certainly a
// data error: most prints, paintings, and photographs that venues
// place top out around 150cm; 200cm gives a generous margin for
// large statement pieces while still catching the 325 × 487 cm
// phantom QA flagged. Display in cm; helper converts inch sources
// before comparing.
const MAX_REASONABLE_CM = 200;

/**
 * Smallest sensible fallback when only pixel data or junk is
 * available. Empty string disables the fallback so the caller can
 * hide the line entirely (the default). Flip this to e.g. "3 × 2 in"
 * if a static placeholder is preferred per the QA note "use smallest
 * possible dimensions e.g. 3x2".
 */
const FALLBACK_DIMENSIONS = "";

export function displayPhysicalDimensions(
  raw: string | null | undefined,
): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Explicit pixel form, or a raw integer pair that looks like an
  // image resolution. Drop straight to the fallback.
  if (PIXEL_HINT.test(trimmed) || RAW_PIXEL_PAIR.test(trimmed)) {
    return FALLBACK_DIMENSIONS || null;
  }

  // Numeric-pair guard: any "<a> × <b>" with both values north of
  // 1000 is pixel data even without the "px" marker. parseDimensions
  // happily reinterprets such pairs as millimetres (any value > 300
  // triggers the mm fallback), which would yield a 343 × 514 cm
  // "print" for a 5141 × 3427 px image. Stop that here.
  const numericPair = trimmed.match(
    /^\s*(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*$/i,
  );
  if (numericPair) {
    const a = parseFloat(numericPair[1]);
    const b = parseFloat(numericPair[2]);
    if (Number.isFinite(a) && Number.isFinite(b) && a > 1000 && b > 1000) {
      return FALLBACK_DIMENSIONS || null;
    }
  }

  // Try to parse the value as a real physical size. parseDimensions
  // handles cm, mm, inches, A-sizes, and mixed-unit strings like
  // "20×28\" (50×70cm)". When it parses, we can sanity-check the
  // numbers and reject anything beyond MAX_REASONABLE_CM.
  const parsed = parseDimensions(trimmed);
  if (parsed) {
    const { widthCm, heightCm } = parsed;
    if (widthCm <= 0 || heightCm <= 0) {
      return FALLBACK_DIMENSIONS || null;
    }
    if (widthCm > MAX_REASONABLE_CM || heightCm > MAX_REASONABLE_CM) {
      return FALLBACK_DIMENSIONS || null;
    }
    return trimmed;
  }

  // Couldn't parse as a number but the string still looks physical
  // ("Multiple sizes", "Various", "Medium") — let it through; that's
  // artist-authored copy, not a pixel artefact.
  if (PHYSICAL_HINT.test(trimmed)) {
    return trimmed;
  }

  // Anything else (e.g. "Medium" without a number) passes through;
  // it's a description, not a measurement.
  return trimmed;
}
