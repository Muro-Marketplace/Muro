import { describe, expect, it } from "vitest";
import {
  DEFAULTS,
  FILTER_PARAM_KEYS,
  mergeFilterParams,
  parseFilters,
  serializeFilters,
  type BrowseFilterState,
  type SizeBand,
} from "./filterParams";

/** Deep-clone DEFAULTS into a fresh, mutable state (Set included). */
function freshDefaults(): BrowseFilterState {
  return {
    ...DEFAULTS,
    gallerySizes: new Set<SizeBand>(DEFAULTS.gallerySizes),
  };
}

/** A state with EVERY in-scope field pushed off its default. */
function fullyPopulated(): BrowseFilterState {
  return {
    artistSort: "distance",
    gallerySort: "price_high",
    galleryTheme: "abstract",
    galleryMedium: "oil",
    galleryStyle: "impressionist",
    galleryAvailableOnly: true,
    galleryPriceMin: 150,
    galleryPriceMax: 800,
    galleryLocationMode: "global",
    galleryOriginals: true,
    galleryPrints: true,
    galleryFraming: true,
    galleryFreeLoan: true,
    galleryRevenueShare: true,
    galleryRevenueShareMin: 40,
    galleryPurchase: true,
    gallerySizes: new Set<SizeBand>(["medium", "small", "xl"]),
    collectionsLocationMode: "global",
    collectionsPriceMin: 250,
    collectionsPriceMax: 1500,
    collectionsFreeLoan: true,
    collectionsRevShare: true,
    collectionsPurchase: true,
  };
}

/** Compare two states for equality, treating the Set structurally. */
function expectStateEqual(
  got: BrowseFilterState,
  want: BrowseFilterState,
): void {
  const { gallerySizes: gotSizes, ...gotRest } = got;
  const { gallerySizes: wantSizes, ...wantRest } = want;
  expect(gotRest).toEqual(wantRest);
  expect([...gotSizes].sort()).toEqual([...wantSizes].sort());
}

describe("serializeFilters()", () => {
  it("produces an empty query for the default state", () => {
    const out = serializeFilters(freshDefaults());
    expect(out.toString()).toBe("");
  });

  it("omits every value still at its default", () => {
    // Only one field changed → only that key appears.
    const state = freshDefaults();
    state.galleryOriginals = true;
    const out = serializeFilters(state);
    expect(out.toString()).toBe("gorig=1");
  });

  it("writes booleans only when true", () => {
    const state = freshDefaults();
    state.galleryFreeLoan = true;
    state.galleryPrints = false; // default already, must not appear
    const out = serializeFilters(state);
    expect(out.get("gloan")).toBe("1");
    expect(out.has("gprints")).toBe(false);
  });

  it("writes numbers only when they differ from the default", () => {
    const state = freshDefaults();
    state.galleryPriceMin = 200; // default 0
    state.galleryPriceMax = DEFAULTS.galleryPriceMax; // unchanged
    const out = serializeFilters(state);
    expect(out.get("gpmin")).toBe("200");
    expect(out.has("gpmax")).toBe(false);
  });

  it("encodes the size Set as a stable sorted comma list", () => {
    const state = freshDefaults();
    // Insertion order deliberately scrambled; output must be stable.
    state.gallerySizes = new Set<SizeBand>(["xl", "small", "large"]);
    const out = serializeFilters(state);
    expect(out.get("gsizes")).toBe("small,large,xl");
  });

  it("omits the size key entirely when the Set is empty", () => {
    const out = serializeFilters(freshDefaults());
    expect(out.has("gsizes")).toBe(false);
  });

  it("serializes the location mode only when it leaves the default", () => {
    const state = freshDefaults();
    expect(serializeFilters(state).has("gloc")).toBe(false);
    state.galleryLocationMode = "global";
    expect(serializeFilters(state).get("gloc")).toBe("global");
  });
});

