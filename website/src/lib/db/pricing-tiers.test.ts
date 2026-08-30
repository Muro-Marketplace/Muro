// QA 2026-08-30 bugs 8/9/10: pricing tiers stored under `size` instead of
// `label` gave every tier an undefined label, which broke the dropdown, printed
// "undefined" at checkout, and let the cart merge three differently-priced
// tiers into one line at the cheapest price.

import { describe, expect, it } from "vitest";
import { normalisePricingTiers } from "./artist-profiles-transform";

describe("normalisePricingTiers", () => {
  it("uses `size` when the tier has no `label` (the live broken shape)", () => {
    // Exactly the shape of "Last Light on Mare Street" in production.
    const tiers = normalisePricingTiers([
      { size: "A3", price: 180, shippingPrice: 12 },
      { size: "A2", price: 320, shippingPrice: 18 },
      { size: "60×90cm", price: 580, shippingPrice: 25 },
    ]);
    expect(tiers.map((t) => t.label)).toEqual(["A3", "A2", "60×90cm"]);
    // The labels must be DISTINCT, which is what stops the cart merging them.
    expect(new Set(tiers.map((t) => t.label)).size).toBe(3);
  });

  it("leaves a correct `label` alone", () => {
    const tiers = normalisePricingTiers([
      { label: "Small", price: 100 },
      { label: "Large", price: 400 },
    ]);
    expect(tiers.map((t) => t.label)).toEqual(["Small", "Large"]);
  });

  it("prefers label over size when both are present", () => {
    const tiers = normalisePricingTiers([{ label: "A3 print", size: "A3", price: 180 }]);
    expect(tiers[0].label).toBe("A3 print");
  });

  it("keeps unnamed tiers distinguishable rather than collapsing them", () => {
    // Blank labels previously collided; an unnamed tier is still its own
    // product at its own price.
    const tiers = normalisePricingTiers([
      { price: 180 },
      { label: "   ", price: 320 },
    ]);
    expect(tiers[0].label).toBe("Option 1");
    expect(tiers[1].label).toBe("Option 2");
    expect(tiers[0].label).not.toBe(tiers[1].label);
  });

  it("preserves the rest of the tier, including per-size shipping and stock", () => {
    const [tier] = normalisePricingTiers([
      { size: "A2", price: 320, shippingPrice: 18, quantityAvailable: 4 },
    ]);
    expect(tier).toMatchObject({ label: "A2", price: 320, shippingPrice: 18, quantityAvailable: 4 });
  });

  it("survives junk without throwing", () => {
    expect(normalisePricingTiers(null)).toEqual([]);
    expect(normalisePricingTiers("nonsense")).toEqual([]);
    expect(normalisePricingTiers([null]).length).toBe(1);
  });
});
