import { describe, expect, it } from "vitest";
import { formatCurrency, formatPounds } from "./format-currency";

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
