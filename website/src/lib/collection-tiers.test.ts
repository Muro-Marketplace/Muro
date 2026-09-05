import { describe, expect, it } from "vitest";
import {
  cheapestTier,
  cheapestTierPrice,
  collectionPriceBand,
  findCollectionTier,
  parseCollectionSizeTiers,
  MAX_COLLECTION_TIERS,
} from "./collection-tiers";

const WORK_IDS = ["w1", "w2"];

const VALID = [
  {
    label: "Small",
    price: 120,
    description: "A4 prints, unframed",
    workSizes: [
      { workId: "w1", sizeLabel: "A4" },
      { workId: "w2", sizeLabel: "A4" },
    ],
  },
  {
    label: "Large",
    price: 480,
    workSizes: [
      { workId: "w1", sizeLabel: "A2" },
      { workId: "w2", sizeLabel: "50x70cm" },
    ],
  },
];

function ok(raw: unknown, workIds: string[] = WORK_IDS) {
  const result = parseCollectionSizeTiers(raw, workIds);
  if ("error" in result) {
    throw new Error(`expected tiers, got error: ${result.error}`);
  }
  return result.tiers;
}

function err(raw: unknown, workIds: string[] = WORK_IDS) {
  const result = parseCollectionSizeTiers(raw, workIds);
  if (!("error" in result)) {
    throw new Error("expected an error, got tiers");
  }
  return result.error;
}

describe("parseCollectionSizeTiers", () => {
  it("treats a missing or non-array value as untiered", () => {
    expect(ok(undefined)).toEqual([]);
    expect(ok(null)).toEqual([]);
    expect(ok("Small")).toEqual([]);
    expect(ok({})).toEqual([]);
    expect(ok([])).toEqual([]);
  });

  it("accepts a valid tier set", () => {
    expect(ok(VALID)).toEqual(VALID);
  });

  it("trims the label and the description", () => {
    const [tier] = ok([{ label: "  Small  ", price: 120, description: "  A4  ", workSizes: [] }]);
    expect(tier.label).toBe("Small");
    expect(tier.description).toBe("A4");
  });

  it("drops an empty description rather than storing a blank string", () => {
    const [tier] = ok([{ label: "Small", price: 120, description: "   ", workSizes: [] }]);
    expect(tier.description).toBeUndefined();
  });

  it("rejects more tiers than the cap", () => {
    const tooMany = Array.from({ length: MAX_COLLECTION_TIERS + 1 }, (_, i) => ({
      label: `Tier ${i}`,
      price: 100 + i,
      workSizes: [],
    }));
    expect(err(tooMany)).toMatch(/at most/i);
  });

  it("accepts exactly the cap", () => {
    const atCap = Array.from({ length: MAX_COLLECTION_TIERS }, (_, i) => ({
      label: `Tier ${i}`,
      price: 100 + i,
      workSizes: [],
    }));
    expect(ok(atCap)).toHaveLength(MAX_COLLECTION_TIERS);
  });

  it("rejects duplicate labels case-insensitively", () => {
    // The label is the key checkout re-prices against, so two tiers that
    // differ only in casing would make the charge ambiguous.
    expect(
      err([
        { label: "Small", price: 120, workSizes: [] },
        { label: "small", price: 480, workSizes: [] },
      ]),
    ).toMatch(/same name/i);
  });

  it("rejects a blank or missing label", () => {
    expect(err([{ label: "   ", price: 120, workSizes: [] }])).toMatch(/name/i);
    expect(err([{ price: 120, workSizes: [] }])).toMatch(/name/i);
  });

  it("rejects a label longer than 40 characters", () => {
    expect(err([{ label: "x".repeat(41), price: 120, workSizes: [] }])).toMatch(/40/);
  });

  it("rejects a price that is zero, negative or not a number", () => {
    expect(err([{ label: "Small", price: 0, workSizes: [] }])).toMatch(/price/i);
    expect(err([{ label: "Small", price: -10, workSizes: [] }])).toMatch(/price/i);
    expect(err([{ label: "Small", price: "free", workSizes: [] }])).toMatch(/price/i);
    expect(err([{ label: "Small", price: Number.NaN, workSizes: [] }])).toMatch(/price/i);
    expect(err([{ label: "Small", workSizes: [] }])).toMatch(/price/i);
  });

  it("rejects a price above the cap", () => {
    expect(err([{ label: "Small", price: 100001, workSizes: [] }])).toMatch(/price/i);
  });

  it("accepts a numeric string price, matching how the form submits it", () => {
    const [tier] = ok([{ label: "Small", price: "120.50", workSizes: [] }]);
    expect(tier.price).toBe(120.5);
  });

  it("rejects a tier that is not an object", () => {
    expect(err(["Small"])).toMatch(/tier/i);
    expect(err([null])).toMatch(/tier/i);
  });

  it("drops workSizes naming a work outside the collection", () => {
    // Matches how the route already filters workIds: a stale id is noise from
    // an editor that has drifted, not an attack worth a 400.
    const [tier] = ok([
      {
        label: "Small",
        price: 120,
        workSizes: [
          { workId: "w1", sizeLabel: "A4" },
          { workId: "gone", sizeLabel: "A4" },
        ],
      },
    ]);
    expect(tier.workSizes).toEqual([{ workId: "w1", sizeLabel: "A4" }]);
  });

  it("drops malformed workSizes entries", () => {
    const [tier] = ok([
      {
        label: "Small",
        price: 120,
        workSizes: [
          { workId: "w1", sizeLabel: "A4" },
          { workId: "w2" },
          { sizeLabel: "A4" },
          null,
          "w2",
        ],
      },
    ]);
    expect(tier.workSizes).toEqual([{ workId: "w1", sizeLabel: "A4" }]);
  });

  it("treats a missing workSizes array as no pinned sizes", () => {
    const [tier] = ok([{ label: "Small", price: 120 }]);
    expect(tier.workSizes).toEqual([]);
  });
});

