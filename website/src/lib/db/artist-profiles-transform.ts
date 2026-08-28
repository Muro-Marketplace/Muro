// Pure data-transformation helpers for artist profiles.
// No Supabase imports — safe to import from client components.
import type { Artist, SizePricing } from "@/data/artists";
import type { DisciplineId } from "@/data/categories";
import { normalisePriceBand } from "./normalise-price-band";

export { normalisePriceBand };

export interface DbArtistProfile {
  id: string;
  user_id: string;
  slug: string;
  name: string;
  profile_image: string;
  banner_image: string;
  short_bio: string;
  extended_bio: string;
  location: string;
  primary_medium: string;
  style_tags: string[];
  themes: string[];
  /** Phase 3 taxonomy. */
  discipline?: string | null;
  sub_styles?: string[] | null;
  instagram: string;
  website: string;
  offers_originals: boolean;
  offers_prints: boolean;
  offers_framed: boolean;
  available_sizes: string[];
  open_to_commissions: boolean;
  open_to_free_loan: boolean;
  open_to_revenue_share: boolean;
  revenue_share_percent: number;
  open_to_outright_purchase: boolean;
  /** Migration 055: artist has opted in to in-person collection.
   *  Drives the "Collect from artist" fulfilment option at checkout. */
  offers_pickup?: boolean | null;
  can_provide_frames: boolean;
  can_arrange_framing: boolean;
  delivery_radius: string;
  venue_types_suited_for: string[];
  is_founding_artist: boolean;
  profile_color: string;
  postcode?: string;
  lat?: number | null;
  lng?: number | null;
  message_notifications_enabled?: boolean;
  subscription_plan?: string;
  /** Phase 2.5 B4: surface the subscription_status so the merged
   *  /browse query can filter out cancelled / past_due artists. */
  subscription_status?: string;
  default_shipping_price?: number | null;
  ships_internationally?: boolean;
  international_shipping_price?: number | null;
  /** "pending" for new claim-flow profiles; "approved" once admin reviews. */
  review_status?: "pending" | "approved" | "rejected";
  approved_at?: string | null;
  /** Migration 056: optional theme overrides for the public profile and
   *  QR labels. Premium+ artists set them via the portal; for Core
   *  they're ignored at render time and defaults are used. */
  profile_theme?: string | null;
  label_theme?: string | null;
}

export interface DbArtistWork {
  id: string;
  artist_id: string;
  title: string;
  medium: string;
  dimensions: string;
  price_band: string;
  pricing: SizePricing[];
  available: boolean;
  color: string;
  image: string;
  orientation: string;
  sort_order: number;
  shipping_price?: number | null;
  in_store_price?: number | null;
  quantity_available?: number | null;
  frame_options?: { label: string; priceUplift: number }[];
  description?: string;
  images?: string[];
  /** Postgres `timestamptz`, ISO string from PostgREST. Powers the
   *  marketplace "Recently listed" sort (#5). */
  created_at?: string;
  /** Migration 038: denormalised venue display name and active placement
   *  pointer. Kept in sync by the placements PATCH handler. */
  placed_at_venue?: string | null;
  /** T9 / N1: the LIVE placement behind the collect-from-venue CTA, joined in
   *  getArtistProfileBySlug. Null when the work is not on a wall. */
  current_placement?: {
    id: string;
    venueSlug: string | null;
    venueName: string | null;
    status: string | null;
    collectionAddress: string | null;
    placedSizeLabel: string | null;
  } | null;
  current_placement_id?: string | null;
}

/** Convert a DB profile row + works to the Artist shape used everywhere in the app */
export function dbProfileToArtist(profile: DbArtistProfile, works: DbArtistWork[]): Artist {
  return {
    slug: profile.slug,
    name: profile.name,
    profileColor: profile.profile_color,
    shortBio: profile.short_bio,
    extendedBio: profile.extended_bio,
    location: profile.location,
    primaryMedium: profile.primary_medium,
    styleTags: profile.style_tags || [],
    discipline: (profile.discipline || undefined) as DisciplineId | undefined,
    subStyles: profile.sub_styles || [],
    instagram: profile.instagram || "",
    website: profile.website || undefined,
    offersOriginals: profile.offers_originals,
    offersPrints: profile.offers_prints,
    offersFramed: profile.offers_framed,
    availableSizes: profile.available_sizes || [],
    openToCommissions: profile.open_to_commissions ?? true,
    isFoundingArtist: profile.is_founding_artist,
    themes: profile.themes || [],
    deliveryRadius: profile.delivery_radius,
    // Default to "open" when the DB flag is null/undefined. Legacy artist
    // rows created before these columns existed were being filtered out
    // from venue arrangement filters (#10) even though the artist hadn't
    // opted out. Better to show them and let the venue enquire than to
    // hide them by default.
    openToFreeLoan: profile.open_to_free_loan ?? true,
    openToRevenueShare: profile.open_to_revenue_share ?? true,
    revenueSharePercent: profile.revenue_share_percent,
    openToOutrightPurchase: profile.open_to_outright_purchase ?? true,
    offersPickup: profile.offers_pickup ?? false,
    canProvideFrames: profile.can_provide_frames,
    canArrangeFraming: profile.can_arrange_framing,
    venueTypesSuitedFor: profile.venue_types_suited_for || [],
    postcode: profile.postcode || "",
    coordinates:
      profile.lat != null && profile.lng != null
        ? { lat: profile.lat, lng: profile.lng }
        : null,
    image: profile.profile_image || `https://picsum.photos/seed/${profile.slug}/400/400`,
    bannerImage: profile.banner_image || undefined,
    // K5's cached counters are GONE (migration 114, owner decision 5). The
    // columns were written by nothing, wrong when live, and their transform
    // fields had no reader. Live counts come from lib/analytics/artist-totals.
    subscriptionPlan: profile.subscription_plan || undefined,
    subscriptionStatus: profile.subscription_status || undefined,
    shipsInternationally: profile.ships_internationally || false,
    internationalShippingPrice: profile.international_shipping_price ?? undefined,
    // Plan F #12: a profile reaches the public app only after
    // review_status flips to "approved" (legacy rows without the
    // column are treated as approved by getAllDatabaseArtists).
    // Either path means the artist passed admin review, so surface
    // that as a Verified trust signal on the public profile.
    isVerified:
      profile.review_status === "approved" || profile.review_status == null,
    profileTheme: profile.profile_theme || undefined,
    labelTheme: profile.label_theme || undefined,
    works: works.map((w) => ({
      id: w.id,
      title: w.title,
      medium: w.medium,
      dimensions: w.dimensions,
      // Some DB rows store price_band as a bare "180 – 320" without
      // the currency symbol, which surfaced for artists like Maya Chen
      // as a stripped-looking price. Normalise here so the public
      // surfaces always show the £ even when the source is missing it.
      priceBand: normalisePriceBand(w.price_band),
      pricing: w.pricing || [],
      available: w.available,
      color: w.color,
      image: w.image,
      images: Array.isArray(w.images) ? w.images : [],
      description: w.description || "",
      orientation: (w.orientation as "portrait" | "landscape" | "square") || undefined,
      shippingPrice: w.shipping_price ?? undefined,
      inStorePrice: w.in_store_price ?? undefined,
      quantityAvailable: w.quantity_available ?? undefined,
      frameOptions: Array.isArray(w.frame_options) ? w.frame_options : [],
      createdAt: w.created_at ?? undefined,
      placed_at_venue: w.placed_at_venue ?? null,
      currentPlacement: w.current_placement ?? null,
      current_placement_id: w.current_placement_id ?? null,
    })),
  };
}
