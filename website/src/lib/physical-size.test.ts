import { describe, expect, it } from "vitest";
import { isPixelDimensions, physicalSizeLabel } from "./physical-size";

describe("isPixelDimensions", () => {
  it("recognises the live shapes stored on artist_works.dimensions", () => {
    // Straight from production.
    expect(isPixelDimensions("2795 × 4192 px")).toBe(true);
    expect(isPixelDimensions("4160 × 6240 px")).toBe(true);
    expect(isPixelDimensions("812 × 812 px")).toBe(true);
    expect(isPixelDimensions("5141 x 3427 px")).toBe(true);
  });

  it("does not mistake a real physical size for pixels", () => {
    expect(isPixelDimensions("A3")).toBe(false);
    expect(isPixelDimensions("60×90cm")).toBe(false);
    expect(isPixelDimensions('12×8" (30×20 cm)')).toBe(false);
    expect(isPixelDimensions("Large")).toBe(false);
    expect(isPixelDimensions("")).toBe(false);
    expect(isPixelDimensions(null)).toBe(false);
  });
});

describe("physicalSizeLabel", () => {
  it("refuses a pixel measurement rather than showing it to a buyer", () => {
    // The reported basket line.
    expect(physicalSizeLabel("2795 × 4192 px")).toBe("Original");
  });

  it("passes a real size through untouched", () => {
    expect(physicalSizeLabel("60×90cm")).toBe("60×90cm");
    expect(physicalSizeLabel("A2")).toBe("A2");
  });

  it("uses the caller's fallback when there is one", () => {
    expect(physicalSizeLabel("4160 × 6240 px", "One-off piece")).toBe("One-off piece");
    expect(physicalSizeLabel(null, "One-off piece")).toBe("One-off piece");
  });
});
