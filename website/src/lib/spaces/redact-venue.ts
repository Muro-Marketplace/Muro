// Venue payload redaction for gated viewers.
//
// The listing card on /spaces displays type + location + arrangement
// flags + preferred styles/themes openly to everyone (these are the
// teaser fields that drive subscription). Everything else (the venue
// name, the descriptive copy, the gallery, the display-needs notes) is
// protected and only ever leaves the server when the viewer is allowed.
//
// `redactVenueForListing` strips protected fields for a single row;
// `redactVenueDetail` does the same for the single-venue detail
// payload (a different shape, snake_case from the DB columns).
//
// Both functions are pure and side-effect free so callers can compose
// them with map() and trust the return is safe to ship over the wire.

export interface DemandVenuePublic {
  slug: string;
  name: string;
  type: string;
  location: string;
  coordinates: { lat: number; lng: number } | null;
  wallSpace: string;
  approximateFootfall: string;
  preferredStyles: string[];
  preferredThemes: string[];
  interestedInFreeLoan: boolean;
  interestedInRevenueShare: boolean;
  interestedInDirectPurchase: boolean;
  description: string;
  image: string;
  images: string[];
  displayWallSpace: string;
  displayLighting: string;
  displayInstallNotes: string;
  displayRotationFrequency: string;
}

export function redactVenueForListing<T extends DemandVenuePublic>(
  venue: T,
): T {
  return {
    ...venue,
    name: "",
    description: "",
    image: "",
    images: [],
    displayWallSpace: "",
    displayLighting: "",
    displayInstallNotes: "",
    displayRotationFrequency: "",
  };
}

export interface VenueDetailRow {
  slug: string;
  name: string;
  type: string | null;
  location?: string | null;
  city?: string | null;
  postcode?: string | null;
  wall_space?: string | null;
  description?: string | null;
  image?: string | null;
  images?: string[] | null;
  approximate_footfall?: string | null;
  audience_type?: string | null;
  interested_in_free_loan?: boolean | null;
  interested_in_revenue_share?: boolean | null;
  interested_in_direct_purchase?: boolean | null;
  preferred_styles?: string[] | null;
  preferred_themes?: string[] | null;
  display_wall_space?: string | null;
  display_lighting?: string | null;
  display_install_notes?: string | null;
  display_rotation_frequency?: string | null;
}

export function redactVenueDetail<T extends VenueDetailRow>(venue: T): T {
  return {
    ...venue,
    name: "",
    description: "",
    image: null,
    images: [],
    display_wall_space: null,
    display_lighting: null,
    display_install_notes: null,
    display_rotation_frequency: null,
  };
}
