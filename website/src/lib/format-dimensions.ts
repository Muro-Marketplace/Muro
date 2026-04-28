// Buyer-facing dimensions formatter — inches first, cm in brackets.
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
// Display-only — never mutate stored data. Applied at every site
// that shows the work-level `dimensions` string to a customer
// (browse cards, lightbox, artwork detail, collection detail, basket,
// receipt-page summaries). Email templates intentionally not piped
// through this yet — handled separately when we re-render templates.
//
// `formatSizeLabelForDisplay` in lib/format-size-label.ts handles the
// `pricing[].label` field (the per-size selector); they share the
// "inches first" output but the inputs and parsing strategies differ.

import { parseDimensions } from "@/lib/shipping-calculator";

const CM_PER_INCH = 2.54;

function inchesFromCm(cm: number): number {
  return Math.round(cm / CM_PER_INCH);
}

/** Convert a raw dimensions string into inches-first / cm-bracketed
 *  display form. Returns the original string if it can't be parsed
 *  (so freeform notes like "Multiple sizes" still render). */
export function formatDimensionsForDisplay(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const dims = parseDimensions(trimmed);
  if (!dims) return trimmed;

  const wCm = Math.round(dims.widthCm);
  const hCm = Math.round(dims.heightCm);
  const wIn = inchesFromCm(dims.widthCm);
  const hIn = inchesFromCm(dims.heightCm);
  return `${wIn} × ${hIn} in (${wCm} × ${hCm} cm)`;
}
