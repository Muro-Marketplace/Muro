export interface CollectionWorkSize {
  workId: string;
  sizeLabel: string;
}

export interface ArtistCollection {
  id: string;
  artistSlug: string;
  artistName: string;
  name: string;
  description?: string;
  workIds: string[];
  /** Size chosen by the artist for each work included in the bundle. */
  workSizes?: CollectionWorkSize[];
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
