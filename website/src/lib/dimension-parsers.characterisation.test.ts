// N-K2 characterisation test. NOT an endorsement of either parser.
//
// There are three modules in this family and they do not agree:
//
//   lib/shipping-calculator.ts   parseDimensions  → drives shipping price
//   lib/visualizer/dimensions.ts parseDimensions  → drives the wall preview
//   lib/dimensions.ts            displayPhysicalDimensions → guards what buyers see
//
// 07 §13.2 says to collapse the parsers onto lib/visualizer/dimensions.ts. Doing
// that changes shipping prices, because the two disagree on 17 of the 27 inputs
// below, INCLUDING most of the real data in prod. This file pins today's behaviour
// so the collapse has to be a deliberate choice per input rather than an accident,
// and so any change shows up as a diff in this file rather than in someone's
// shipping quote.
//
// Every PROD_DIMENSIONS value is a real distinct artist_works.dimensions value in
// project uwkuhygwvasdzwsusiym as of 2026-07-30.

import { describe, it, expect } from "vitest";
import { parseDimensions as shippingParse } from "./shipping-calculator";
import { parseDimensions as visualizerParse } from "./visualizer/dimensions";
import { displayPhysicalDimensions } from "./dimensions";

const fmt = (d: { widthCm: number; heightCm: number } | null): string =>
  d ? `${d.widthCm}×${d.heightCm}` : "null";

/** input → [shipping, visualizer] as they behave TODAY. */
const PROD_DIMENSIONS: [string, string, string][] = [
  ["1371 × 1431 px", "137×143", "137.1×143.1"],
  ["2795 × 4192 px", "280×419", "279.5×419.2"],
  ["60 × 90 cm", "60×90", "60×90"],
  ["70 × 100 cm", "70×100", "70×100"],
  ["750 × 562 px", "56×75", "750×562"],
  ["80x110cm", "80×110", "80×110"],
  ["1335 × 2003 px", "134×200", "133.5×200.3"],
  ["2326 × 1551 px", "155×233", "232.6×155.1"],
  ["2420 × 3632 px", "242×363", "242×363.2"],
  ["3648 × 5472 px", "365×547", "364.8×547.2"],
  ["3860 × 5790 px", "386×579", "386×579"],
  ["40 × 40 cm", "40×40", "40×40"],
  ["40 × 60 cm", "40×60", "40×60"],
  ["4160 × 6240 px", "416×624", "416×624"],
  ["4596 × 3062 px", "306×460", "459.6×306.2"],
  ["50 × 50 cm", "50×50", "50×50"],
  ["50 × 70 cm", "50×70", "50×70"],
  ["5141 × 3427 px", "343×514", "514.1×342.7"],
  ["612 × 459 px", "46×61", "612×459"],
  ["812 × 812 px", "81×81", "812×812"],
];

/** The formats each parser's own docstring claims to support. */
const DOCUMENTED_FORMATS: [string, string, string][] = [
  ["A4", "21×30", "21×29.7"],
  ["A3", "30×42", "29.7×42"],
  ["A0", "84×119", "84.1×118.9"],
  ["3 x 20x30 cm", "20×30", "3×20"],
  ['8×10" (A4)', "21×30", "21×29.7"],
  ['20×28" (50×70cm)', "50×70", "50×70"],
  ["12 inch by 16 inch", "30×41", "30.48×40.64"],
];

const ALL = [...PROD_DIMENSIONS, ...DOCUMENTED_FORMATS];

describe("parseDimensions, current behaviour pinned", () => {
  it.each(ALL)("%s: shipping reads %s, visualizer reads %s", (input, shipping, visualizer) => {
    expect(fmt(shippingParse(input)), `shipping changed for "${input}"`).toBe(shipping);
    expect(fmt(visualizerParse(input)), `visualizer changed for "${input}"`).toBe(visualizer);
  });
});

describe("where the two parsers disagree", () => {
  const disagreements = ALL.filter(([, s, v]) => s !== v);

  it("disagrees on 17 of the 27 known inputs", () => {
    // If a collapse lands, this number should go to 0 and this test should be
    // deleted along with the losing parser.
    expect(disagreements).toHaveLength(17);
  });

  it("disagrees on real prod data, not just exotic edge cases", () => {
    const prodDisagreements = PROD_DIMENSIONS.filter(([, s, v]) => s !== v);
    expect(prodDisagreements.length).toBeGreaterThan(0);
    // The worst case: a pixel value one parser scales and the other does not, so
    // the same artwork is 75cm tall for shipping and 5.6 metres tall for the
    // preview.
    expect(fmt(shippingParse("750 × 562 px"))).toBe("56×75");
    expect(fmt(visualizerParse("750 × 562 px"))).toBe("750×562");
  });

  it("shipping sorts the pair descending, so it silently swaps orientation", () => {
    // "2326 × 1551" is landscape. Shipping returns portrait.
    expect(fmt(shippingParse("2326 × 1551 px"))).toBe("155×233");
    expect(fmt(visualizerParse("2326 × 1551 px"))).toBe("232.6×155.1");
  });

  it("only shipping understands the multi-piece form its docstring advertises", () => {
    expect(fmt(shippingParse("3 x 20x30 cm"))).toBe("20×30");
    expect(fmt(visualizerParse("3 x 20x30 cm"))).toBe("3×20");
  });

  it("only the visualizer uses true ISO paper sizes", () => {
    // A4 is 21 × 29.7cm. Shipping rounds to 30.
    expect(fmt(shippingParse("A4"))).toBe("21×30");
    expect(fmt(visualizerParse("A4"))).toBe("21×29.7");
  });
});

describe("the display guard already rejects what shipping accepts", () => {
  it("returns a fallback for every pixel-valued input", () => {
    const pixelInputs = PROD_DIMENSIONS.map(([input]) => input).filter((i) => /px/.test(i));
    expect(pixelInputs.length).toBeGreaterThan(10);
    for (const input of pixelInputs) {
      expect(displayPhysicalDimensions(input), `${input} reached the buyer`).not.toBe(input);
    }
  });

  it("passes a plausible print size through untouched", () => {
    for (const input of ["60 × 90 cm", "50 × 70 cm", "A4"]) {
      expect(displayPhysicalDimensions(input)).toBe(input);
    }
  });

  it("shows that shipping has no equivalent guard", () => {
    // The display layer refuses "2420 × 3632 px" but shipping happily prices a
    // 242 × 363cm parcel from it. That asymmetry is the live defect.
    expect(displayPhysicalDimensions("2420 × 3632 px")).not.toBe("2420 × 3632 px");
    expect(shippingParse("2420 × 3632 px")).not.toBeNull();
  });
});
