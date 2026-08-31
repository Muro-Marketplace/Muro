import { describe, expect, it } from "vitest";
import {
  resolveLineShipping,
  resolveWorkShippingPrice,
} from "./checkout-shipping-source";

const WORK = {
  shipping_price: 9.95,
  dimensions: "40x60cm",
  pricing: [
    { label: "A4", price: 80, shippingPrice: 6 },
    { label: "A3", price: 140, shippingPrice: 10 },
    { label: "A2", price: 200 },
  ],
};

describe("resolveWorkShippingPrice", () => {
  it("prefers the selected size's own shipping price", () => {
    expect(resolveWorkShippingPrice(WORK, "A4")).toBe(6);
    expect(resolveWorkShippingPrice(WORK, "A3")).toBe(10);
  });

  it("falls back to the work-level price when the size carries none", () => {
    expect(resolveWorkShippingPrice(WORK, "A2")).toBe(9.95);
  });

  it("falls back to the work-level price for an unknown size label", () => {
    expect(resolveWorkShippingPrice(WORK, "A0")).toBe(9.95);
    expect(resolveWorkShippingPrice(WORK, null)).toBe(9.95);
  });

  it("matches the label the way the route matches the price tier", () => {
    // Whitespace and case insensitive, so a size cannot price from one tier
    // and take its shipping from another.
    expect(resolveWorkShippingPrice(WORK, "  A4  ")).toBe(6);
    expect(resolveWorkShippingPrice(WORK, "a4")).toBe(6);
  });

  it("returns null when the artist has set no manual price", () => {
    // Null is a real answer: the caller estimates from dimensions. Returning
    // 0 here would be the exploit, reintroduced from the other side.
    expect(resolveWorkShippingPrice({ pricing: [] }, "A4")).toBeNull();
    expect(resolveWorkShippingPrice({ shipping_price: null }, "A4")).toBeNull();
    expect(resolveWorkShippingPrice(null, "A4")).toBeNull();
  });

  it("keeps a genuine free-shipping zero from the database", () => {
    expect(resolveWorkShippingPrice({ shipping_price: 0 }, null)).toBe(0);
    expect(
      resolveWorkShippingPrice({ shipping_price: 9.95, pricing: [{ label: "A4", shippingPrice: 0 }] }, "A4"),
    ).toBe(0);
  });

  it("ignores negative or non-numeric junk", () => {
    expect(resolveWorkShippingPrice({ shipping_price: -5 }, null)).toBeNull();
    expect(resolveWorkShippingPrice({ shipping_price: "free" as never }, null)).toBeNull();
  });
});

describe("resolveLineShipping", () => {
  const FORGED = { shippingPrice: 0, internationalShippingPrice: 0, dimensions: "1x1cm" };

  // A live cart posted with shippingPrice: 0 minted a £49.99 session against
  // an honest £53.49. The resolver must ignore the body entirely when a
  // database row exists.
  it("ignores a forged zero when the work row is known", () => {
    const out = resolveLineShipping({
      work: WORK,
      artist: { international_shipping_price: 24 },
      sizeLabel: "A4",
      fallback: FORGED,
    });
    expect(out).toEqual({
      shippingPrice: 6,
      internationalShippingPrice: 24,
      dimensions: "40x60cm",
    });
  });

  it("ignores forged dimensions when the work row is known", () => {
    // Shrinking the artwork shrinks the dimensional estimate, which is the
    // same exploit by another field.
    const out = resolveLineShipping({
      work: { dimensions: "150x200cm" },
      artist: null,
      sizeLabel: null,
      fallback: FORGED,
    });
    expect(out.dimensions).toBe("150x200cm");
    expect(out.shippingPrice).toBeNull();
  });

  it("does not let a forged international price through when the artist is known", () => {
    const out = resolveLineShipping({
      work: WORK,
      artist: { international_shipping_price: 30 },
      sizeLabel: "A2",
      fallback: FORGED,
    });
    expect(out.internationalShippingPrice).toBe(30);
  });

  it("yields null international when the artist has set none", () => {
    const out = resolveLineShipping({
      work: WORK,
      artist: { international_shipping_price: null },
      sizeLabel: "A2",
      fallback: FORGED,
    });
    expect(out.internationalShippingPrice).toBeNull();
  });

  it("uses the client fallback only for a line with no work row", () => {
    // Collection bundles and legacy cart lines have nothing to look up.
    const out = resolveLineShipping({
      work: null,
      artist: null,
      sizeLabel: null,
      fallback: { shippingPrice: 12, internationalShippingPrice: 20, dimensions: "30x40cm" },
    });
    expect(out).toEqual({
      shippingPrice: 12,
      internationalShippingPrice: 20,
      dimensions: "30x40cm",
    });
  });

  it("still prefers the artist's international price over the fallback with no work row", () => {
    const out = resolveLineShipping({
      work: null,
      artist: { international_shipping_price: 18 },
      sizeLabel: null,
      fallback: FORGED,
    });
    expect(out.internationalShippingPrice).toBe(18);
  });

  it("returns nulls when there is nothing to resolve and no fallback", () => {
    expect(resolveLineShipping({ work: null, artist: null, sizeLabel: null })).toEqual({
      shippingPrice: null,
      internationalShippingPrice: null,
      dimensions: null,
    });
  });
});
