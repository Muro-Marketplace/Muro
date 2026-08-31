import { describe, expect, it } from "vitest";
import { orderItemsSubtotal, readOrderItem, readOrderItems } from "./order-items";

// Copied verbatim from production order WS-J6CRQS4XTX2DJRO7 and its
// neighbours (2026-08-30). The enriched shape carries neither `qty` nor
// `price`, which is precisely why the pound-based readers rendered nothing.
const ENRICHED = {
  size: '16×24" (41×61 cm)',
  image: "https://example.test/a.png",
  title: "Streets of St. Tropez",
  quantity: 1,
  lineTotal: { amount: 6999, currency: "GBP" },
  artistName: "Finlay Coles",
};

const CART = { title: "Mt. Fitz Roy", qty: 2, price: 49.99 };

describe("readOrderItem", () => {
  it("reads the enriched shape the Stripe webhook writes", () => {
    expect(readOrderItem(ENRICHED)).toEqual({
      title: "Streets of St. Tropez",
      quantity: 1,
      lineTotal: 69.99,
      currency: "GBP",
    });
  });

  it("reads the legacy cart shape", () => {
    expect(readOrderItem(CART)).toEqual({
      title: "Mt. Fitz Roy",
      quantity: 2,
      lineTotal: 99.98,
      currency: null,
    });
  });

  // B L834 / C L990. The customer portal and the tracking page both did
  // `item.price * item.qty`, which on the enriched shape is undefined times
  // undefined. Two thirds of production orders are that shape.
  it("does not return NaN or zero for an enriched item", () => {
    const line = readOrderItem(ENRICHED);
    expect(Number.isNaN(line.lineTotal)).toBe(false);
    expect(line.lineTotal).toBeGreaterThan(0);
  });

  it("prefers the pence amount over pounds when a row carries both", () => {
    // Mid-migration rows exist. Stripe's figure is what was charged, so it wins.
    const line = readOrderItem({ ...ENRICHED, qty: 9, price: 1 });
    expect(line.lineTotal).toBe(69.99);
  });

  it("applies quantity to the legacy per-unit price but not to the pence total", () => {
    // lineTotal.amount is already the whole line, multiplying it would double-count.
    expect(readOrderItem({ quantity: 3, lineTotal: { amount: 3000 } }).lineTotal).toBe(30);
    expect(readOrderItem({ qty: 3, price: 10 }).lineTotal).toBe(30);
  });

  it("defaults a missing quantity to 1", () => {
    expect(readOrderItem({ title: "x", price: 12.5 }).quantity).toBe(1);
    expect(readOrderItem({ title: "x", price: 12.5 }).lineTotal).toBe(12.5);
  });

  it("keeps an explicit zero quantity", () => {
    expect(readOrderItem({ quantity: 0, price: 10 }).quantity).toBe(0);
  });

  it("names an untitled item rather than rendering a blank", () => {
    expect(readOrderItem({ price: 1 }).title).toBe("Artwork");
    expect(readOrderItem({ title: "   ", price: 1 }).title).toBe("Artwork");
  });

  it("returns zero, not NaN, for a row holding neither shape", () => {
    expect(readOrderItem({ title: "Mystery" }).lineTotal).toBe(0);
    expect(readOrderItem(null).lineTotal).toBe(0);
    expect(readOrderItem(undefined).quantity).toBe(1);
  });

  it("ignores non-numeric junk in the money fields", () => {
    expect(readOrderItem({ price: "12.50" as never }).lineTotal).toBe(12.5);
    expect(readOrderItem({ price: "free" as never }).lineTotal).toBe(0);
    expect(readOrderItem({ lineTotal: { amount: null } }).lineTotal).toBe(0);
  });

  it("keeps a negative amount rather than clamping it", () => {
    expect(readOrderItem({ lineTotal: { amount: -500 } }).lineTotal).toBe(-5);
  });
});

describe("readOrderItems", () => {
  it("reads a mixed-shape array", () => {
    expect(readOrderItems([ENRICHED, CART]).map((l) => l.lineTotal)).toEqual([69.99, 99.98]);
  });

  it("tolerates a non-array column", () => {
    expect(readOrderItems(null)).toEqual([]);
    expect(readOrderItems("[]")).toEqual([]);
    expect(readOrderItems(undefined)).toEqual([]);
  });
});

describe("orderItemsSubtotal", () => {
  it("sums both shapes together", () => {
    expect(orderItemsSubtotal([ENRICHED, CART])).toBeCloseTo(169.97, 2);
  });

  it("is zero for an empty order", () => {
    expect(orderItemsSubtotal([])).toBe(0);
  });
});
