// The one frame-uplift calculation for the artwork page.
//
// B10: there were two. The charged uplift checked the artist's explicit
// `pricesBySize` override first and only fell back to the perimeter
// ramp; the "+£X" shown against each row of the Frame dropdown computed
// the perimeter ramp and nothing else. So an artist who set explicit
// per-size frame prices ("A4 = £20, A2 = £45") had the dropdown quote
// one number and the buy button charge another for the same choice.
//
// The ramp itself is unchanged: `priceUplift` is treated as the price
// for the SMALLEST listed size (picked deterministically by ascending
// area, so the baseline does not move with the buyer's selection) and
// larger sizes scale by perimeter, which tracks frame moulding cost far
// better than a flat number across an A4 print and a 100x80cm canvas.
// Anything unparseable falls back to the flat uplift.

import { parseDimensions } from "@/lib/visualizer/dimensions";

export interface FrameOptionLike {
  priceUplift: number;
  /** Explicit per-size overrides, keyed by the pricing row's label. */
  pricesBySize?: Record<string, number>;
}

export interface PricingRowLike {
  label: string;
}

/** Round to whole pence so an override never renders as £20.000000001. */
function toPence(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The £ uplift for `frame` at `selectedSizeLabel`.
 *
 * @param frame              the chosen frame option, or null/undefined for none
 * @param selectedSizeLabel  the label of the pricing row the buyer selected
 * @param pricing            every pricing row on the work, for the baseline
 */
export function frameUpliftFor(
  frame: FrameOptionLike | null | undefined,
  selectedSizeLabel: string | null | undefined,
  pricing: readonly PricingRowLike[] | null | undefined,
): number {
  if (!frame) return 0;

  // An explicit per-size price the artist set always wins. This is the
  // branch the dropdown used to skip entirely.
  const explicit = selectedSizeLabel
    ? frame.pricesBySize?.[selectedSizeLabel]
    : undefined;
  if (typeof explicit === "number" && Number.isFinite(explicit) && explicit >= 0) {
    return toPence(explicit);
  }

  const baseUplift = frame.priceUplift || 0;
  if (baseUplift <= 0) return 0;
  if (!Array.isArray(pricing) || pricing.length === 0) return baseUplift;

  const parsedSizes = pricing
    .map((p) => parseDimensions(p.label))
    .filter((d): d is { widthCm: number; heightCm: number } => Boolean(d));
  if (parsedSizes.length === 0) return baseUplift;

  let smallestArea = Infinity;
  let baselinePerimeter = 0;
  for (const dims of parsedSizes) {
    const area = dims.widthCm * dims.heightCm;
    if (area < smallestArea) {
      smallestArea = area;
      baselinePerimeter = 2 * (dims.widthCm + dims.heightCm);
    }
  }
  if (!baselinePerimeter) return baseUplift;

  const selectedDims = selectedSizeLabel ? parseDimensions(selectedSizeLabel) : null;
  if (!selectedDims) return baseUplift;

  const selectedPerimeter = 2 * (selectedDims.widthCm + selectedDims.heightCm);
  return Math.round(baseUplift * (selectedPerimeter / baselinePerimeter));
}
