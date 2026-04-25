// Dimension parser — covers every format we've seen in the seed data
// (artists.ts) plus edge cases for confused/unusual artist input.

import { describe, expect, it } from "vitest";
import {
  buildSizeVariants,
  cycleSize,
  parseDimensions,
  pickDefaultSize,
  type SizeVariant,
} from "./dimensions";

describe("parseDimensions — explicit cm", () => {
  it("70 x 50 cm", () => {
    expect(parseDimensions("70 x 50 cm")).toEqual({ widthCm: 70, heightCm: 50 });
  });
  it("50×70cm (no spaces)", () => {
    expect(parseDimensions("50×70cm")).toEqual({ widthCm: 50, heightCm: 70 });
  });
  it("70 x 100 cm", () => {
    expect(parseDimensions("70 x 100 cm")).toEqual({
      widthCm: 70,
      heightCm: 100,
    });
  });
  it("decimals", () => {
    expect(parseDimensions("21.5 x 30 cm")).toEqual({
      widthCm: 21.5,
      heightCm: 30,
    });
  });
});

describe("parseDimensions — mm and m", () => {
  it("500x700 mm", () => {
    expect(parseDimensions("500x700 mm")).toEqual({ widthCm: 50, heightCm: 70 });
  });
  it("1.2 x 1.8 m", () => {
    expect(parseDimensions("1.2 x 1.8 m")).toEqual({
      widthCm: 120,
      heightCm: 180,
    });
  });
});

describe("parseDimensions — inches", () => {
  it('8×10"', () => {
    const r = parseDimensions('8×10"');
    expect(r).not.toBeNull();
    expect(r!.widthCm).toBeCloseTo(20.32, 2);
    expect(r!.heightCm).toBeCloseTo(25.4, 2);
  });
  it("12 x 16 inch", () => {
    const r = parseDimensions("12 x 16 inch");
    expect(r!.widthCm).toBeCloseTo(30.48, 2);
    expect(r!.heightCm).toBeCloseTo(40.64, 2);
  });
  it("16 inches by 24 inches", () => {
    const r = parseDimensions("16 inches by 24 inches");
    expect(r!.widthCm).toBeCloseTo(40.64, 2);
    expect(r!.heightCm).toBeCloseTo(60.96, 2);
  });
});

describe("parseDimensions — paper sizes", () => {
  it("A4", () => {
    expect(parseDimensions("A4")).toEqual({ widthCm: 21, heightCm: 29.7 });
  });
  it("a3 (lowercase)", () => {
    expect(parseDimensions("a3")).toEqual({ widthCm: 29.7, heightCm: 42 });
  });
  it("A2 with whitespace", () => {
    expect(parseDimensions("  A2  ")).toEqual({ widthCm: 42, heightCm: 59.4 });
  });
  it("LETTER", () => {
    const r = parseDimensions("Letter");
    expect(r!.widthCm).toBeCloseTo(21.59, 2);
    expect(r!.heightCm).toBeCloseTo(27.94, 2);
  });
});

describe("parseDimensions — parenthesised hints (the seed data shape)", () => {
  it('8×10" (A4) prefers A4', () => {
    // 8×10" is 20.32×25.4 cm; A4 is 21×29.7 cm. Different! We pick A4
    // because the artist explicitly noted it as the "true" size.
    expect(parseDimensions('8×10" (A4)')).toEqual({ widthCm: 21, heightCm: 29.7 });
  });
  it('20×28" (50×70cm)', () => {
    expect(parseDimensions('20×28" (50×70cm)')).toEqual({
      widthCm: 50,
      heightCm: 70,
    });
  });
  it('12×16" (A3)', () => {
    expect(parseDimensions('12×16" (A3)')).toEqual({
      widthCm: 29.7,
      heightCm: 42,
    });
  });
});

describe("parseDimensions — magnitude-based unit guess", () => {
  it("small bare numbers default to inches", () => {
    // 8×10 with no unit reads as inches (a stamp-sized 8×10cm would be unusual)
    const r = parseDimensions("8×10");
    expect(r!.widthCm).toBeCloseTo(20.32, 2);
  });
  it("medium bare numbers default to cm", () => {
    expect(parseDimensions("70 x 100")).toEqual({ widthCm: 70, heightCm: 100 });
  });
  it("very large bare numbers default to mm", () => {
    expect(parseDimensions("1500 x 2000")).toEqual({
      widthCm: 150,
      heightCm: 200,
    });
  });
});

