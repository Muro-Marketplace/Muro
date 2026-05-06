import { describe, expect, it } from "vitest";
import { slugify } from "./slugify";

describe("slugify()", () => {
  it.each([
    ["Simple Title", "simple-title"],
    ["Multiple   Spaces", "multiple-spaces"],
    ["Trim - hyphens -", "trim-hyphens"],
    ["UPPERCASE", "uppercase"],
    ["", ""],
    ["a-b-c", "a-b-c"],
  ])("%p -> %p", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("strips accents", () => {
    expect(slugify("Café Crème")).toBe("cafe-creme");
    expect(slugify("Søren Kjær")).toBe("soren-kjaer");
    expect(slugify("naïve")).toBe("naive");
  });

  it("drops emoji", () => {
    expect(slugify("Hello 🌍 World")).toBe("hello-world");
  });

  it("collapses runs of punctuation", () => {
    expect(slugify("Hello — World!!!")).toBe("hello-world");
    expect(slugify("Mr. & Mrs. Smith")).toBe("mr-mrs-smith");
  });

  it("returns empty string for input with no alphanumerics", () => {
    expect(slugify("🌍🌍🌍")).toBe("");
    expect(slugify("---")).toBe("");
    expect(slugify("   ")).toBe("");
  });

  it("preserves digits", () => {
    expect(slugify("Volume 2: The Sequel")).toBe("volume-2-the-sequel");
  });
});
