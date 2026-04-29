// Size-band ranges, labels, and the dimension hint shown on the right
// side of each filter row. Single source of truth, bandForCm() and
// the FilterPanel render must agree on the same numbers.

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
  { key: "small",  label: "Small",  minCm: null, maxCm: 30,   dimensionHint: "≤ 30 cm"   },
  { key: "medium", label: "Medium", minCm: 30,   maxCm: 60,   dimensionHint: "30–60 cm"  },
  { key: "large",  label: "Large",  minCm: 60,   maxCm: 100,  dimensionHint: "60–100 cm" },
  { key: "xl",     label: "XL",     minCm: 100,  maxCm: null, dimensionHint: "> 100 cm"  },
];

export function bandForCm(longestEdgeCm: number): SizeBandKey {
  for (const band of SIZE_BANDS) {
    const lo = band.minCm ?? -Infinity;
    const hi = band.maxCm ?? Infinity;
    if (longestEdgeCm > lo && longestEdgeCm <= hi) return band.key;
  }
  return "xl";
}
