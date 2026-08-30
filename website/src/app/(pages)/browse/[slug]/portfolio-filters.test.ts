// Regression tests for B6 and B7 on the artist profile.
//
// B6: the portfolio theme picker matched `title + medium` substrings
//     instead of the work's theme tags, so it was wrong both ways.
// B7: the floating-bar bulk Buy Now added tiers[tiers.length - 1] with a
//     comment claiming it was the largest tier, while the offer modal's
//     asking-price hint beside it used Math.max over the same array.

import { describe, expect, it } from "vitest";
import {
  filterWorksByTheme,
  largestPricedTier,
  workMatchesTheme,
  workThemeTags,
} from "./portfolio-filters";

function work(
  title: string,
  medium: string,
  extra: { themes?: unknown; description?: string } = {},
) {
  return { title, medium, ...extra } as {
    title: string;
    medium: string;
    description?: string;
    themes?: string[];
  };
}

describe("workThemeTags", () => {
  it("returns the tags a work carries", () => {
    expect(workThemeTags(work("A", "Oil", { themes: ["Coastal", "Nature"] }))).toEqual([
      "Coastal",
      "Nature",
    ]);
  });

  it("treats anything that is not a string array as untagged", () => {
    expect(workThemeTags(work("A", "Oil"))).toEqual([]);
    expect(workThemeTags(work("A", "Oil", { themes: null }))).toEqual([]);
    expect(workThemeTags(work("A", "Oil", { themes: "Coastal" }))).toEqual([]);
    expect(workThemeTags(work("A", "Oil", { themes: [1, 2] }))).toEqual([]);
  });

  it("drops blank tags and trims the rest", () => {
    expect(workThemeTags(work("A", "Oil", { themes: ["  Coastal ", "", "   "] }))).toEqual([
      "Coastal",
    ]);
  });
});

describe("workMatchesTheme (B6)", () => {
  it("matches a tagged work on its own tags, whatever the title says", () => {
    // The bug: "Hospitality-friendly" appears in no title or medium, so the
    // old substring match hid every work of an artist tagged with it.
    const w = work("Winter Field", "Oil on canvas", {
      themes: ["Hospitality-friendly", "Landscapes"],
    });
    expect(workMatchesTheme(w, "Hospitality-friendly")).toBe(true);
    expect(workMatchesTheme(w, "Landscapes")).toBe(true);
  });

  it("is case-insensitive on tags", () => {
    const w = work("Winter Field", "Oil", { themes: ["Coastal"] });
    expect(workMatchesTheme(w, "coastal")).toBe(true);
    expect(workMatchesTheme(w, "COASTAL")).toBe(true);
  });

  it("does NOT match a tagged work on a title substring it isn't tagged with", () => {
    // The other direction of the bug: "Colour" swallowed anything with the
    // word in its title even when the work is tagged with something else.
    const w = work("Colours of Autumn", "Oil on canvas", { themes: ["Landscapes"] });
    expect(workMatchesTheme(w, "Colour")).toBe(false);
    expect(workMatchesTheme(w, "Landscapes")).toBe(true);
  });

  it("falls back to the substring match for an untagged work", () => {
    const w = work("Harbour Study", "Watercolour");
    expect(workMatchesTheme(w, "Harbour")).toBe(true);
    expect(workMatchesTheme(w, "watercolour")).toBe(true);
    expect(workMatchesTheme(w, "Portraits")).toBe(false);
  });

  it("searches the description too on the untagged fallback", () => {
    const w = work("Study No. 4", "Oil", {
      description: "A quiet coastal scene at first light.",
    });
    expect(workMatchesTheme(w, "coastal")).toBe(true);
  });

  it("treats an empty theme as no filter", () => {
    expect(workMatchesTheme(work("A", "Oil"), "")).toBe(true);
    expect(workMatchesTheme(work("A", "Oil"), "   ")).toBe(true);
  });
});

describe("filterWorksByTheme (B6)", () => {
  const works = [
    work("Winter Field", "Oil on canvas", { themes: ["Landscapes"] }),
    work("Colours of Autumn", "Oil on canvas", { themes: ["Abstract"] }),
    work("Harbour Study", "Watercolour"),
  ];

  it("returns every work for the All sentinel", () => {
    expect(filterWorksByTheme(works, "All")).toHaveLength(3);
  });

  it("selects only the works actually tagged with the theme", () => {
    const got = filterWorksByTheme(works, "Landscapes");
    expect(got.map((w) => w.title)).toEqual(["Winter Field"]);
  });

  it("does not leak a tagged work in on a title substring", () => {
    // Pre-fix, "Colour" pulled in both "Colours of Autumn" (title) and
    // "Harbour Study" (medium: Watercolour).
    const got = filterWorksByTheme(works, "Colour");
    expect(got.map((w) => w.title)).toEqual(["Harbour Study"]);
  });

  it("does not mutate the input array", () => {
    const original = [...works];
    filterWorksByTheme(works, "All").pop();
    expect(works).toEqual(original);
  });
});

describe("largestPricedTier (B7)", () => {
  it("picks the highest price, not the last array entry", () => {
    // Artists type sizes in whatever order suits them; nothing sorts this.
    const tiers = [
      { label: "A2", price: 180 },
      { label: "100x80", price: 420 },
      { label: "A4", price: 60 },
    ];
    expect(largestPricedTier(tiers)).toEqual({ label: "100x80", price: 420 });
  });

  it("agrees with the Math.max the offer modal uses for the same array", () => {
    const tiers = [
      { label: "A2", price: 180 },
      { label: "100x80", price: 420 },
      { label: "A4", price: 60 },
    ];
    const modalAskingPrice = Math.max(0, ...tiers.map((t) => Number(t.price) || 0));
    expect(largestPricedTier(tiers)!.price).toBe(modalAskingPrice);
  });

  it("keeps the artist's earlier entry on a tie", () => {
    const tiers = [
      { label: "A2", price: 200 },
      { label: "A2 alt", price: 200 },
    ];
    expect(largestPricedTier(tiers)!.label).toBe("A2");
  });

  it("ignores non-finite and negative prices", () => {
    const tiers = [
      { label: "broken", price: Number.NaN },
      { label: "credit", price: -50 },
      { label: "A4", price: 60 },
    ];
    expect(largestPricedTier(tiers)!.label).toBe("A4");
  });

  it("returns null when there is nothing priceable", () => {
    expect(largestPricedTier([])).toBeNull();
    expect(largestPricedTier(undefined)).toBeNull();
    expect(largestPricedTier(null)).toBeNull();
    expect(largestPricedTier([{ label: "broken", price: Number.NaN }])).toBeNull();
  });
});
