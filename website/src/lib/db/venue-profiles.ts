import { supabase } from "@/lib/supabase";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
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
    interestedInLocalArtists: true,
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

export async function getVenueProfileByUserId(userId: string) {
  const db = getSupabaseAdmin();
  const { data } = await db
    .from("venue_profiles")
    .select("*")
    .eq("user_id", userId)
    .single();

  return data as DbVenueProfile | null;
}

export async function getVenueProfileBySlug(slug: string) {
  const { data } = await supabase
    .from("venue_profiles")
    .select("*")
    .eq("slug", slug)
    .single();

  return data as DbVenueProfile | null;
}

export async function upsertVenueProfile(
  userId: string,
  data: Partial<Omit<DbVenueProfile, "id" | "user_id">>
) {
  const db = getSupabaseAdmin();
  const { data: existing } = await db
    .from("venue_profiles")
    .select("id")
    .eq("user_id", userId)
    .single();

  if (existing) {
    let { error } = await db
      .from("venue_profiles")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    // Retry without potentially missing columns if update fails. `images`
    // is added in migration 022 and may not exist in older environments.
    if (error) {
      // Strip columns that may not exist in older schemas (added in migrations 022, 028).
      const {
        preferred_sizes,
        interested_in_local_artists,
        images,
        display_wall_space,
        display_lighting,
        display_install_notes,
        display_rotation_frequency,
        ...safeData
      } = data as Record<string, unknown>;
      const retry = await db
        .from("venue_profiles")
        .update({ ...safeData, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
      error = retry.error;
    }
    return { error };
  } else {
    const {
      preferred_sizes,
      interested_in_local_artists,
      images,
      display_wall_space,
      display_lighting,
      display_install_notes,
      display_rotation_frequency,
      ...safeData
    } = data as Record<string, unknown>;
    const { error } = await db
      .from("venue_profiles")
      .insert({ ...safeData, user_id: userId });
    return { error };
  }
}
