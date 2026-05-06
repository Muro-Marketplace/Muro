import { describe, expect, it } from "vitest";
import { formatPounds } from "./format-currency";

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
