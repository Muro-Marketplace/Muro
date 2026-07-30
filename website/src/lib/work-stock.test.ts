import { describe, it, expect } from "vitest";
import { isWorkSold } from "./work-stock";

// D7 extracted this predicate so the cart checkout and the offer checkout cannot
// disagree about what "sold" means. The null case is the one that matters: 23 of
// the 35 works in the live table have quantity_available null.
describe("isWorkSold", () => {
  it("is not sold when available and stock is untracked", () => {
    expect(isWorkSold({ available: true, quantity_available: null })).toBe(false);
  });

  it("is not sold when stock remains", () => {
    expect(isWorkSold({ available: true, quantity_available: 3 })).toBe(false);
  });

  it("is sold when explicitly withdrawn", () => {
    expect(isWorkSold({ available: false, quantity_available: 5 })).toBe(true);
  });

  it("is sold at zero stock", () => {
    expect(isWorkSold({ available: true, quantity_available: 0 })).toBe(true);
  });

  it("is sold at negative stock, which E46a's lower bound now prevents arising", () => {
    expect(isWorkSold({ available: true, quantity_available: -1 })).toBe(true);
  });

  it("treats a null quantity as untracked rather than zero", () => {
    // The whole catalogue hangs on this: the webhook only decrements when the
    // value is a number, so null means the artist never set a count.
    expect(isWorkSold({ quantity_available: null })).toBe(false);
    expect(isWorkSold({})).toBe(false);
  });

  it("treats a null available as on sale, matching the live table's default", () => {
    // No row in artist_works has available null today, but reading null as sold
    // would make any future default silently unbuyable.
    expect(isWorkSold({ available: null, quantity_available: 2 })).toBe(false);
  });
});
