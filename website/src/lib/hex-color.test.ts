import { describe, expect, it } from "vitest";
import { isValidHex, safeHexBackground } from "./hex-color";

describe("isValidHex()", () => {
  it.each(["F5F1EB", "abcdef", "ABC", "abc", "0a0a0a", "FFFFFF"])(
    "accepts %s",
    (h) => {
      expect(isValidHex(h)).toBe(true);
    },
  );

  it.each([
    "#F5F1EB",
    "F5F1E",
    "F5F1EBAA",
    "ZZZZZZ",
    "",
    "  ",
    "rgb(0,0,0)",
    null,
    undefined,
    42,
  ])("rejects %p", (h) => {
    expect(isValidHex(h)).toBe(false);
  });
});

describe("safeHexBackground()", () => {
  it("returns # + value for a valid 6-char hex", () => {
    expect(safeHexBackground("F5F1EB", "#999")).toBe("#F5F1EB");
  });

  it("returns # + value for a valid 3-char hex", () => {
    expect(safeHexBackground("abc", "#999")).toBe("#abc");
  });

  it("returns the fallback for invalid inputs", () => {
    expect(safeHexBackground("ZZZZZZ", "#999")).toBe("#999");
    expect(safeHexBackground(null, "#999")).toBe("#999");
    expect(safeHexBackground(undefined, "#E5E1DA")).toBe("#E5E1DA");
    expect(safeHexBackground("", "#fff")).toBe("#fff");
  });

  it("rejects values with a leading # to avoid '##abcdef'", () => {
    expect(safeHexBackground("#F5F1EB", "#999")).toBe("#999");
  });
});
