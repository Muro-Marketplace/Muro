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

// Row 727 / PASS2-placement-lifecycle-log. The pixel string reached further
// than the basket: the Stripe hosted page, orders.items[].size, the subject
// lines of two customer-facing emails, and the offer card in the message
// thread. Every one of those reads a size that some call site built from
// `artist_works.dimensions`, so the guard has to be applied at each of them,
// and this pins the shape they all rely on.
describe("the shapes production actually holds", () => {
  it("refuses every pixel string seen in the live table", () => {
    for (const raw of ["2795 × 4192 px", "4160 × 6240 px", "5141 × 3427 px", "1200x800 px"]) {
      expect(isPixelDimensions(raw), raw).toBe(true);
      expect(physicalSizeLabel(raw, ""), raw).toBe("");
    }
  });

  it("keeps a real physical size", () => {
    for (const raw of ["A2", "60 × 80 cm", 'Large (24" × 36")']) {
      expect(physicalSizeLabel(raw, ""), raw).toBe(raw);
    }
  });

  it("returns the caller's fallback rather than an empty label", () => {
    expect(physicalSizeLabel("2795 × 4192 px")).toBe("Original");
    expect(physicalSizeLabel(null, "")).toBe("");
  });
});
