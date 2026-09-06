// The public collection detail endpoint. Covered here from the size-tiers
// work (2026-09-05); the route had no test before that.
//
// The buyer page resolves a tier's per-work prices client-side, from the
// `pricing` array this route already returns on every work. So the server's job
// is narrow: hand over the tiers, and make the DEFAULT resolution match the
// tier the page selects first, which is the cheapest one.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { fromMock, isFlagOnMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  isFlagOnMock: vi.fn(),
}));

vi.mock("@/lib/feature-flags", () => ({ isFlagOn: isFlagOnMock }));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}));

import { GET } from "./route";

const WORKS = [
  {
    id: "w-1",
    title: "Harbour Light",
    medium: "Photography",
    dimensions: "30x40cm",
    price_band: "£85",
    pricing: [
      { label: "A4", price: 55 },
      { label: "A3", price: 85 },
      { label: "A2", price: 160 },
    ],
    available: true,
    color: "#C17C5A",
    image: "harbour.jpg",
    orientation: "landscape",
  },
  {
    id: "w-2",
    title: "Low Tide",
    medium: "Photography",
    dimensions: "30x40cm",
    price_band: "£85",
    pricing: [
      { label: "A4", price: 55 },
      { label: "50x70cm", price: 190 },
    ],
    available: true,
    color: "#C17C5A",
    image: "tide.jpg",
    orientation: "landscape",
  },
];

const TIERS = [
  {
    label: "Large",
    price: 480,
    workSizes: [
      { workId: "w-1", sizeLabel: "A2" },
      { workId: "w-2", sizeLabel: "50x70cm" },
    ],
  },
  {
    label: "Small",
    price: 120,
    description: "A4 prints",
    workSizes: [
      { workId: "w-1", sizeLabel: "A4" },
      { workId: "w-2", sizeLabel: "A4" },
    ],
  },
];

function setupDb(collectionOverrides: Record<string, unknown> = {}) {
  const row = {
    id: "c-1",
    artist_slug: "alice",
    name: "Coastal Series",
    description: "Six frames from one week",
    bundle_price: 120,
    work_ids: ["w-1", "w-2"],
    work_sizes: [
      { workId: "w-1", sizeLabel: "A3" },
      { workId: "w-2", sizeLabel: "A4" },
    ],
    size_tiers: [],
    thumbnail: "thumb.jpg",
    banner_image: null,
    available: true,
    ...collectionOverrides,
  };

  fromMock.mockImplementation((table: string) => {
    if (table === "artist_collections") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({ single: async () => ({ data: row, error: null }) }),
          }),
        }),
      };
    }
    if (table === "artist_profiles") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { slug: "alice", name: "Alice", profile_image: "alice.jpg" },
              error: null,
            }),
          }),
        }),
      };
    }
    return {
      select: () => ({ in: async () => ({ data: WORKS, error: null }) }),
    };
  });
}

const call = async () => {
  const res = await GET(new Request("http://localhost/api/collections/c-1"), {
    params: Promise.resolve({ id: "c-1" }),
  });
  return { status: res.status, body: await res.json() };
};

beforeEach(() => {
  fromMock.mockReset();
  isFlagOnMock.mockReset();
  isFlagOnMock.mockImplementation((f: string) => f === "SEED_CATALOG");
});

/** A database that holds no collection at all, so the seed fallback decides. */
function setupEmptyDb() {
  fromMock.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        eq: () => ({ single: async () => ({ data: null, error: { message: "no rows" } }) }),
      }),
      in: async () => ({ data: [], error: null }),
    }),
  }));
}

describe("GET /api/collections/[id] without tiers", () => {
  beforeEach(() => setupDb());

  it("returns an empty tier list", async () => {
    const { body } = await call();
    expect(body.collection.sizeTiers).toEqual([]);
  });

  it("resolves each work against work_sizes, as it always has", async () => {
    const { body } = await call();
    expect(body.works[0].selectedSize).toBe("A3");
    expect(body.works[0].selectedSizePrice).toBe(85);
    expect(body.works[1].selectedSize).toBe("A4");
    expect(body.works[1].selectedSizePrice).toBe(55);
  });

  it("shows a plain price band", async () => {
    const { body } = await call();
    expect(body.collection.bundlePriceBand).toBe("£120");
  });
});