describe("parseFilters()", () => {
  it("returns an empty partial for null/undefined", () => {
    expect(parseFilters(null)).toEqual({});
    expect(parseFilters(undefined)).toEqual({});
  });

  it("returns an empty partial for empty params", () => {
    expect(parseFilters(new URLSearchParams())).toEqual({});
  });

  it("ignores unknown params", () => {
    const sp = new URLSearchParams("totally=bogus&view=collections&q=cat");
    expect(parseFilters(sp)).toEqual({});
  });

  it("clamps out-of-range numbers to the slider window", () => {
    const sp = new URLSearchParams("gpmin=-500&gpmax=99999");
    const parsed = parseFilters(sp);
    expect(parsed.galleryPriceMin).toBe(0); // floor
    expect(parsed.galleryPriceMax).toBe(1000); // ceil
  });

  it("clamps the revenue-share % to 0..100", () => {
    expect(parseFilters(new URLSearchParams("grevmin=250")).galleryRevenueShareMin).toBe(100);
    expect(parseFilters(new URLSearchParams("grevmin=-9")).galleryRevenueShareMin).toBe(0);
  });

  it("falls back to default for non-numeric number params", () => {
    const parsed = parseFilters(new URLSearchParams("gpmin=banana"));
    expect(parsed.galleryPriceMin).toBe(DEFAULTS.galleryPriceMin);
  });

  it("rejects an out-of-allow-list sort value", () => {
    const parsed = parseFilters(new URLSearchParams("gsort=nonsense"));
    expect(parsed.gallerySort).toBe(DEFAULTS.gallerySort);
  });

  it("rejects an out-of-allow-list location mode", () => {
    const parsed = parseFilters(new URLSearchParams("gloc=sideways"));
    expect(parsed.galleryLocationMode).toBe(DEFAULTS.galleryLocationMode);
  });

  it("parses a valid size Set and drops junk bands", () => {
    const parsed = parseFilters(new URLSearchParams("gsizes=small,GARBAGE,xl,,large"));
    expect(parsed.gallerySizes).toBeInstanceOf(Set);
    expect([...(parsed.gallerySizes as Set<SizeBand>)].sort()).toEqual([
      "large",
      "small",
      "xl",
    ]);
  });

  it("omits gallerySizes when every band is junk", () => {
    const parsed = parseFilters(new URLSearchParams("gsizes=foo,bar"));
    expect(parsed.gallerySizes).toBeUndefined();
  });

  it("reads booleans forgivingly (1/true/yes) and treats others as false", () => {
    expect(parseFilters(new URLSearchParams("gorig=1")).galleryOriginals).toBe(true);
    expect(parseFilters(new URLSearchParams("gorig=true")).galleryOriginals).toBe(true);
    expect(parseFilters(new URLSearchParams("gorig=YES")).galleryOriginals).toBe(true);
    expect(parseFilters(new URLSearchParams("gorig=0")).galleryOriginals).toBe(false);
    expect(parseFilters(new URLSearchParams("gorig=nope")).galleryOriginals).toBe(false);
  });

  it("only includes keys that are present in the URL (partial semantics)", () => {
    const parsed = parseFilters(new URLSearchParams("gorig=1"));
    expect(Object.keys(parsed)).toEqual(["galleryOriginals"]);
  });

  it("ignores empty-string select values", () => {
    const parsed = parseFilters(new URLSearchParams("gtheme=&gmedium="));
    expect(parsed.galleryTheme).toBeUndefined();
    expect(parsed.galleryMedium).toBeUndefined();
  });
});

