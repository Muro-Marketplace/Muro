// E35. A recolour on a saved preset wall was never persisted: autosave sent
// only the dimensions, so the canvas repainted and the change vanished on the
// next reload. These pin the gate that decides what the wall row is sent.

import { describe, it, expect } from "vitest";
import { wallPatchBody, type WallSaveSnapshot } from "./wall-save";

const base: WallSaveSnapshot = { width_cm: 300, height_cm: 240, wall_color_hex: "FFFFFF" };

describe("wallPatchBody", () => {
  it("sends the colour when only the colour changed (E35, the whole bug)", () => {
    const body = wallPatchBody({ ...base, wall_color_hex: "1A1A1A" }, base);
    expect(body).toEqual({ width_cm: 300, height_cm: 240, wall_color_hex: "1A1A1A" });
  });

  it("skips the request entirely when nothing about the wall changed", () => {
    expect(wallPatchBody(base, base)).toBeNull();
  });

  it("treats hex case as noise, so an unchanged colour does not re-PATCH", () => {
    expect(wallPatchBody({ ...base, wall_color_hex: "ffffff" }, base)).toBeNull();
  });

  it("still sends dimensions on their own, without a colour key", () => {
    const body = wallPatchBody({ ...base, width_cm: 420 }, base);
    expect(body).toEqual({ width_cm: 420, height_cm: 240 });
    expect(body).not.toHaveProperty("wall_color_hex");
  });

  it("sends both when both changed", () => {
    const body = wallPatchBody({ width_cm: 420, height_cm: 300, wall_color_hex: "0F0F0F" }, base);
    expect(body).toEqual({ width_cm: 420, height_cm: 300, wall_color_hex: "0F0F0F" });
  });

  it("an uploaded wall (no colour) never sends a colour key", () => {
    const uploaded: WallSaveSnapshot = { width_cm: 300, height_cm: 240, wall_color_hex: null };
    expect(wallPatchBody(uploaded, base)).toBeNull();
    expect(wallPatchBody({ ...uploaded, width_cm: 400 }, base)).toEqual({
      width_cm: 400,
      height_cm: 240,
    });
  });

  it("a wall with no colour recorded yet accepts the first colour", () => {
    const noColour: WallSaveSnapshot = { ...base, wall_color_hex: null };
    expect(wallPatchBody({ ...base, wall_color_hex: "C0FFEE" }, noColour)).toEqual({
      width_cm: 300,
      height_cm: 240,
      wall_color_hex: "C0FFEE",
    });
  });
});
