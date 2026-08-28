// 05 E41-e. The bulk price editor must preserve each size's per-size shippingPrice /
// inStorePrice / quantityAvailable, not rebuild the row as {label, price} and wipe them.

import { describe, expect, it } from "vitest";
import { mergeBulkPricing, copySizesPricing } from "./bulk-pricing";

describe("mergeBulkPricing (E41-e)", () => {
  it("preserves shippingPrice / inStorePrice / quantityAvailable when a price is tweaked", () => {
    const existing = [
      { label: "Medium", price: 100, shippingPrice: 4.5, inStorePrice: 90, quantityAvailable: 3 },
    ];
    const rows = [{ sizeIndex: 0, label: "Medium", price: 120, isNew: false }];
    expect(mergeBulkPricing(existing, rows)).toEqual([
      { label: "Medium", price: 120, shippingPrice: 4.5, inStorePrice: 90, quantityAvailable: 3 },
    ]);
  });

  it("keeps the fields even when the size is renamed (matched by sizeIndex)", () => {
    const existing = [{ label: "M", price: 100, shippingPrice: 4.5, inStorePrice: 90 }];
    const rows = [{ sizeIndex: 0, label: "Medium (40cm)", price: 100, isNew: false }];
    const out = mergeBulkPricing(existing, rows);
    expect(out[0]).toMatchObject({ label: "Medium (40cm)", shippingPrice: 4.5, inStorePrice: 90 });
  });

  it("does not merge onto an existing row for a brand-new size", () => {
    const existing = [{ label: "M", price: 100, shippingPrice: 4.5 }];
    const rows = [{ sizeIndex: 0, label: "Large", price: 200, isNew: true }];
    expect(mergeBulkPricing(existing, rows)).toEqual([{ label: "Large", price: 200 }]);
  });

  it("drops empty-label and £0 rows", () => {
    const rows = [
      { sizeIndex: 0, label: "  ", price: 100, isNew: false },
      { sizeIndex: 1, label: "M", price: 0, isNew: false },
    ];
    expect(mergeBulkPricing([], rows)).toEqual([]);
  });
});

describe("copySizesPricing (E41-e)", () => {
  it("keeps the target's shippingPrice / inStorePrice for a matching label", () => {
    const source = [{ label: "Medium", price: 999 }];
    const target = [
      { label: "medium", price: 100, shippingPrice: 4.5, inStorePrice: 90, quantityAvailable: 2 },
    ];
    // Copies the source label but keeps the target's own price/stock/shipping/in-store.
    expect(copySizesPricing(source, target)).toEqual([
      { label: "Medium", price: 100, shippingPrice: 4.5, inStorePrice: 90, quantityAvailable: 2 },
    ]);
  });

  it("defaults price to 0 and quantityAvailable to null for a label with no target match", () => {
    expect(copySizesPricing([{ label: "Large", price: 5 }], [])).toEqual([
      { label: "Large", price: 0, quantityAvailable: null },
    ]);
  });
});
