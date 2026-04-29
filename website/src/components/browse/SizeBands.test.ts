import { describe, it, expect } from "vitest";
import { SIZE_BANDS, bandForCm } from "./SizeBands";

describe("SIZE_BANDS", () => {
  it("has four bands in canonical order", () => {
    expect(SIZE_BANDS.map((b) => b.key)).toEqual(["small", "medium", "large", "xl"]);
  });

  it("uses en dash, not em dash, in dimension hints", () => {
    for (const b of SIZE_BANDS) {
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
