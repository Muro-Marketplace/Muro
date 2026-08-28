// Pure data-transformation helpers for venue profiles.
// No Supabase imports — safe to import from client components.
import type { Venue } from "@/data/venues";

export interface DbVenueProfile {
  id: string;
  user_id: string;
  slug: string;
  name: string;
  type: string;
  location: string;
  contact_name: string;
  email: string;
  phone: string;
  address_line1: string;
  address_line2: string;
  city: string;
  postcode: string;
  wall_space: string;
  description: string;
  image: string;
  /** Gallery of space photos uploaded by the venue. Added in migration 022. */
  images?: string[] | null;
  approximate_footfall: string;
  audience_type: string;
  interested_in_free_loan: boolean;
  interested_in_revenue_share: boolean;
  interested_in_direct_purchase: boolean;
  interested_in_collections: boolean;
  /** Row 23a / migration 103. Nullable: NULL means the venue never answered. */
  interested_in_local_artists?: boolean | null;
  preferred_styles: string[];
  preferred_themes: string[];
  message_notifications_enabled?: boolean;
  /** Display Needs, added in migration 028. All optional, nullable. */
  display_wall_space?: string | null;
  display_lighting?: string | null;
  display_install_notes?: string | null;
  display_rotation_frequency?: string | null;
}

export function dbVenueToVenue(v: DbVenueProfile): Venue {
  return {
    slug: v.slug,
    name: v.name,
    type: v.type,
    location: v.location || v.city || "",
    coordinates: { lat: 51.5074, lng: -0.1278 },
    approximateFootfall: v.approximate_footfall || "50-100/day",
    audienceType: v.audience_type || "",
    interestedInFreeLoan: v.interested_in_free_loan,
    interestedInRevenueShare: v.interested_in_revenue_share,
    interestedInDirectPurchase: v.interested_in_direct_purchase,
    interestedInCollections: v.interested_in_collections,
    // Row 23a: was hardcoded `true`, so every venue was told they had said yes,
    // including the ones who unticked it. NULL means the venue has never
    // answered, and `?? false` reads that as "not stated" for display purposes;
    // the column itself keeps the three-state distinction.
    interestedInLocalArtists: v.interested_in_local_artists ?? false,
    interestedInFramedWork: true,
    interestedInRotatingArtwork: true,
    wallSpace: v.wall_space,
    preferredStyles: v.preferred_styles || [],
    preferredThemes: v.preferred_themes || [],
    description: v.description,
    image: v.image || `https://picsum.photos/seed/${v.slug}/600/400`,
    images: Array.isArray(v.images) ? v.images : [],
    displayWallSpace: v.display_wall_space || "",
    displayLighting: v.display_lighting || "",
    displayInstallNotes: v.display_install_notes || "",
    displayRotationFrequency: v.display_rotation_frequency || "",
  };
}
