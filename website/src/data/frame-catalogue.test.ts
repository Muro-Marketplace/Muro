import { describe, expect, it } from "vitest";
import {
  STANDARD_FRAMES,
  getStandardFrame,
  frameSwatchDataUri,
  SWATCH_WALL_COLOUR,
} from "./frame-catalogue";

const DATA_URI_PREFIX = "data:image/svg+xml;utf8,";

function decode(dataUri: string): string {
  expect(dataUri.startsWith(DATA_URI_PREFIX)).toBe(true);
  return decodeURIComponent(dataUri.slice(DATA_URI_PREFIX.length));
}

describe("STANDARD_FRAMES", () => {
  it("has exactly fifteen entries", () => {
    expect(STANDARD_FRAMES).toHaveLength(15);
  });

  it("has unique ids", () => {
    const ids = STANDARD_FRAMES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique labels", () => {
    const labels = STANDARD_FRAMES.map((f) => f.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("gives every frame a valid 6-digit hex colour", () => {
    for (const f of STANDARD_FRAMES) {
      expect(f.colour).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("gives every wood-finish frame a grain tone, and only wood frames", () => {
    const wood = STANDARD_FRAMES.filter((f) => f.finish === "wood");
    expect(wood.length).toBeGreaterThan(0);
    for (const f of wood) {
      expect(f.grain).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
    for (const f of STANDARD_FRAMES.filter((f) => f.finish !== "wood")) {
      expect(f.grain).toBeUndefined();
    }
  });

  it("includes at least one floating frame", () => {
    expect(STANDARD_FRAMES.some((f) => f.id.startsWith("floating"))).toBe(true);
  });
});

describe("getStandardFrame", () => {
  it("finds a known frame by id", () => {
    expect(getStandardFrame("walnut")?.label).toBe("Walnut");
  });

  it("returns undefined for an unknown id", () => {
    expect(getStandardFrame("not-a-real-frame-id")).toBeUndefined();
  });
});

describe("frameSwatchDataUri", () => {
  it("returns a URL-encoded SVG data URI containing <svg for every frame", () => {
    for (const frame of STANDARD_FRAMES) {
      const uri = frameSwatchDataUri(frame);
      expect(uri.startsWith(DATA_URI_PREFIX)).toBe(true);
      const decoded = decode(uri);
      expect(decoded).toContain("<svg");
      expect(decoded).toContain("</svg>");
    }
  });

  it("is a pure function: the same frame always produces the same data URI", () => {
    const frame = getStandardFrame("silver")!;
    expect(frameSwatchDataUri(frame)).toBe(frameSwatchDataUri({ ...frame }));
  });

  it("uses each frame's own colour in its swatch", () => {
    const oak = getStandardFrame("natural-oak")!;
    expect(decode(frameSwatchDataUri(oak))).toContain(oak.colour);
  });

  it("draws a wood grain stripe in the grain colour for wood finishes", () => {
    for (const wood of STANDARD_FRAMES.filter((f) => f.finish === "wood")) {
      const decoded = decode(frameSwatchDataUri(wood));
      expect(decoded).toContain("<line");
      expect(decoded).toContain(wood.grain!);
    }
  });

  it("does not draw a grain stripe for a non-wood finish", () => {
    for (const frame of STANDARD_FRAMES.filter((f) => f.finish !== "wood")) {
      expect(decode(frameSwatchDataUri(frame))).not.toContain("<line");
    }
  });

  it("draws a highlight for gloss and metal finishes", () => {
    for (const frame of STANDARD_FRAMES.filter((f) => f.finish === "gloss" || f.finish === "metal")) {
      expect(decode(frameSwatchDataUri(frame))).toContain("<polygon");
    }
  });

  it("does not draw a highlight for matte or wood finishes", () => {
    for (const frame of STANDARD_FRAMES.filter((f) => f.finish === "matte" || f.finish === "wood")) {
      expect(decode(frameSwatchDataUri(frame))).not.toContain("<polygon");
    }
  });

  it("draws a visible gap for floating frames: the wall colour appears again behind the moulding", () => {
    const countWall = (svg: string) => svg.split(SWATCH_WALL_COLOUR).length - 1;
    for (const frame of STANDARD_FRAMES.filter((f) => f.id.startsWith("floating"))) {
      expect(countWall(decode(frameSwatchDataUri(frame)))).toBeGreaterThanOrEqual(2);
    }
    for (const frame of STANDARD_FRAMES.filter((f) => !f.id.startsWith("floating"))) {
      expect(countWall(decode(frameSwatchDataUri(frame)))).toBe(1);
    }
  });

  it("draws a shadow behind the canvas for floating frames", () => {
    for (const frame of STANDARD_FRAMES.filter((f) => f.id.startsWith("floating"))) {
      expect(decode(frameSwatchDataUri(frame))).toMatch(/fill="#000000"\s+opacity="0\.18"/);
    }
    for (const frame of STANDARD_FRAMES.filter((f) => !f.id.startsWith("floating"))) {
      expect(decode(frameSwatchDataUri(frame))).not.toMatch(/fill="#000000"/);
    }
  });
});
