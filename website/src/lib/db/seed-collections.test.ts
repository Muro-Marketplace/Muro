// Sample collections, the same treatment the sample artists already get.
//
// The seed catalogue exists so the marketplace is not empty before real
// artists arrive. Artists have had it since the start (merged-data.ts, behind
// SEED_CATALOG, tagged isSeedArtist so the Sample pill shows). Collections had
// an empty array and a comment saying "collections are created by artists
// only", so /browse?view=collections was blank.
//
// These pin the two rules that keep the seed slice honest: a real collection
// always wins over a sample with the same id, and nothing seeded ever loses its
// Sample marking on the way through.

import { describe, expect, it, vi, beforeEach } from "vitest";

const { isFlagOnMock } = vi.hoisted(() => ({ isFlagOnMock: vi.fn() }));
vi.mock("@/lib/feature-flags", () => ({ isFlagOn: isFlagOnMock }));

import {
  getSeedCollection,
  resolveSeedCollectionWorks,
  withSeedCollections,
} from "./seed-collections";
import { collections as seedCollections } from "@/data/collections";
import type { ArtistCollection } from "@/data/collections";

const dbRow = (over: Partial<ArtistCollection> = {}): ArtistCollection => ({
  id: "db-1",
  artistSlug: "real-artist",
  artistName: "Real Artist",
  name: "A real collection",
  workIds: ["w-1", "w-2"],
  bundlePrice: 300,
  bundlePriceBand: "£300",
  coverImage: "cover.jpg",
  available: true,
  ...over,
});

beforeEach(() => {
  isFlagOnMock.mockReset();
  isFlagOnMock.mockImplementation((f: string) => f === "SEED_CATALOG");
});

describe("withSeedCollections", () => {
  it("appends the sample collections after the real ones", () => {
    const merged = withSeedCollections([dbRow()]);
    expect(merged[0].id).toBe("db-1");
    expect(merged.length).toBe(1 + seedCollections.length);
  });

  it("marks every sample so the card can show the pill", () => {
    const merged = withSeedCollections([]);
    expect(merged.length).toBeGreaterThan(0);
    expect(merged.every((c) => c.isSeedCollection === true)).toBe(true);
  });

  it("never marks a real collection as a sample", () => {
    const merged = withSeedCollections([dbRow()]);
    expect(merged.find((c) => c.id === "db-1")?.isSeedCollection).toBeFalsy();
  });

  it("lets a real collection win over a sample with the same id", () => {
    const sampleId = seedCollections[0].id;
    const merged = withSeedCollections([dbRow({ id: sampleId, name: "The real one" })]);
    const matches = merged.filter((c) => c.id === sampleId);
    expect(matches).toHaveLength(1);
    expect(matches[0].name).toBe("The real one");
  });

  it("returns only the real collections when the flag is off", () => {
    isFlagOnMock.mockReturnValue(false);
    expect(withSeedCollections([dbRow()])).toEqual([dbRow()]);
    expect(withSeedCollections([])).toEqual([]);
  });
});

describe("getSeedCollection", () => {
  it("finds a sample by id", () => {
    const first = seedCollections[0];
    expect(getSeedCollection(first.id)?.name).toBe(first.name);
  });

  it("marks what it returns as a sample", () => {
    expect(getSeedCollection(seedCollections[0].id)?.isSeedCollection).toBe(true);
  });

  it("returns undefined for an unknown id, and for any id when the flag is off", () => {
    expect(getSeedCollection("nope")).toBeUndefined();
    isFlagOnMock.mockReturnValue(false);
    expect(getSeedCollection(seedCollections[0].id)).toBeUndefined();
  });
});

