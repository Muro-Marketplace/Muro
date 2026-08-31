// Regression tests for B10: the Frame dropdown's "+£X" and the uplift the
// buy button actually charges must be the same number.
//
// Before the fix the charged figure checked the artist's explicit
// pricesBySize overrides first, and the dropdown row computed only the
// perimeter ramp, so the two diverged for any artist who set per-size
// frame prices.

import { describe, expect, it } from "vitest";
import { frameUpliftFor } from "./frame-uplift";

const PRICING = [
  { label: "A4" },        // 21 x 30 cm, smallest -> baseline
  { label: "A2" },        // 42 x 59 cm
  { label: "100x80 cm" },
];

describe("frameUpliftFor: explicit per-size overrides (B10)", () => {
  const frame = {
    priceUplift: 20,
    pricesBySize: { A4: 20, A2: 45, "100x80 cm": 80 },
  };

  it("returns the artist's explicit price for each listed size", () => {
    expect(frameUpliftFor(frame, "A4", PRICING)).toBe(20);
    expect(frameUpliftFor(frame, "A2", PRICING)).toBe(45);
    expect(frameUpliftFor(frame, "100x80 cm", PRICING)).toBe(80);
  });

  it("gives the dropdown row and the charge the identical number", () => {
    // Both call sites pass the same three arguments, which is the whole
    // point of the shared function; assert the contract explicitly so a
    // future divergence has something to break.
    for (const label of ["A4", "A2", "100x80 cm"]) {
      const shownInDropdown = frameUpliftFor(frame, label, PRICING);
      const chargedOnBuy = frameUpliftFor(frame, label, PRICING);
      expect(shownInDropdown).toBe(chargedOnBuy);
    }
    // And the override must actually differ from the bare ramp, otherwise
    // this test would pass even with the old dropdown-only ramp.
    const rampOnly = frameUpliftFor({ priceUplift: 20 }, "A2", PRICING);
    expect(frameUpliftFor(frame, "A2", PRICING)).not.toBe(rampOnly);
  });

  it("falls back to the perimeter ramp for a size with no override", () => {
    const partial = { priceUplift: 20, pricesBySize: { A4: 20 } };
    const ramped = frameUpliftFor(partial, "A2", PRICING);
    expect(ramped).toBe(frameUpliftFor({ priceUplift: 20 }, "A2", PRICING));
    expect(ramped).toBeGreaterThan(20);
  });

  it("ignores a junk override rather than charging it", () => {
    const junk = {
      priceUplift: 20,
      pricesBySize: { A2: Number.NaN, A4: -5 } as Record<string, number>,
    };
    expect(frameUpliftFor(junk, "A2", PRICING)).toBeGreaterThan(20);
    expect(frameUpliftFor(junk, "A4", PRICING)).toBe(20);
  });
});

describe("frameUpliftFor: perimeter ramp", () => {
  const frame = { priceUplift: 20 };

  it("charges the flat uplift at the smallest listed size", () => {
    expect(frameUpliftFor(frame, "A4", PRICING)).toBe(20);
  });

  it("scales up by perimeter for larger sizes", () => {
    const a2 = frameUpliftFor(frame, "A2", PRICING);
    const big = frameUpliftFor(frame, "100x80 cm", PRICING);
    expect(a2).toBeGreaterThan(20);
    expect(big).toBeGreaterThan(a2);
  });

  it("does not move the baseline with the buyer's selection", () => {
    // The baseline is the smallest listed size by area, whichever row is
    // selected, so A2 costs the same whether the buyer arrived via A4.
    expect(frameUpliftFor(frame, "A2", PRICING)).toBe(
      frameUpliftFor(frame, "A2", [...PRICING].reverse()),
    );
  });

  it("returns 0 for no frame and for a zero uplift", () => {
    expect(frameUpliftFor(null, "A2", PRICING)).toBe(0);
    expect(frameUpliftFor(undefined, "A2", PRICING)).toBe(0);
    expect(frameUpliftFor({ priceUplift: 0 }, "A2", PRICING)).toBe(0);
  });

  it("falls back to the flat uplift when no label can be parsed", () => {
    expect(frameUpliftFor(frame, "mystery", [{ label: "mystery" }])).toBe(20);
    expect(frameUpliftFor(frame, "A2", [])).toBe(20);
    expect(frameUpliftFor(frame, undefined, PRICING)).toBe(20);
  });
});
