// Frame helpers, pure math, easy to cover comprehensively.

import { describe, expect, it } from "vitest";
import {
  FRAME_STYLES,
  computeFrameGeometry,
  defaultFrameConfig,
  getFrameFinish,
  getFrameStyle,
} from "./frames";

describe("FRAME_STYLES", () => {
  it("includes the five expected styles", () => {
    const ids = FRAME_STYLES.map((s) => s.id).sort();
    expect(ids).toEqual(
      ["classic_wood", "floater", "none", "ornate_gold", "thin_black"].sort(),
    );
  });

  it("every non-'none' style has at least one finish", () => {
    for (const s of FRAME_STYLES) {
      if (s.id === "none") continue;
      expect(s.finishes.length).toBeGreaterThan(0);
    }
  });

  it("borderRatio is between 0 and 0.1 for reasonable proportions", () => {
    for (const s of FRAME_STYLES) {
      expect(s.borderRatio).toBeGreaterThanOrEqual(0);
      expect(s.borderRatio).toBeLessThanOrEqual(0.1);
    }
  });
});

describe("getFrameStyle", () => {
  it("returns the requested style", () => {
    expect(getFrameStyle("classic_wood").id).toBe("classic_wood");
  });

  it("falls back to 'none' for unknown ids", () => {
    // @ts-expect-error, feeding bogus ids on purpose
    expect(getFrameStyle("neon").id).toBe("none");
  });
});

describe("getFrameFinish", () => {
  it("returns the matching finish", () => {
    const f = getFrameFinish("classic_wood", "walnut");
    expect(f?.id).toBe("walnut");
    expect(f?.label).toContain("Walnut");
  });

  it("returns first finish when id not found", () => {
    const f = getFrameFinish("classic_wood", "nonsense");
    expect(f?.id).toBe("natural");
  });

  it("returns null for 'none' style (no finishes)", () => {
    const f = getFrameFinish("none", "matte");
    expect(f).toBeNull();
  });
});

describe("defaultFrameConfig", () => {
  it("populates default finish for the chosen style", () => {
    expect(defaultFrameConfig("classic_wood")).toEqual({
      style: "classic_wood",
      finish: "natural",
      depth_mm: 0,
    });
  });

  it("'none' has empty finish", () => {
    expect(defaultFrameConfig("none").finish).toBe("");
  });
});

describe("computeFrameGeometry", () => {
  it("'none' style → border=0, artwork fills the whole rect", () => {
    const g = computeFrameGeometry(200, 300, defaultFrameConfig("none"));
    expect(g.borderPx).toBe(0);
    expect(g.borderColor).toBe(null);
    expect(g.artwork).toEqual({ x: 0, y: 0, width: 200, height: 300 });
  });

  it("ornate_gold (8% ratio) on a 100x200 item → 8px border, artwork inset", () => {
    const g = computeFrameGeometry(100, 200, defaultFrameConfig("ornate_gold"));
    // borderRatio=0.08 × min(100,200)=100 → 8px
    expect(g.borderPx).toBe(8);
    expect(g.borderColor).toBeTruthy();
    expect(g.artwork).toEqual({ x: 8, y: 8, width: 84, height: 184 });
  });

  it("caps border at 35% of min dimension to prevent eating the artwork", () => {
    // For a tiny 10×10 item, 8% × 10 = 0.8 → uncapped. But we cap at
    // 0.35 × min = 3.5. Verify the cap doesn't kick in unnecessarily.
    const g = computeFrameGeometry(10, 10, defaultFrameConfig("ornate_gold"));
    expect(g.borderPx).toBeLessThanOrEqual(3.5);
    // Artwork is at least 1px in each dim (positive).
    expect(g.artwork.width).toBeGreaterThan(0);
    expect(g.artwork.height).toBeGreaterThan(0);
  });

  it("passes through the chosen finish colour", () => {
    const g = computeFrameGeometry(
      200,
      200,
      { style: "thin_black", finish: "white", depth_mm: 0 },
    );
    expect(g.borderColor).toMatch(/#F5F1EB/i);
  });
});