describe("resolveSeedCollectionWorks", () => {
  it("resolves each work id against the sample artist's own works", () => {
    const collection = seedCollections[0];
    const { works } = resolveSeedCollectionWorks(collection);
    expect(works.map((w) => w.id)).toEqual(collection.workIds);
    expect(works.every((w) => w.title.length > 0)).toBe(true);
  });

  it("prices the default view from the cheapest tier, matching the API", () => {
    const tiered = seedCollections.find((c) => (c.sizeTiers ?? []).length > 1);
    expect(tiered, "no sample collection carries tiers to demonstrate").toBeDefined();

    const cheapest = [...tiered!.sizeTiers!].sort((a, b) => a.price - b.price)[0];
    const { works } = resolveSeedCollectionWorks(tiered!);
    for (const ws of cheapest.workSizes) {
      const work = works.find((w) => w.id === ws.workId);
      expect(work?.selectedSize).toBe(ws.sizeLabel);
    }
  });

  it("drops a work id the artist does not have, rather than yielding a hole", () => {
    const { works } = resolveSeedCollectionWorks({
      ...seedCollections[0],
      workIds: [...seedCollections[0].workIds, "does-not-exist"],
    });
    expect(works.every(Boolean)).toBe(true);
    expect(works.map((w) => w.id)).not.toContain("does-not-exist");
  });

  it("returns nothing for an unknown artist", () => {
    const { works, artistName } = resolveSeedCollectionWorks({
      ...seedCollections[0],
      artistSlug: "nobody",
    });
    expect(works).toEqual([]);
    expect(artistName).toBe("");
  });
});

// The data itself, checked rather than trusted: a sample collection whose
// pinned sizes do not exist on its works would render blank prices on the
// public page, and one priced above its parts would demonstrate the feature
// backwards.
describe("the sample collections themselves", () => {
  it("names works its artist actually has", () => {
    for (const c of seedCollections) {
      const { works } = resolveSeedCollectionWorks(c);
      expect(works.map((w) => w.id), `${c.id} names a work its artist lacks`).toEqual(c.workIds);
    }
  });

  it("pins sizes that exist on each work", () => {
    for (const c of seedCollections) {
      const { works } = resolveSeedCollectionWorks(c);
      for (const tier of c.sizeTiers ?? []) {
        for (const ws of tier.workSizes) {
          const work = works.find((w) => w.id === ws.workId);
          const labels = (work?.pricing ?? []).map((p) => p.label);
          expect(labels, `${c.id} / ${tier.label} pins a size ${ws.workId} lacks`).toContain(
            ws.sizeLabel,
          );
        }
      }
    }
  });

  it("covers every work in every tier", () => {
    for (const c of seedCollections) {
      for (const tier of c.sizeTiers ?? []) {
        expect(
          tier.workSizes.map((w) => w.workId).sort(),
          `${c.id} / ${tier.label} does not cover every work`,
        ).toEqual([...c.workIds].sort());
      }
    }
  });

  it("prices every tier below the sum of its parts, so the bundle is worth buying", () => {
    for (const c of seedCollections) {
      const { works } = resolveSeedCollectionWorks(c);
      for (const tier of c.sizeTiers ?? []) {
        const individual = tier.workSizes.reduce((sum, ws) => {
          const work = works.find((w) => w.id === ws.workId);
          const row = (work?.pricing ?? []).find((p) => p.label === ws.sizeLabel);
          return sum + (row?.price ?? 0);
        }, 0);
        expect(tier.price, `${c.id} / ${tier.label} costs more than its parts`).toBeLessThan(
          individual,
        );
      }
    }
  });

  it("keeps bundlePrice on the cheapest tier, as the database trigger would", () => {
    for (const c of seedCollections) {
      const tiers = c.sizeTiers ?? [];
      if (tiers.length === 0) continue;
      const cheapest = Math.min(...tiers.map((t) => t.price));
      expect(c.bundlePrice, `${c.id} bundlePrice is not its cheapest tier`).toBe(cheapest);
    }
  });

  it("includes at least one untiered collection, so that path is represented too", () => {
    expect(seedCollections.some((c) => (c.sizeTiers ?? []).length === 0)).toBe(true);
  });

  it("uses unique ids", () => {
    const ids = seedCollections.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
