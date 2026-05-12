// Size-band ranges, labels, and the dimension hint shown on the right
// side of each filter row. Single source of truth, bandForCm() and
// the FilterPanel render must agree on the same numbers.

import { parseDimensions } from "@/lib/shipping-calculator";

export type SizeBandKey = "small" | "medium" | "large" | "xl";

export interface SizeBand {
  key: SizeBandKey;
  label: string;
  /** Inclusive lower bound on longest edge in cm. null = unbounded below. */
  minCm: number | null;
  /** Inclusive upper bound on longest edge in cm. null = unbounded above. */
  maxCm: number | null;
  /** Display string for the right side of the filter row. En dash for ranges. */
  dimensionHint: string;
}

export const SIZE_BANDS: readonly SizeBand[] = [
  { key: "small",  label: "Small",  minCm: null, maxCm: 30,   dimensionHint: "up to 30 cm"   },
  { key: "medium", label: "Medium", minCm: 30,   maxCm: 60,   dimensionHint: "30 to 60 cm"   },
  { key: "large",  label: "Large",  minCm: 60,   maxCm: 100,  dimensionHint: "60 to 100 cm"  },
  { key: "xl",     label: "XL",     minCm: 100,  maxCm: null, dimensionHint: "over 100 cm"   },
];

export function bandForCm(longestEdgeCm: number): SizeBandKey {
  for (const band of SIZE_BANDS) {
    const lo = band.minCm ?? -Infinity;
    const hi = band.maxCm ?? Infinity;
    if (longestEdgeCm > lo && longestEdgeCm <= hi) return band.key;
  }
  return "xl";
}

/**
 * Set of size bands a work matches across every size string the work
 * exposes — work-level dimensions, the artist-selected collection size
 * (if present), and every pricing tier label. A work that ships in
 * A4, A2 and A0 should match Small, Medium and XL filters, not just
 * whichever happens to be largest.
 *
 * Falls back to "medium" when nothing parses, so unparseable works
 * still match a single, generous-by-default filter rather than
 * disappearing entirely.
 */
export function bandsForWork(work: {
  dimensions?: string | null;
  selectedSize?: string | null;
  pricing?: { label: string }[] | null;
}): Set<SizeBandKey> {
  const bands = new Set<SizeBandKey>();
  const candidates: string[] = [];
  if (work.dimensions) candidates.push(work.dimensions);
  if (work.selectedSize) candidates.push(work.selectedSize);
  for (const p of work.pricing || []) {
    if (p?.label) candidates.push(p.label);
  }
  for (const c of candidates) {
    const d = parseDimensions(c);
    if (!d) continue;
    const largest = Math.max(d.widthCm, d.heightCm);
    bands.add(bandForCm(largest));
  }
  if (bands.size === 0) bands.add("medium");
  return bands;
}
