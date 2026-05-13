import { describe, expect, it } from "vitest";
import { normalisePriceBand } from "./normalise-price-band";

describe("normalisePriceBand()", () => {
  it.each([
    // Already-prefixed values pass through unchanged. This was the
    // regression case (#1): "From £29.99" was being rewritten to
    // "From £29.£99" because the regex matched the dot as a valid
    // non-£ prefix to the "99" fractional digits.
    ["From £29.99", "From £29.99"],
    ["£29.99", "£29.99"],
    ["£180 to £320", "£180 to £320"],

    // Bare numbers get prefixed.
    ["29.99", "£29.99"],
    ["From 150", "From £150"],
    ["180 - 320", "£180 - £320"],
    ["29.99 to 99.99", "£29.99 to £99.99"],

    // Empty / nullish.
    ["", ""],
    [null, ""],
    [undefined, ""],
  ])("%p -> %p", (input, expected) => {
    expect(normalisePriceBand(input)).toBe(expected);
  });
});
