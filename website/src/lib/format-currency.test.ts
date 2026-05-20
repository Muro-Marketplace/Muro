import { describe, expect, it } from "vitest";
import { formatCurrency, formatPounds, formatPriceRange } from "./format-currency";

describe("formatPounds()", () => {
  it.each([
    [0, "£0.00"],
    [1, "£1.00"],
    [1.5, "£1.50"],
    [1234.56, "£1,234.56"],
    [-12.5, "-£12.50"],
  ])("formats %p as %p", (input, expected) => {
    expect(formatPounds(input)).toBe(expected);
  });

  it("returns £0.00 for nullish input", () => {
    expect(formatPounds(null)).toBe("£0.00");
    expect(formatPounds(undefined)).toBe("£0.00");
  });

  it("returns £0.00 for non-finite numbers", () => {
    expect(formatPounds(NaN)).toBe("£0.00");
    expect(formatPounds(Infinity)).toBe("£0.00");
    expect(formatPounds(-Infinity)).toBe("£0.00");
  });

  it("returns £0.00 for non-numeric input", () => {
    expect(formatPounds("garbage")).toBe("£0.00");
    expect(formatPounds({})).toBe("£0.00");
    expect(formatPounds([])).toBe("£0.00");
  });

  it("rounds to 2dp", () => {
    expect(formatPounds(1.999)).toBe("£2.00");
    expect(formatPounds(1.001)).toBe("£1.00");
  });
});

describe("formatCurrency()", () => {
  it("delegates to formatPounds for GBP / missing currency", () => {
    expect(formatCurrency(12.5, "GBP")).toBe("£12.50");
    expect(formatCurrency(12.5, "gbp")).toBe("£12.50");
    expect(formatCurrency(12.5, undefined)).toBe("£12.50");
    expect(formatCurrency(12.5, null)).toBe("£12.50");
    expect(formatCurrency(12.5, "")).toBe("£12.50");
  });

  it("formats USD with $ symbol", () => {
    expect(formatCurrency(12.5, "USD")).toMatch(/\$12\.50/);
  });

  it("formats EUR with € symbol", () => {
    expect(formatCurrency(12.5, "EUR")).toMatch(/€12\.50/);
  });

  it("falls back to GBP for non-ISO-4217 inputs", () => {
    expect(formatCurrency(12.5, "12")).toBe("£12.50");
    expect(formatCurrency(12.5, "TWO")).toMatch(/12\.50/);
    expect(formatCurrency(12.5, "")).toBe("£12.50");
  });

  it("doesn't throw on unrecognised but well-formed codes", () => {
    // Intl renders "ZZZ" as a literal label — that's acceptable; the
    // important thing is we don't throw mid-render.
    expect(() => formatCurrency(12.5, "ZZZ")).not.toThrow();
  });

  it("returns £0.00 for non-numeric amounts regardless of currency", () => {
    expect(formatCurrency(null, "USD")).toBe("£0.00");
    expect(formatCurrency(NaN, "EUR")).toBe("£0.00");
  });
});

describe("formatPriceRange()", () => {
  it("formats min and max as a 'to' range when different", () => {
    expect(
      formatPriceRange([{ price: 120 }, { price: 240 }]),
    ).toBe("£120 to £240");
  });

  it("orders by value, not array position", () => {
    expect(
      formatPriceRange([{ price: 500 }, { price: 200 }, { price: 350 }]),
    ).toBe("£200 to £500");
  });

  it("collapses to a single price when min equals max", () => {
    expect(
      formatPriceRange([{ price: 180 }, { price: 180 }]),
    ).toBe("£180");
  });

  it("collapses to a single price for one-tier pricing", () => {
    expect(formatPriceRange([{ price: 99 }])).toBe("£99");
  });

  it("rounds prices to whole pounds", () => {
    expect(
      formatPriceRange([{ price: 199.5 }, { price: 349.49 }]),
    ).toBe("£200 to £349");
  });

  it("skips zero and negative prices", () => {
    expect(
      formatPriceRange([{ price: 0 }, { price: 120 }, { price: -50 }, { price: 200 }]),
    ).toBe("£120 to £200");
  });

  it("returns empty string when no valid prices are present", () => {
    expect(formatPriceRange([])).toBe("");
    expect(formatPriceRange(null)).toBe("");
    expect(formatPriceRange(undefined)).toBe("");
    expect(formatPriceRange([{ price: 0 }, { price: -5 }])).toBe("");
  });

  it("ignores non-numeric prices", () => {
    expect(
      // @ts-expect-error - deliberately passing garbage to confirm safety
      formatPriceRange([{ price: "garbage" }, { price: 120 }, { price: 200 }]),
    ).toBe("£120 to £200");
  });
});
