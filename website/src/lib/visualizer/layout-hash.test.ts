// Layout hash, used as the render cache key. Properties under test:
//   - identical inputs → identical hash
//   - reordered items → identical hash (sort by id)
//   - tiny float jitter < 0.001cm → identical hash (rounding)
//   - genuine change → different hash
//   - hex case-insensitivity for wall colour
//   - preset vs uploaded background → different hash

import { describe, expect, it } from "vitest";
import { computeLayoutHash, _canonicaliseForTests } from "./layout-hash";
import type { LayoutBackground, WallItem } from "./types";

const baseFrame = { style: "thin_black" as const, finish: "matte", depth_mm: 0 };

const itemA: WallItem = {
  id: "a",
  work_id: "w-1",
  x_cm: 10,
  y_cm: 20,
  width_cm: 60,
  height_cm: 80,
  rotation_deg: 0,
  z_index: 0,
  frame: baseFrame,
};

const itemB: WallItem = {
  id: "b",
  work_id: "w-2",
  x_cm: 100,
  y_cm: 50,
  width_cm: 40,
  height_cm: 30,
  rotation_deg: 5,
  z_index: 1,
  frame: { ...baseFrame, style: "ornate_gold", finish: "antique" },
};

const presetBg: LayoutBackground = {
  kind: "preset",
  preset_id: "minimal_white",
  color_hex: "F5F1EB",
};

describe("computeLayoutHash, determinism", () => {
  it("returns the same hash for the same input", () => {
    const a = computeLayoutHash({
      items: [itemA, itemB],
      background: presetBg,
      width_cm: 300,
      height_cm: 240,
    });
    const b = computeLayoutHash({
      items: [itemA, itemB],
      background: presetBg,
      width_cm: 300,
      height_cm: 240,
    });
    expect(a).toBe(b);
  });

  it("ignores item order", () => {
    const a = computeLayoutHash({
      items: [itemA, itemB],
      background: presetBg,
      width_cm: 300,
      height_cm: 240,
    });
    const b = computeLayoutHash({
      items: [itemB, itemA],
      background: presetBg,
      width_cm: 300,
      height_cm: 240,
    });
    expect(a).toBe(b);
  });

  it("absorbs sub-millicm float wobble", () => {
    const wobbly: WallItem = { ...itemA, x_cm: 10.0000003 };
    const a = computeLayoutHash({
      items: [itemA],
      background: presetBg,
      width_cm: 300,
      height_cm: 240,
    });
    const b = computeLayoutHash({
      items: [wobbly],
      background: presetBg,
      width_cm: 300,
      height_cm: 240,
    });
    expect(a).toBe(b);
  });

  it("treats wall_color_hex as case-insensitive", () => {
    const a = computeLayoutHash({
      items: [],
      background: { ...presetBg, color_hex: "F5F1EB" },
      width_cm: 300,
      height_cm: 240,
    });
    const b = computeLayoutHash({
      items: [],
      background: { ...presetBg, color_hex: "f5f1eb" },
      width_cm: 300,
      height_cm: 240,
    });
    expect(a).toBe(b);
  });
});

describe("computeLayoutHash, sensitivity", () => {
  it("changes when an item moves >0.001cm", () => {
    const a = computeLayoutHash({
      items: [itemA],
      background: presetBg,
      width_cm: 300,
      height_cm: 240,
    });
    const b = computeLayoutHash({
      items: [{ ...itemA, x_cm: itemA.x_cm + 1 }],
      background: presetBg,
      width_cm: 300,
      height_cm: 240,
    });
    expect(a).not.toBe(b);
  });

  it("changes when an item's frame changes", () => {
    const a = computeLayoutHash({
      items: [itemA],
      background: presetBg,
      width_cm: 300,
      height_cm: 240,
    });
    const b = computeLayoutHash({
      items: [{ ...itemA, frame: { ...itemA.frame, style: "ornate_gold" } }],
      background: presetBg,
      width_cm: 300,
      height_cm: 240,
    });
    expect(a).not.toBe(b);
  });

  it("changes when wall colour changes", () => {
    const a = computeLayoutHash({
      items: [itemA],
      background: presetBg,
      width_cm: 300,
      height_cm: 240,
    });
    const b = computeLayoutHash({
      items: [itemA],
      background: { ...presetBg, color_hex: "FFFFFF" },
      width_cm: 300,
      height_cm: 240,
    });
    expect(a).not.toBe(b);
  });

  it("preset and uploaded backgrounds hash differently", () => {
    const a = computeLayoutHash({
      items: [itemA],
      background: presetBg,
      width_cm: 300,
      height_cm: 240,
    });
    const b = computeLayoutHash({
      items: [itemA],
      background: { kind: "uploaded", image_path: "uploads/x.jpg" },
      width_cm: 300,
      height_cm: 240,
    });
    expect(a).not.toBe(b);
  });

  it("changes when wall dimensions change", () => {
    const a = computeLayoutHash({
      items: [itemA],
      background: presetBg,
      width_cm: 300,
      height_cm: 240,
    });
    const b = computeLayoutHash({
      items: [itemA],
      background: presetBg,
      width_cm: 320,
      height_cm: 240,
    });
    expect(a).not.toBe(b);
  });
});

describe("computeLayoutHash, output shape", () => {
  it("returns a 64-char hex string (sha256)", () => {
    const h = computeLayoutHash({
      items: [],
      background: presetBg,
      width_cm: 300,
      height_cm: 240,
    });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("canonicalise, sanity", () => {
  it("sorts items by id", () => {
    const out = _canonicaliseForTests({
      items: [itemB, itemA],
      background: presetBg,
      width_cm: 300,
      height_cm: 240,
    });
    // Items in canonical form should appear with "id":"a" before "id":"b".
    const aIdx = out.indexOf('"id":"a"');
    const bIdx = out.indexOf('"id":"b"');
    expect(aIdx).toBeGreaterThan(-1);
    expect(bIdx).toBeGreaterThan(aIdx);
  });
});