describe("GET /api/collections/[id] with tiers", () => {
  beforeEach(() => setupDb({ size_tiers: TIERS }));

  it("returns the tiers", async () => {
    const { body } = await call();
    expect(body.collection.sizeTiers).toEqual(TIERS);
  });

  it("returns every work's full pricing array, so the page can price any tier", async () => {
    const { body } = await call();
    expect(body.works[0].pricing).toEqual(WORKS[0].pricing);
    expect(body.works[1].pricing).toEqual(WORKS[1].pricing);
  });

  it("resolves the default view against the cheapest tier, not work_sizes", async () => {
    // work_sizes says A3 for w-1. The cheapest tier says A4. The page opens on
    // the cheapest tier, so the server's default resolution has to agree with
    // it, or the first paint shows a size the selected tier does not include.
    const { body } = await call();
    expect(body.works[0].selectedSize).toBe("A4");
    expect(body.works[0].selectedSizePrice).toBe(55);
  });

  it("does not assume the cheapest tier is listed first", async () => {
    // TIERS lists Large before Small on purpose.
    const { body } = await call();
    expect(body.works[1].selectedSize).toBe("A4");
    expect(body.works[1].selectedSizePrice).toBe(55);
  });

  it("shows a from-price band", async () => {
    const { body } = await call();
    expect(body.collection.bundlePriceBand).toBe("From £120");
  });

  it("reports the cheapest tier as the bundle price", async () => {
    const { body } = await call();
    expect(body.collection.bundlePrice).toBe(120);
  });

  it("falls back to a work's first size when a tier pins a size it no longer has", async () => {
    // The artist renamed a size after building the tier. The tier price is
    // typed, not derived, so this is a display problem only and the page should
    // still render rather than showing a blank size.
    setupDb({
      size_tiers: [
        { label: "Small", price: 120, workSizes: [{ workId: "w-1", sizeLabel: "A6" }] },
      ],
    });
    const { body } = await call();
    expect(body.works[0].selectedSize).toBe("A4");
    expect(body.works[0].selectedSizePrice).toBe(55);
  });
});

// ── The seed catalogue's collections (2026-09-06) ───────────────────────────
//
// A sample collection has no database row, so without a fallback its card on
// /browse linked to a 404. The detail route serves it from the compiled-in
// catalogue instead, behind the same SEED_CATALOG flag that decides whether
// the card was ever shown.
describe("GET /api/collections/[id] for a sample collection", () => {
  const call = async (id: string) => {
    const res = await GET(new Request(`http://localhost/api/collections/${id}`), {
      params: Promise.resolve({ id }),
    });
    return { status: res.status, body: await res.json() };
  };

  beforeEach(() => setupEmptyDb());

  it("serves a sample collection the database does not have", async () => {
    const { status, body } = await call("seed-james-okafor-concrete-poems");
    expect(status).toBe(200);
    expect(body.collection.name).toBe("Concrete Poems");
    expect(body.collection.artistName).toBe("James Okafor");
  });

  it("marks it as a sample, so the page can say so", async () => {
    const { body } = await call("seed-james-okafor-concrete-poems");
    expect(body.collection.isSeedCollection).toBe(true);
  });

  it("returns its tiers and its works", async () => {
    const { body } = await call("seed-james-okafor-concrete-poems");
    expect(body.collection.sizeTiers.map((t: { label: string }) => t.label)).toEqual([
      "Small",
      "Medium",
      "Large",
    ]);
    expect(body.works).toHaveLength(3);
    expect(body.works[0].pricing.length).toBeGreaterThan(1);
  });

  it("opens on the cheapest tier, as the database path does", async () => {
    const { body } = await call("seed-james-okafor-concrete-poems");
    expect(body.collection.bundlePrice).toBe(595);
    expect(body.works.every((w: { selectedSize: string }) => w.selectedSize === '8×10" (A4)')).toBe(
      true,
    );
  });

  it("serves an untiered sample with its single price", async () => {
    const { body } = await call("seed-priya-sharma-soft-boundaries");
    expect(body.collection.sizeTiers).toEqual([]);
    expect(body.collection.bundlePriceBand).toBe("£750");
  });

  it("404s for an unknown id", async () => {
    const { status } = await call("not-a-collection");
    expect(status).toBe(404);
  });

  it("404s for a sample when the seed catalogue is switched off", async () => {
    // The card would not have been rendered either, so a guessed URL must not
    // be a way back into a hidden catalogue.
    isFlagOnMock.mockReturnValue(false);
    const { status } = await call("seed-james-okafor-concrete-poems");
    expect(status).toBe(404);
  });

  it("prefers the database row when one exists with the same id", async () => {
    setupDb({ id: "seed-james-okafor-concrete-poems", name: "The real one" });
    const { body } = await call("seed-james-okafor-concrete-poems");
    expect(body.collection.name).toBe("The real one");
    expect(body.collection.isSeedCollection).toBeFalsy();
  });
});
