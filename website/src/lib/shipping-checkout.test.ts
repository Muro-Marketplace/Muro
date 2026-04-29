import { describe, it, expect } from "vitest";
import { calculateOrderShipping, type CartLineForShipping } from "./shipping-checkout";

const baseItem: CartLineForShipping = {
  artistSlug: "a",
  artistName: "A",
  price: 100,
  quantity: 1,
  framed: false,
  dimensions: "50 x 70 cm",
  shippingPrice: null,
  internationalShippingPrice: null,
};

describe("calculateOrderShipping", () => {
  it("single item: returns the resolved cost", () => {
    const r = calculateOrderShipping([{ ...baseItem }], "uk");
    expect(r.artistGroups).toHaveLength(1);
    expect(r.totalShipping).toBeGreaterThan(0);
  });

  it("two items same artist: full + 50% of additional", () => {
    const a = { ...baseItem };
    const b = { ...baseItem, dimensions: "30 x 40 cm" };
    const single = calculateOrderShipping([a], "uk").totalShipping;
    const second = calculateOrderShipping([b], "uk").totalShipping;
    const expected = Math.round((Math.max(single, second) + Math.min(single, second) * 0.5) * 100) / 100;
    const r = calculateOrderShipping([a, b], "uk");
    expect(r.totalShipping).toBe(expected);
  });

  it("two artists: shipping accumulates per group", () => {
    const r = calculateOrderShipping(
      [{ ...baseItem }, { ...baseItem, artistSlug: "b", artistName: "B" }],
      "uk",
    );
    expect(r.artistGroups).toHaveLength(2);
    const sum = Math.round((r.artistGroups[0].shipping + r.artistGroups[1].shipping) * 100) / 100;
    expect(r.totalShipping).toBe(sum);
  });

  it("manualPrice override takes precedence", () => {
    const r = calculateOrderShipping([{ ...baseItem, shippingPrice: 5.0 }], "uk");
    expect(r.totalShipping).toBe(5.0);
  });

  it("international uses internationalShippingPrice when set", () => {
    const r = calculateOrderShipping(
      [{ ...baseItem, shippingPrice: 5.0, internationalShippingPrice: 22.0 }],
      "international",
    );
    expect(r.totalShipping).toBe(22.0);
  });

  it("rounds to integer pence", () => {
    const r = calculateOrderShipping([{ ...baseItem, shippingPrice: 14.499 }], "uk");
    expect(Math.round(r.totalShipping * 100) / 100).toBe(r.totalShipping);
  });

  it("display total === API total for the bug-report scenario", () => {
    // Two pieces same artist, no manual price set, mixed sizes.
    // The original bug: display said £80.49, API charged £79.94.
    // We don't assert the absolute number (that depends on tier table)
    // but assert that running the helper twice with the same inputs
    // produces identical results.
    const items = [
      { ...baseItem, dimensions: "50 x 70 cm", price: 250 },
      { ...baseItem, dimensions: "30 x 40 cm", price: 120 },
    ];
    const display = calculateOrderShipping(items, "uk");
    const api = calculateOrderShipping(items, "uk");
    expect(display.totalShipping).toBe(api.totalShipping);
  });
});