describe("parseDimensions — invalid input", () => {
  it("null", () => expect(parseDimensions(null)).toBeNull());
  it("undefined", () => expect(parseDimensions(undefined)).toBeNull());
  it("empty", () => expect(parseDimensions("")).toBeNull());
  it("garbage", () => expect(parseDimensions("medium painting")).toBeNull());
  it("zero dimensions", () => expect(parseDimensions("0 x 0 cm")).toBeNull());
  it("only one number", () => expect(parseDimensions("70 cm")).toBeNull());
});

// ── Size variants ───────────────────────────────────────────────────────

describe("buildSizeVariants", () => {
  const pricingFromSeed = [
    { label: '8×10" (A4)', price: 180 },
    { label: '12×16" (A3)', price: 270 },
    { label: '16×24" (A2)', price: 378 },
    { label: '20×28" (50×70cm)', price: 504 },
  ];

  it("parses every row of seed data", () => {
    const v = buildSizeVariants(pricingFromSeed);
    expect(v.length).toBe(4);
    expect(v[0]).toMatchObject({
      label: '8×10" (A4)',
      widthCm: 21,
      heightCm: 29.7,
      priceGbp: 180,
    });
    expect(v[3]).toMatchObject({
      widthCm: 50,
      heightCm: 70,
      priceGbp: 504,
    });
  });

  it("dedupes by (w, h)", () => {
    const v = buildSizeVariants([
      { label: "A4", price: 100 },
      { label: '8.27"×11.69"', price: 100 }, // also A4-equivalent
    ]);
    // First wins.
    expect(v.length).toBe(1);
    expect(v[0].label).toBe("A4");
  });

  it("skips rows that don't parse", () => {
    const v = buildSizeVariants([
      { label: "Small", price: 50 },
      { label: "A4", price: 100 },
      { label: "Custom request", price: 200 },
    ]);
    expect(v.length).toBe(1);
    expect(v[0].label).toBe("A4");
  });

  it("empty in → empty out", () => {
    expect(buildSizeVariants([])).toEqual([]);
    expect(buildSizeVariants(null)).toEqual([]);
    expect(buildSizeVariants(undefined)).toEqual([]);
  });
});

// ── Defaults ────────────────────────────────────────────────────────────

describe("pickDefaultSize", () => {
  const variants: SizeVariant[] = [
    { label: "A4", widthCm: 21, heightCm: 29.7, priceGbp: 100 },
    { label: "A3", widthCm: 29.7, heightCm: 42, priceGbp: 200 },
    { label: "A2", widthCm: 42, heightCm: 59.4, priceGbp: 400 },
  ];

  it("prefers the LARGEST variant when pricing[] is present (even if natural also parses)", () => {
    const r = pickDefaultSize({ dimensions: "70 x 50 cm", variants });
    expect(r!.widthCm).toBe(42);
    expect(r!.heightCm).toBe(59.4);
    expect(r!.sizeLabel).toBe("A2");
  });

  it("falls back to natural dimensions when no variants are listed", () => {
    const r = pickDefaultSize({ dimensions: "70 x 50 cm", variants: [] });
    expect(r!.widthCm).toBe(70);
    expect(r!.heightCm).toBe(50);
  });

  it("falls back to natural when variants is empty + dimensions parses", () => {
    const r = pickDefaultSize({ dimensions: "A3", variants: [] });
    expect(r!.widthCm).toBe(29.7);
    expect(r!.heightCm).toBe(42);
  });

  it("returns null when nothing can be parsed", () => {
    expect(
      pickDefaultSize({ dimensions: null, variants: [] }),
    ).toBeNull();
    expect(
      pickDefaultSize({ dimensions: "Medium", variants: [] }),
    ).toBeNull();
  });
});

// ── Cycling ─────────────────────────────────────────────────────────────

describe("cycleSize", () => {
  const variants: SizeVariant[] = [
    { label: "A2", widthCm: 42, heightCm: 59.4 },
    { label: "A4", widthCm: 21, heightCm: 29.7 }, // out of order on input
    { label: "A3", widthCm: 29.7, heightCm: 42 },
  ];

  it("forward from A4 → A3 (sorted by area)", () => {
    expect(cycleSize(variants, "A4", 1)?.label).toBe("A3");
  });

  it("forward from A3 → A2", () => {
    expect(cycleSize(variants, "A3", 1)?.label).toBe("A2");
  });

  it("forward from largest wraps to smallest", () => {
    expect(cycleSize(variants, "A2", 1)?.label).toBe("A4");
  });

  it("backward from smallest wraps to largest", () => {
    expect(cycleSize(variants, "A4", -1)?.label).toBe("A2");
  });

  it("unknown current label returns the smallest going forward", () => {
    expect(cycleSize(variants, "Custom", 1)?.label).toBe("A4");
  });

  it("empty variants returns null", () => {
    expect(cycleSize([], "A4", 1)).toBeNull();
  });
});
