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
}

export const collections: ArtistCollection[] = [];

export function getCollectionById(id: string): ArtistCollection | undefined {
  return collections.find((c) => c.id === id);
}

export function getCollectionsByArtist(artistSlug: string): ArtistCollection[] {
  return collections.filter((c) => c.artistSlug === artistSlug);
}
