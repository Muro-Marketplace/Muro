// Server-only venue-profile DB helpers (use the service-role admin client).
// The pure transform helpers (DbVenueProfile, dbVenueToVenue) live in
// venue-profiles-transform.ts so that client components can import them
// without pulling the admin client into the browser bundle.
import { supabase } from "@/lib/supabase";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { DbVenueProfile } from "./venue-profiles-transform";

// Re-export types and transform for server-side callers that used to import
// everything from this single file.
export type { DbVenueProfile } from "./venue-profiles-transform";
export { dbVenueToVenue } from "./venue-profiles-transform";

export async function getVenueProfileByUserId(userId: string) {
  const db = getSupabaseAdmin();
  const { data } = await db
    .from("venue_profiles")
    .select("*")
    .eq("user_id", userId)
    .single();

  return data as DbVenueProfile | null;
}

// Public, anon-readable venue lookup. Selects only non-PII columns because
// migration 071 revokes anon SELECT on the contact-PII columns (email, phone,
// address_line1/2, postcode, contact_name); a `select("*")` here as the anon
// client would now be denied. Server callers that need PII use
// getVenueProfileByUserId (service-role).
const VENUE_PUBLIC_COLUMNS =
  "id, user_id, slug, name, type, location, city, wall_space, description, image, images, approximate_footfall, audience_type, interested_in_free_loan, interested_in_revenue_share, interested_in_direct_purchase, interested_in_collections, preferred_styles, preferred_themes, message_notifications_enabled, display_wall_space, display_lighting, display_install_notes, display_rotation_frequency";

export async function getVenueProfileBySlug(slug: string) {
  const { data } = await supabase
    .from("venue_profiles")
    .select(VENUE_PUBLIC_COLUMNS)
    .eq("slug", slug)
    .single();

  return data as unknown as Partial<DbVenueProfile> | null;
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
