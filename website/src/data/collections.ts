export interface CollectionWorkSize {
  workId: string;
  sizeLabel: string;
}

/**
 * One optional size a collection is sold in, with its own price and its own
 * pinned size for every work. See src/lib/collection-tiers.ts for the rules.
 */
export interface CollectionSizeTier {
  /** The artist's own word: "Small", "A3", "Gallery". */
  label: string;
  /** Bundle price for this tier, in pounds. Typed by the artist, not derived. */
  price: number;
  /** Optional buyer-facing note, e.g. "A4 prints, unframed". */
  description?: string;
  /** Pinned size per work for this tier. */
  workSizes: CollectionWorkSize[];
}

export interface ArtistCollection {
  id: string;
  artistSlug: string;
  artistName: string;
  name: string;
  description?: string;
  workIds: string[];
  /** Size chosen by the artist for each work included in the bundle.
      Only meaningful on an untiered collection; a tiered one pins its
      sizes inside each entry of `sizeTiers` instead. */
  workSizes?: CollectionWorkSize[];
  /** Optional sizes the collection is sold in, each with its own price.
      Empty or absent means the collection is sold at one price, which is
      how every collection behaved before tiers existed. */
  sizeTiers?: CollectionSizeTier[];
  bundlePrice: number;
  bundlePriceBand: string;
  /** Card image (square or 16:9). Falls back to bannerImage or work-preview grid. */
  thumbnail?: string;
  /** Wide hero image (16:9) for the collection detail page. */
  bannerImage?: string;
  /** Legacy single-image field used on cards before thumbnail/banner were split. */
  coverImage: string;
  available: boolean;
  /** True for a collection from the seed catalogue rather than a real
      artist. Drives the Sample pill, the same way `isSeedArtist` does on
      an artist. Set on the way out of the merge, never stored. */
  isSeedCollection?: boolean;
}

