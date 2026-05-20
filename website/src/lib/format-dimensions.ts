// Buyer-facing dimensions formatter, inches first, cm in brackets.
//
// Wallplace stores artists' work dimensions as freeform strings
// (`"60 × 90 cm"`, `"24 x 36 inches"`, `"A4"`, etc.). For display we
// want a single canonical form so a buyer scanning the site sees the
// same shape everywhere:
//
//   "60 × 90 cm"   →  "24 × 35 in (60 × 90 cm)"
//   "24 x 36 in"   →  "24 × 36 in (61 × 91 cm)"
//   "A4"           →  "8 × 12 in (21 × 30 cm)"
//   "Multiple sizes" (unparseable)  →  "Multiple sizes" (passthrough)
//
// Display-only, never mutate stored data. Applied at every site
// that shows the work-level `dimensions` string to a customer
// (browse cards, lightbox, artwork detail, collection detail, basket,
// receipt-page summaries). Email templates intentionally not piped
// through this yet, handled separately when we re-render templates.
//
// `formatSizeLabelForDisplay` in lib/format-size-label.ts handles the
// `pricing[].label` field (the per-size selector); they share the
// "inches first" output but the inputs and parsing strategies differ.

import { parseDimensions } from "@/lib/shipping-calculator";

const CM_PER_INCH = 2.54;

// Plausibility cap. Anything bigger on a single side is almost
// certainly mis-stored data (pixel dimensions mis-labelled as
// inches, an extra zero, etc.). QA flagged "128 × 192 in
// (325 × 487 cm)" surfacing on offer cards, that's a 16 ft × 10 ft
// "print" which is implausible for the venues using Wallplace.
// Mirrored in lib/dimensions.ts → displayPhysicalDimensions so the
// two helpers agree.
const MAX_REASONABLE_CM = 200;

// Pixel-form detectors. Aligned with lib/dimensions.ts: any string
// that explicitly mentions pixels, or a raw "1234 × 5678" pair with
// no physical unit, is treated as image-resolution data and hidden.
// We're permissive on what "looks like a pixel pair" so values like
// "5141 × 3427" or "5141 x 3427" or "5141.0 × 3427.0" don't sneak
// through and get reinterpreted as mm or inches by parseDimensions.
const PIXEL_HINT = /\bpx\b|pixels?\b/i;
const RAW_PIXEL_PAIR = /^\s*(\d{3,6})(?:\.\d+)?\s*[x×*]\s*(\d{3,6})(?:\.\d+)?\s*$/i;

function inchesFromCm(cm: number): number {
  return Math.round(cm / CM_PER_INCH);
}

/** Convert a raw dimensions string into inches-first / cm-bracketed
 *  display form. Returns the original string if it can't be parsed
 *  but doesn't look like a pixel artefact (so freeform notes like
 *  "Multiple sizes" still render). Returns an empty string when the
 *  parsed value exceeds MAX_REASONABLE_CM or the source looks like
 *  pixel data, callers fall back to the artist's medium label or
 *  hide the line. */
export function formatDimensionsForDisplay(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";

  // Pixel form, hide. Same logic as displayPhysicalDimensions so the
  // browse and offer surfaces stay consistent.
  if (PIXEL_HINT.test(trimmed) || RAW_PIXEL_PAIR.test(trimmed)) {
    return "";
  }

  // Defensive numeric guard: any pair where BOTH values exceed
  // ~250 (the largest plausible print dimension in any unit other
  // than mm or pixels) is treated as pixel data even without an
  // explicit "px" marker. This catches legacy rows that lost their
  // unit suffix during a backfill and would otherwise reach
  // parseDimensions, which guesses "mm" for values > 300 and
  // produces a nonsensical 343×514 cm print.
  const numericPair = trimmed.match(
    /^\s*(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*$/i,
  );
  if (numericPair) {
    const a = parseFloat(numericPair[1]);
    const b = parseFloat(numericPair[2]);
    if (Number.isFinite(a) && Number.isFinite(b) && a > 1000 && b > 1000) {
      return "";
    }
  }

  const dims = parseDimensions(trimmed);
  if (!dims) return trimmed;

  if (
    dims.widthCm <= 0 ||
    dims.heightCm <= 0 ||
    dims.widthCm > MAX_REASONABLE_CM ||
    dims.heightCm > MAX_REASONABLE_CM
  ) {
    return "";
  }

  const wCm = Math.round(dims.widthCm);
  const hCm = Math.round(dims.heightCm);
  const wIn = inchesFromCm(dims.widthCm);
  const hIn = inchesFromCm(dims.heightCm);
  return `${wIn} × ${hIn} in (${wCm} × ${hCm} cm)`;
}
