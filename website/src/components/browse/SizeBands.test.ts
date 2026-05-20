import { describe, it, expect } from "vitest";
import { SIZE_BANDS, bandForCm, bandsForWork } from "./SizeBands";

describe("SIZE_BANDS", () => {
  it("has four bands in canonical order", () => {
    expect(SIZE_BANDS.map((b) => b.key)).toEqual(["small", "medium", "large", "xl"]);
  });

  it("avoids em and en dashes in dimension hints", () => {
    // Public-copy style rule: ranges read as plain English ("30 to 60 cm")
    // instead of dashed glyphs. Guards against accidental autocorrect.
    for (const b of SIZE_BANDS) {
      expect(b.dimensionHint).not.toContain("—");
      expect(b.dimensionHint).not.toContain("–");
    }
  });

  it("ranges meet at boundaries without gaps or overlaps", () => {
    for (let i = 0; i < SIZE_BANDS.length - 1; i++) {
      expect(SIZE_BANDS[i].maxCm).toBe(SIZE_BANDS[i + 1].minCm);
    }
  });
});

describe("bandForCm", () => {
  it.each([
    [10, "small"],
    [30, "small"],
    [31, "medium"],
    [60, "medium"],
    [61, "large"],
    [100, "large"],
    [101, "xl"],
    [200, "xl"],
  ])("%scm → %s", (cm, expected) => {
    expect(bandForCm(cm as number)).toBe(expected);
  });
});

describe("bandsForWork", () => {
  it("returns all bands a work spans across pricing tiers", () => {
    const bands = bandsForWork({
      dimensions: "",
      pricing: [
        { label: "A4" },
        { label: "A2" },
        { label: "50 × 70 cm" },
        { label: "100 × 140 cm" },
      ],
    });
    expect(bands).toEqual(new Set(["small", "medium", "large", "xl"]));
  });

  it("uses work-level dimensions when no pricing labels parse", () => {
    const bands = bandsForWork({ dimensions: "20 x 25 cm", pricing: [] });
    expect(bands).toEqual(new Set(["small"]));
  });

  it("includes the artist-selected collection size", () => {
    // Collection works decorate the work shape with `selectedSize`
    // (the size the artist chose for the bundle). Filtering must
    // honour that label, otherwise a collection where dimensions are
    // empty disappears from every band filter.
    const bands = bandsForWork({
      dimensions: "",
      selectedSize: "A4",
      pricing: [],
    });
    expect(bands).toEqual(new Set(["small"]));
  });

  it("falls back to medium when nothing parses", () => {
    const bands = bandsForWork({ dimensions: "freeform-text", pricing: [] });
    expect(bands).toEqual(new Set(["medium"]));
  });

  it("merges work-level dimensions, selectedSize and pricing", () => {
    const bands = bandsForWork({
      dimensions: "30 × 30 cm",
      selectedSize: "A2",
      pricing: [{ label: "100 × 120 cm" }],
    });
    // 30cm → small, A2 (42×59) → medium, 120cm → xl
    expect(bands).toEqual(new Set(["small", "medium", "xl"]));
  });
});
