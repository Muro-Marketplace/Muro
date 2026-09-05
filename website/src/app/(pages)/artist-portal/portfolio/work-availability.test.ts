// Owner report, 5 September 2026. The "Available for purchase" box and the
// "Quantity available" field on the portfolio form used to fight each other.
// decrement_work_stock (migration 120) flips `available` to false when stock
// hits zero, and the form's own save did the same, but nothing mirrored
// restock_work on the way back up: the box hydrated from the stored flag
// (false), the save ANDed it with the new quantity, and a restock from 0 to
// 100 saved available=false. The marketplace kept saying Sold (live row
// fin-coles-1777209447418, quantity 100, available false).

import { describe, expect, it } from "vitest";
import { deriveAvailable, hydrateAvailable, isSoldOutByStock } from "./work-availability";

describe("isSoldOutByStock", () => {
  it("is true only for a tracked count at or below zero", () => {
    expect(isSoldOutByStock({ quantityAvailable: 0 })).toBe(true);
    expect(isSoldOutByStock({ quantityAvailable: -1 })).toBe(true);
    expect(isSoldOutByStock({ quantityAvailable: 3 })).toBe(false);
  });

  it("treats an untracked count (unlimited) as in stock", () => {
    expect(isSoldOutByStock({ quantityAvailable: null })).toBe(false);
    expect(isSoldOutByStock({})).toBe(false);
  });
});

describe("hydrateAvailable (what the edit form's box shows)", () => {
  it("shows a work that only ran out of stock as still for sale", () => {
    expect(hydrateAvailable({ available: false, quantityAvailable: 0 })).toBe(true);
  });

  it("keeps a withdrawn work unticked while it still has stock", () => {
    expect(hydrateAvailable({ available: false, quantityAvailable: 5 })).toBe(false);
    expect(hydrateAvailable({ available: false, quantityAvailable: null })).toBe(false);
    expect(hydrateAvailable({ available: false })).toBe(false);
  });

  it("leaves an available work ticked", () => {
    expect(hydrateAvailable({ available: true, quantityAvailable: 0 })).toBe(true);
    expect(hydrateAvailable({ available: true })).toBe(true);
  });
});

describe("deriveAvailable (what the save writes)", () => {
  it("restocking a sold-out work puts it back on sale", () => {
    expect(deriveAvailable(true, 100)).toBe(true);
    // Blank means unlimited, the print-on-demand case.
    expect(deriveAvailable(true, null)).toBe(true);
  });

  it("a tracked count of zero is sold out, mirroring decrement_work_stock", () => {
    expect(deriveAvailable(true, 0)).toBe(false);
  });

  it("an unticked box wins regardless of stock", () => {
    expect(deriveAvailable(false, 100)).toBe(false);
    expect(deriveAvailable(false, null)).toBe(false);
  });
});
