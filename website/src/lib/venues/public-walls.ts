/**
 * Public venue walls, the read every artist-facing wall surface shares.
 *
 * A venue publishes a wall with `walls.is_public_on_profile`. Three places
 * then read it: the venue's public profile (`/api/venues/[slug]/profile`),
 * the single-wall read behind the artist's propose page
 * (`/api/venues/[slug]/walls/[wallId]`) and the proposal upload under it.
 * The rule for "may an artist see this wall" lives here once, so the three
 * cannot drift: the wall must belong to the venue with that slug AND be
 * public. Anything else reads as missing, never as forbidden, so a wall id
 * cannot be probed.
 *
 * Wall photos live in the private `wall-photos` bucket, so an uploaded wall
 * is served through a one-hour signed URL minted here.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getWallById } from "@/lib/visualizer/walls-db";
import type { Wall } from "@/lib/visualizer/types";

export const WALL_PHOTOS_BUCKET = "wall-photos";
/** Long enough for an editor session, short enough that a leaked URL expires. */
export const WALL_PHOTO_URL_TTL_SECONDS = 60 * 60;

/** What the public surfaces are allowed to say about a wall. */
export interface PublicVenueWall {
  id: string;
  name: string;
  width_cm: number;
  height_cm: number;
  kind: "preset" | "uploaded";
  preset_id: string | null;
  wall_color_hex: string;
  /** Signed, one-hour URL of the wall photo (uploaded walls only). */
  source_image_url?: string;
}

export interface PublicVenueWallLookup {
  venue: { user_id: string; slug: string; name: string | null };
  wall: Wall;
}

/**
 * Signed display URL for a wall photo path, or null when there is no path
 * or signing fails (callers degrade to the wall colour).
 */
export async function signWallPhotoUrl(
  db: SupabaseClient,
  path: string | null | undefined,
): Promise<string | null> {
  if (!path) return null;
  try {
    const { data, error } = await db.storage
      .from(WALL_PHOTOS_BUCKET)
      .createSignedUrl(path, WALL_PHOTO_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

/**
 * The wall `wallId` if, and only if, it belongs to the venue at `slug` and
 * that venue has put it on its profile. Null for every other case: unknown
 * slug, unknown wall, someone else's wall, private wall.
 */
export async function findPublicVenueWall(
  slug: string,
  wallId: string,
  client?: SupabaseClient,
): Promise<PublicVenueWallLookup | null> {
  if (!slug || !wallId) return null;
  const db = client ?? getSupabaseAdmin();
  const { data: venue, error } = await db
    .from("venue_profiles")
    .select("user_id, slug, name")
    .eq("slug", slug)
    .maybeSingle<{ user_id: string | null; slug: string; name: string | null }>();
  if (error) {
    console.warn("[public-walls] venue lookup failed:", error.message);
    return null;
  }
  if (!venue?.user_id) return null;

  const wall = await getWallById(wallId, db);
  if (!wall || wall.user_id !== venue.user_id || !wall.is_public_on_profile) return null;

  return { venue: { user_id: venue.user_id, slug: venue.slug, name: venue.name }, wall };
}

/** The public projection of a wall, with the photo signed when there is one. */
export async function toPublicVenueWall(
  wall: Wall,
  client?: SupabaseClient,
): Promise<PublicVenueWall> {
  const out: PublicVenueWall = {
    id: wall.id,
    name: wall.name,
    width_cm: wall.width_cm,
    height_cm: wall.height_cm,
    kind: wall.kind,
    preset_id: wall.preset_id,
    wall_color_hex: wall.wall_color_hex,
  };
  if (wall.kind === "uploaded" && wall.source_image_path) {
    const url = await signWallPhotoUrl(client ?? getSupabaseAdmin(), wall.source_image_path);
    if (url) out.source_image_url = url;
  }
  return out;
}
