// Server-only venue-profile DB helpers (use the service-role admin client).
// The pure transform helpers (DbVenueProfile, dbVenueToVenue) live in
// venue-profiles-transform.ts so that client components can import them
// without pulling the admin client into the browser bundle.
import { supabase } from "@/lib/supabase";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { assertNoServerOwned, VENUE_PROFILE_SERVER_OWNED } from "@/lib/db/writable-fields";
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
  data: Partial<Omit<DbVenueProfile, "id" | "user_id">>,
  opts: { allowServerOwned?: readonly string[] } = {},
) {
  // A7 (E45). Enforced HERE so no caller can skip it. A call site that
  // legitimately sets a server-owned column with a server-computed value names it
  // in allowServerOwned; everything else is refused.
  //
  // E45 was `{ ...body }` into a service-role update: squat another venue's slug,
  // self-grant a paid subscription_plan, write the stripe_* columns, or set
  // user_id, which lands in SET while the WHERE still matches the caller and hands
  // your own row to another account.
  assertNoServerOwned(
    data as Record<string, unknown>,
    VENUE_PROFILE_SERVER_OWNED,
    "venue_profiles",
    opts.allowServerOwned,
  );

  const db = getSupabaseAdmin();
  const { data: existing } = await db
    .from("venue_profiles")
    .select("id")
    .eq("user_id", userId)
    .single();

  if (existing) {
    // E42-c: no strip-and-retry. Migrations 022/028 are applied (images + display_*
    // exist in prod), so the old "on any error, drop those columns and retry" path
    // was pure data-loss — a constraint failure on an unrelated field silently
    // dropped the venue's photos and display details and STILL returned success.
    // Surface the error instead.
    //
    // user_id is pinned in the SET as well as matched in the WHERE (E45, A7). The
    // WHERE alone does not stop a caller-supplied user_id landing in SET and
    // reassigning the row; pinning it makes that impossible even if a future caller
    // forgets the allowlist.
    const { error } = await db
      .from("venue_profiles")
      .update({ ...data, user_id: userId, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    return { error };
  } else {
    // E42-c: the insert branch used to strip those same columns UNCONDITIONALLY, so a
    // brand-new venue could never persist photos or display details on first save.
    // Insert the data as-is.
    const { error } = await db
      .from("venue_profiles")
      .insert({ ...data, user_id: userId });
    return { error };
  }
}
