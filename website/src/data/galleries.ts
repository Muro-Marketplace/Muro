import { artists, type Artist, type WorkOrientation, type SizePricing } from "./artists";
import type { DisciplineId } from "./categories";

export interface GalleryWork {
  id: string;
  title: string;
  artistName: string;
  artistSlug: string;
  medium: string;
  dimensions: string;
  priceBand: string;
  pricing: SizePricing[];
  available: boolean;
  image: string;
  themes: string[];
  orientation?: WorkOrientation;
  // Artist-level fields for filtering
  artistLocation: string;
  artistCoordinates: { lat: number; lng: number } | null;
  artistPrimaryMedium: string;
  artistDiscipline?: DisciplineId;
  artistSubStyles?: string[];
  offersOriginals: boolean;
  offersPrints: boolean;
  offersFramed: boolean;
  openToFreeLoan: boolean;
  openToRevenueShare: boolean;
  revenueSharePercent?: number;
  openToOutrightPurchase: boolean;
  /** Artist's subscription plan, used to put Pro / Premium works
   *  first in the marketplace's "Featured" sort. Mirrors the Featured
   *  chip on the artist card. */
  artistSubscriptionPlan?: string;
  /** Founding-artist flag, secondary tiebreaker for Featured sort. */
  artistIsFounding?: boolean;
  /** ISO timestamp from `artist_works.created_at`. Powers the
   *  "Recently listed" sort on the marketplace (#5). */
  createdAt?: string;
}

/** Build gallery works from static seed data (fallback) */
export function getGalleryWorks(): GalleryWork[] {
  return artistsToGalleryWorks(artists);
}

/** Build gallery works from any artist list (merged static + DB) */
export function artistsToGalleryWorks(allArtists: Artist[]): GalleryWork[] {
  return allArtists.flatMap((artist) =>
    artist.works.map((work) => ({
      id: work.id,
      title: work.title,
      artistName: artist.name,
      artistSlug: artist.slug,
      medium: work.medium,
      dimensions: work.dimensions,
      priceBand: work.priceBand,
      pricing: work.pricing,
      available: work.available,
      image: work.image,
      themes: artist.themes,
      orientation: work.orientation,
      artistLocation: artist.location,
      artistCoordinates: artist.coordinates,
      artistPrimaryMedium: artist.primaryMedium,
      artistDiscipline: artist.discipline,
      artistSubStyles: artist.subStyles,
      offersOriginals: artist.offersOriginals,
      offersPrints: artist.offersPrints,
      offersFramed: artist.offersFramed,
      openToFreeLoan: artist.openToFreeLoan,
      openToRevenueShare: artist.openToRevenueShare,
      revenueSharePercent: artist.revenueSharePercent,
      openToOutrightPurchase: artist.openToOutrightPurchase,
      artistSubscriptionPlan: artist.subscriptionPlan,
      artistIsFounding: artist.isFoundingArtist,
      createdAt: work.createdAt,
    }))
  );
}
