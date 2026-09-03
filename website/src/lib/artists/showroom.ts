/**
 * An artist's public showroom: the walls they built in /artist-portal/showroom
 * and ticked "Show on my profile". Each carries the picture the artist saved
 * from Preview (wall_layouts.last_render_id -> wall_renders), so the public
 * page shows the wall exactly as the editor did.
 *
 * Both readers degrade to nothing: a lookup failure, or the visualiser being
 * off, means no showroom rather than an error on a public page.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isFlagOn } from "@/lib/feature-flags";
import { getWallPreviewUrls } from "@/lib/visualizer/walls-db";
import { signWallPhotoUrl } from "@/lib/venues/public-walls";

export interface PublicShowroomWall {
  id: string;
  name: string;
  width_cm: number;
  height_cm: number;
  kind: "preset" | "uploaded";
  wall_color_hex: string;
  /** The saved preview (the wall with the work on it), when the artist saved one. */
  preview_image_url: string | null;
  /** Signed URL of the bare wall photo, for uploaded walls without a preview. */
  source_image_url: string | null;
}

type WallRow = {
  id: string;
  user_id: string;
  name: string | null;
  width_cm: number;
  height_cm: number;
  kind: "preset" | "uploaded";
  wall_color_hex: string | null;
  source_image_path: string | null;
};

export async function getPublicShowroomWalls(
  userId: string | null | undefined,
  client?: SupabaseClient,
): Promise<PublicShowroomWall[]> {
  if (!userId || !isFlagOn("WALL_VISUALIZER_V1")) return [];
  try {
    const db = client ?? getSupabaseAdmin();
    const { data, error } = await db
      .from("walls")
      .select("id, user_id, name, width_cm, height_cm, kind, wall_color_hex, source_image_path")
      .eq("user_id", userId)
      .eq("owner_type", "artist")
      .eq("is_public_on_profile", true)
      .order("updated_at", { ascending: false });
    if (error || !Array.isArray(data) || data.length === 0) return [];
    const rows = data as WallRow[];
    const previews = await getWallPreviewUrls(
      rows.map((w) => ({ id: w.id, user_id: w.user_id })),
      db,
    );
    const out: PublicShowroomWall[] = [];
    for (const w of rows) {
      const preview = previews[w.id] ?? null;
      const photo =
        !preview && w.kind === "uploaded" ? await signWallPhotoUrl(db, w.source_image_path) : null;
      out.push({
        id: w.id,
        name: (w.name ?? "").trim() || "Showroom wall",
        width_cm: w.width_cm,
        height_cm: w.height_cm,
        kind: w.kind,
        wall_color_hex: w.wall_color_hex || "F5F1EB",
        preview_image_url: preview,
        source_image_url: photo,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Public showroom wall counts keyed by artist slug, for the browse grid's
 * "View showroom" button. Two queries for the whole grid.
 */
export async function getShowroomWallCountsBySlug(
  client?: SupabaseClient,
): Promise<Record<string, number>> {
  if (!isFlagOn("WALL_VISUALIZER_V1")) return {};
  try {
    const db = client ?? getSupabaseAdmin();
    const { data: walls, error: wallsError } = await db
      .from("walls")
      .select("user_id")
      .eq("owner_type", "artist")
      .eq("is_public_on_profile", true);
    if (wallsError || !Array.isArray(walls) || walls.length === 0) return {};
    const countByUser: Record<string, number> = {};
    for (const row of walls as Array<{ user_id: string | null }>) {
      if (!row.user_id) continue;
      countByUser[row.user_id] = (countByUser[row.user_id] ?? 0) + 1;
    }
    const { data: profiles, error: profilesError } = await db
      .from("artist_profiles")
      .select("slug, user_id")
      .in("user_id", Object.keys(countByUser));
    if (profilesError || !Array.isArray(profiles)) return {};
    const out: Record<string, number> = {};
    for (const p of profiles as Array<{ slug: string | null; user_id: string | null }>) {
      if (p.slug && p.user_id && countByUser[p.user_id]) out[p.slug] = countByUser[p.user_id];
    }
    return out;
  } catch {
    return {};
  }
}