describe("findCollectionTier", () => {
  const tiers = ok(VALID);

  it("finds a tier by its exact label", () => {
    expect(findCollectionTier(tiers, "Small")?.price).toBe(120);
    expect(findCollectionTier(tiers, "Large")?.price).toBe(480);
  });

  it("matches case-insensitively and ignores surrounding whitespace", () => {
    // Consistent with the case-insensitive size matching on the works path in
    // api/checkout, where a cosmetic casing difference should not block a sale.
    expect(findCollectionTier(tiers, "  small ")?.price).toBe(120);
    expect(findCollectionTier(tiers, "LARGE")?.price).toBe(480);
  });

  it("returns undefined for a label no tier carries", () => {
    expect(findCollectionTier(tiers, "Medium")).toBeUndefined();
    expect(findCollectionTier(tiers, "")).toBeUndefined();
    expect(findCollectionTier(tiers, undefined)).toBeUndefined();
    expect(findCollectionTier([], "Small")).toBeUndefined();
  });
});

describe("cheapestTierPrice", () => {
  it("returns the lowest tier price", () => {
    expect(cheapestTierPrice(ok(VALID))).toBe(120);
  });

  it("does not assume the tiers are sorted", () => {
    expect(
      cheapestTierPrice(
        ok([
          { label: "Large", price: 480, workSizes: [] },
          { label: "Small", price: 120, workSizes: [] },
          { label: "Medium", price: 250, workSizes: [] },
        ]),
      ),
    ).toBe(120);
  });

  it("returns null when there are no tiers", () => {
    expect(cheapestTierPrice([])).toBeNull();
  });
});

describe("collectionPriceBand", () => {
  it("shows a plain price for an untiered collection", () => {
    expect(collectionPriceBand(120, [])).toBe("£120");
  });

  it("shows a from-price for a collection with several tiers", () => {
    expect(collectionPriceBand(120, ok(VALID))).toBe("From £120");
  });

  it("reads the from-price off the cheapest tier, not the stored bundle price", () => {
    // bundle_price is denormalised to the cheapest tier on write, so the two
    // agree in practice. If a row ever drifts, the tiers are the truth.
    expect(collectionPriceBand(999, ok(VALID))).toBe("From £120");
  });

  it("shows a plain price when there is only one tier", () => {
    // One tier is just a named price, there is no range to be 'from'.
    expect(collectionPriceBand(120, ok([{ label: "Small", price: 120, workSizes: [] }]))).toBe(
      "£120",
    );
  });

  it("returns null when the collection has no usable price", () => {
    // Each call site keeps its own fallback wording: the browse feed renders
    // an empty string, the artist profile renders "Price on enquiry".
    expect(collectionPriceBand(0, [])).toBeNull();
    expect(collectionPriceBand(null, [])).toBeNull();
    expect(collectionPriceBand(undefined, [])).toBeNull();
    expect(collectionPriceBand(-5, [])).toBeNull();
  });

  it("prices a tiered collection even when the stored bundle price is missing", () => {
    expect(collectionPriceBand(null, ok(VALID))).toBe("From £120");
  });
});

describe("cheapestTier", () => {
  it("returns the whole cheapest tier, not just its price", () => {
    const tier = cheapestTier(ok(VALID));
    expect(tier?.label).toBe("Small");
    expect(tier?.workSizes).toEqual([
      { workId: "w1", sizeLabel: "A4" },
      { workId: "w2", sizeLabel: "A4" },
    ]);
  });

  it("does not assume the tiers are sorted", () => {
    const tier = cheapestTier(
      ok([
        { label: "Large", price: 480, workSizes: [] },
        { label: "Small", price: 120, workSizes: [] },
        { label: "Medium", price: 250, workSizes: [] },
      ]),
    );
    expect(tier?.label).toBe("Small");
  });

  it("returns null when the collection is untiered", () => {
    expect(cheapestTier([])).toBeNull();
    expect(cheapestTier(null)).toBeNull();
    expect(cheapestTier(undefined)).toBeNull();
  });
});