describe("round-trip parseFilters(serializeFilters(s))", () => {
  it("round-trips the default state to an identical state", () => {
    const start = freshDefaults();
    const reparsed = { ...freshDefaults(), ...parseFilters(serializeFilters(start)) };
    expectStateEqual(reparsed, start);
  });

  it("round-trips a fully-populated state through params and back", () => {
    const start = fullyPopulated();
    const params = serializeFilters(start);
    const reparsed = { ...freshDefaults(), ...parseFilters(params) };
    expectStateEqual(reparsed, start);
  });

  it("round-trips several representative partial states", () => {
    const variants: Partial<BrowseFilterState>[] = [
      { galleryTheme: "nature", gallerySort: "recent" },
      { galleryPriceMin: 50, galleryPriceMax: 950 },
      { gallerySizes: new Set<SizeBand>(["small"]) },
      { galleryRevenueShare: true, galleryRevenueShareMin: 25 },
      { collectionsFreeLoan: true, collectionsRevShare: true, collectionsPurchase: true },
      { collectionsPriceMin: 100, collectionsPriceMax: 1900, collectionsLocationMode: "global" },
      { artistSort: "revenue_share" },
      { galleryLocationMode: "global", galleryAvailableOnly: true },
    ];
    for (const v of variants) {
      const start: BrowseFilterState = {
        ...freshDefaults(),
        ...v,
        gallerySizes: v.gallerySizes
          ? new Set<SizeBand>(v.gallerySizes)
          : new Set<SizeBand>(),
      };
      const reparsed = { ...freshDefaults(), ...parseFilters(serializeFilters(start)) };
      expectStateEqual(reparsed, start);
    }
  });

  it("serialize is order-stable for the same logical Set (loop-guard safety)", () => {
    const a = freshDefaults();
    a.gallerySizes = new Set<SizeBand>(["small", "xl"]);
    const b = freshDefaults();
    b.gallerySizes = new Set<SizeBand>(["xl", "small"]);
    expect(serializeFilters(a).toString()).toBe(serializeFilters(b).toString());
  });
});

describe("mergeFilterParams() — loop-guard string builder", () => {
  it("preserves non-filter params (view/discipline/sub/q/featured/loc_*)", () => {
    const current = new URLSearchParams(
      "view=collections&discipline=photography&sub=street&q=cat&featured=1&loc_lat=51&loc_lng=-0.1",
    );
    const state = freshDefaults();
    state.collectionsFreeLoan = true;
    const qs = mergeFilterParams(state, current);
    const out = new URLSearchParams(qs);
    expect(out.get("view")).toBe("collections");
    expect(out.get("discipline")).toBe("photography");
    expect(out.get("sub")).toBe("street");
    expect(out.get("q")).toBe("cat");
    expect(out.get("featured")).toBe("1");
    expect(out.get("loc_lat")).toBe("51");
    expect(out.get("cloan")).toBe("1");
  });

  it("drops a filter param when its value returns to default", () => {
    // Start with a URL that has a stale gorig=1, then merge a state
    // where galleryOriginals is back to its default false.
    const current = new URLSearchParams("view=collections&gorig=1&gpmin=200");
    const state = freshDefaults(); // all defaults
    const qs = mergeFilterParams(state, current);
    const out = new URLSearchParams(qs);
    expect(out.has("gorig")).toBe(false);
    expect(out.has("gpmin")).toBe(false);
    // non-filter key survives
    expect(out.get("view")).toBe("collections");
  });

  it("yields a query equal to the current one when nothing changed (no-op guard)", () => {
    // Current URL already reflects the state → merge must reproduce it,
    // so the page's `qs === searchParams.toString()` guard short-circuits.
    const state = freshDefaults();
    state.galleryPriceMin = 200;
    state.gallerySizes = new Set<SizeBand>(["small", "large"]);
    // Build the "current" URL the way the page would have written it.
    const seeded = mergeFilterParams(state, new URLSearchParams("view=gallery"));
    // Re-merge from that same URL with the same state.
    const again = mergeFilterParams(state, new URLSearchParams(seeded));
    expect(again).toBe(seeded);
  });

  it("does not mutate the caller's params object", () => {
    const current = new URLSearchParams("view=gallery&gorig=1");
    const before = current.toString();
    mergeFilterParams(freshDefaults(), current);
    expect(current.toString()).toBe(before);
  });

  it("FILTER_PARAM_KEYS covers every key serializeFilters can emit", () => {
    // Guards against adding a serialized key but forgetting to list it
    // for the wipe step (which would leak stale params).
    const all = serializeFilters(fullyPopulated());
    for (const key of all.keys()) {
      expect(FILTER_PARAM_KEYS).toContain(key);
    }
  });
});