export const collections: ArtistCollection[] = [
  // Concrete Poems. A4 700, A3 1050, A2 1470 bought separately.
  {
    id: "seed-james-okafor-concrete-poems",
    artistSlug: "james-okafor",
    artistName: "James Okafor",
    name: "Concrete Poems",
    description:
      "Three Brutalist estates in the light James shoots them in, just after dawn. Hung together the geometry starts to rhyme.",
    workIds: ['james-okafor-1', 'james-okafor-5', 'james-okafor-6'],
    sizeTiers: [
    {
      label: "Small",
      price: 595,
      description: 'Three 8×10" prints, unframed',
      workSizes: [
        { workId: "james-okafor-1", sizeLabel: '8×10" (A4)' },
        { workId: "james-okafor-5", sizeLabel: '8×10" (A4)' },
        { workId: "james-okafor-6", sizeLabel: '8×10" (A4)' },
      ],
    },
    {
      label: "Medium",
      price: 890,
      description: 'Three 12×16" prints, unframed',
      workSizes: [
        { workId: "james-okafor-1", sizeLabel: '12×16" (A3)' },
        { workId: "james-okafor-5", sizeLabel: '12×16" (A3)' },
        { workId: "james-okafor-6", sizeLabel: '12×16" (A3)' },
      ],
    },
    {
      label: "Large",
      price: 1245,
      description: 'Three 16×24" prints, unframed',
      workSizes: [
        { workId: "james-okafor-1", sizeLabel: '16×24" (A2)' },
        { workId: "james-okafor-5", sizeLabel: '16×24" (A2)' },
        { workId: "james-okafor-6", sizeLabel: '16×24" (A2)' },
      ],
    },
    ],
    bundlePrice: 595,
    bundlePriceBand: "From £595",
    thumbnail: "https://picsum.photos/seed/james-okafor-1/900/600",
    bannerImage: "https://picsum.photos/seed/james-okafor-6/1600/900",
    coverImage: "https://picsum.photos/seed/james-okafor-1/900/600",
    available: true,
  },

  // Brixton, Every Sunday. A4 560, A3 840 bought separately.
  {
    id: "seed-sofia-ruiz-brixton-sundays",
    artistSlug: "sofia-ruiz",
    artistName: "Sofia Ruiz",
    name: "Brixton, Every Sunday",
    description:
      "Four frames from one street over a single summer. Sofia shot the same corner most weekends until the light and the faces started to repeat.",
    workIds: ['sofia-ruiz-1', 'sofia-ruiz-2', 'sofia-ruiz-3', 'sofia-ruiz-4'],
    sizeTiers: [
    {
      label: "Small",
      price: 475,
      description: 'Four 8×10" prints, unframed',
      workSizes: [
        { workId: "sofia-ruiz-1", sizeLabel: '8×10" (A4)' },
        { workId: "sofia-ruiz-2", sizeLabel: '8×10" (A4)' },
        { workId: "sofia-ruiz-3", sizeLabel: '8×10" (A4)' },
        { workId: "sofia-ruiz-4", sizeLabel: '8×10" (A4)' },
      ],
    },
    {
      label: "Medium",
      price: 710,
      description: 'Four 12×16" prints, unframed',
      workSizes: [
        { workId: "sofia-ruiz-1", sizeLabel: '12×16" (A3)' },
        { workId: "sofia-ruiz-2", sizeLabel: '12×16" (A3)' },
        { workId: "sofia-ruiz-3", sizeLabel: '12×16" (A3)' },
        { workId: "sofia-ruiz-4", sizeLabel: '12×16" (A3)' },
      ],
    },
    ],
    bundlePrice: 475,
    bundlePriceBand: "From £475",
    thumbnail: "https://picsum.photos/seed/sofia-ruiz-1/900/600",
    bannerImage: "https://picsum.photos/seed/sofia-ruiz-3/1600/900",
    coverImage: "https://picsum.photos/seed/sofia-ruiz-1/900/600",
    available: true,
  },

  // Impermanence. A4 540, A3 810, A2 1134 bought separately.
  {
    id: "seed-yuki-tanaka-impermanence",
    artistSlug: "yuki-tanaka",
    artistName: "Yuki Tanaka",
    name: "Impermanence",
    description:
      "A petal, a frost, a study. Yuki works the same subject until it changes, and these three are what survived the edit.",
    workIds: ['yuki-tanaka-1', 'yuki-tanaka-3', 'yuki-tanaka-5'],
    sizeTiers: [
    {
      label: "Small",
      price: 460,
      description: 'Three 8×10" prints, unframed',
      workSizes: [
        { workId: "yuki-tanaka-1", sizeLabel: '8×10" (A4)' },
        { workId: "yuki-tanaka-3", sizeLabel: '8×10" (A4)' },
        { workId: "yuki-tanaka-5", sizeLabel: '8×10" (A4)' },
      ],
    },
    {
      label: "Medium",
      price: 690,
      description: 'Three 12×16" prints, unframed',
      workSizes: [
        { workId: "yuki-tanaka-1", sizeLabel: '12×16" (A3)' },
        { workId: "yuki-tanaka-3", sizeLabel: '12×16" (A3)' },
        { workId: "yuki-tanaka-5", sizeLabel: '12×16" (A3)' },
      ],
    },
    {
      label: "Large",
      price: 960,
      description: 'Three 16×24" prints, unframed',
      workSizes: [
        { workId: "yuki-tanaka-1", sizeLabel: '16×24" (A2)' },
        { workId: "yuki-tanaka-3", sizeLabel: '16×24" (A2)' },
        { workId: "yuki-tanaka-5", sizeLabel: '16×24" (A2)' },
      ],
    },
    ],
    bundlePrice: 460,
    bundlePriceBand: "From £460",
    thumbnail: "https://picsum.photos/seed/yuki-tanaka-1/900/600",
    bannerImage: "https://picsum.photos/seed/yuki-tanaka-3/1600/900",
    coverImage: "https://picsum.photos/seed/yuki-tanaka-1/900/600",
    available: true,
  },

  // Soft Boundaries. Deliberately untiered: one price, one size per work, which
  // is what every collection was before size tiers, and still a valid choice.
  {
    id: "seed-priya-sharma-soft-boundaries",
    artistSlug: "priya-sharma",
    artistName: "Priya Sharma",
    name: "Soft Boundaries",
    description:
      "Three abstracts that hold their edge from across a room and lose it up close. Sold at one size, as a set.",
    workIds: ['priya-sharma-1', 'priya-sharma-3', 'priya-sharma-5'],
    workSizes: [
      { workId: "priya-sharma-1", sizeLabel: '12×16" (A3)' },
      { workId: "priya-sharma-3", sizeLabel: '12×16" (A3)' },
      { workId: "priya-sharma-5", sizeLabel: '12×16" (A3)' },
    ],
    bundlePrice: 750,
    bundlePriceBand: "£750",
    thumbnail: "https://picsum.photos/seed/priya-sharma-1/900/600",
    bannerImage: "https://picsum.photos/seed/priya-sharma-5/1600/900",
    coverImage: "https://picsum.photos/seed/priya-sharma-1/900/600",
    available: true,
  },
];

export function getCollectionById(id: string): ArtistCollection | undefined {
  return collections.find((c) => c.id === id);
}

export function getCollectionsByArtist(artistSlug: string): ArtistCollection[] {
  return collections.filter((c) => c.artistSlug === artistSlug);
}
