/**
 * Wall + layout DB helpers.
 *
 * Service-role accessors used by the /api/walls/* routes. These mirror
 * the conventions in src/lib/db/*, lightweight typed wrappers around
 * Supabase calls, with a single ownership check helper exposed.
 *
 * RLS:
 *   The visualizer tables (walls, wall_layouts, wall_renders) only have
 *   SELECT policies for the owner. All mutations happen through these
 *   helpers, which use the service-role client, RLS is bypassed by
 *   that key. The ownership checks below are the application-layer gate
 *   that takes the place of an RLS write policy.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getPublicRenderUrl } from "./renders-db";
import type {
  Wall,
  WallItem,
  WallLayout,
  WallOwnerType,
} from "./types";

interface DbWallRow {
  id: string;
  user_id: string;
  owner_type: WallOwnerType;
  name: string;
  kind: "preset" | "uploaded";
  preset_id: string | null;
  source_image_path: string | null;
  width_cm: number;
  height_cm: number;
  wall_color_hex: string;
  perspective_homography: unknown;
  segmentation_mask_path: string | null;
  notes: string | null;
  is_public_on_profile?: boolean | null;
  created_at: string;
  updated_at: string;
}

interface DbLayoutRow {
  id: string;
  wall_id: string;
  user_id: string;
  name: string;
  items: unknown;
  layout_hash: string | null;
  last_render_id: string | null;
  created_at: string;
  updated_at: string;
}

function db(client?: SupabaseClient): SupabaseClient {
  return client ?? getSupabaseAdmin();
}

// ── Wall create input ──────────────────────────────────────────────────

export interface CreatePresetWallInput {
  user_id: string;
  owner_type: WallOwnerType;
  name: string;
  preset_id: string;
  width_cm: number;
  height_cm: number;
  wall_color_hex: string;
  notes?: string | null;
}

export interface CreateUploadedWallInput {
  user_id: string;
  owner_type: WallOwnerType;
  name: string;
  source_image_path: string;
  width_cm: number;
  height_cm: number;
  wall_color_hex?: string;
  notes?: string | null;
}

// ── Wall queries ────────────────────────────────────────────────────────

export async function listWallsByUser(
  userId: string,
  client?: SupabaseClient,
): Promise<Wall[]> {
  const { data, error } = await db(client)
    .from("walls")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) {
    console.error("[walls-db] listWallsByUser failed:", error.message);
    return [];
  }
  return (data as DbWallRow[]).map(rowToWall);
}

export async function countWallsByUser(
  userId: string,
  client?: SupabaseClient,
): Promise<number> {
  const { count, error } = await db(client)
    .from("walls")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) {
    console.error("[walls-db] countWallsByUser failed:", error.message);
    return 0;
  }
  return count ?? 0;
}

export async function getWallById(
  wallId: string,
  client?: SupabaseClient,
): Promise<Wall | null> {
  const { data, error } = await db(client)
    .from("walls")
    .select("*")
    .eq("id", wallId)
    .maybeSingle<DbWallRow>();
  if (error) {
    console.error("[walls-db] getWallById failed:", error.message);
    return null;
  }
  return data ? rowToWall(data) : null;
}

export async function createPresetWall(
  input: CreatePresetWallInput,
  client?: SupabaseClient,
): Promise<Wall | null> {
  const { data, error } = await db(client)
    .from("walls")
    .insert({
      user_id: input.user_id,
      owner_type: input.owner_type,
      name: input.name,
      kind: "preset",
      preset_id: input.preset_id,
      width_cm: input.width_cm,
      height_cm: input.height_cm,
      wall_color_hex: input.wall_color_hex.replace(/^#/, "").toUpperCase(),
      notes: input.notes ?? null,
    })
    .select("*")
    .single<DbWallRow>();
  if (error) {
    console.error("[walls-db] createPresetWall failed:", error.message);
    return null;
  }
  return data ? rowToWall(data) : null;
}

export async function createUploadedWall(
  input: CreateUploadedWallInput,
  client?: SupabaseClient,
): Promise<Wall | null> {
  const { data, error } = await db(client)
    .from("walls")
    .insert({
      user_id: input.user_id,
      owner_type: input.owner_type,
      name: input.name,
      kind: "uploaded",
      source_image_path: input.source_image_path,
      width_cm: input.width_cm,
      height_cm: input.height_cm,
      wall_color_hex: (input.wall_color_hex ?? "FFFFFF")
        .replace(/^#/, "")
        .toUpperCase(),
      notes: input.notes ?? null,
    })
    .select("*")
    .single<DbWallRow>();
  if (error) {
    console.error("[walls-db] createUploadedWall failed:", error.message);
    return null;
  }
  return data ? rowToWall(data) : null;
}

export interface UpdateWallInput {
  name?: string;
  width_cm?: number;
  height_cm?: number;
  wall_color_hex?: string;
  notes?: string | null;
  /** Venue-only toggle (migration 037), publish on /venues/[slug]. */
  is_public_on_profile?: boolean;
}

export async function updateWall(
  wallId: string,
  patch: UpdateWallInput,
  client?: SupabaseClient,
): Promise<Wall | null> {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.width_cm !== undefined) update.width_cm = patch.width_cm;
  if (patch.height_cm !== undefined) update.height_cm = patch.height_cm;
  if (patch.wall_color_hex !== undefined) {
    update.wall_color_hex = patch.wall_color_hex.replace(/^#/, "").toUpperCase();
  }
  if (patch.notes !== undefined) update.notes = patch.notes;
  if (patch.is_public_on_profile !== undefined) {
    update.is_public_on_profile = patch.is_public_on_profile;
  }

  if (Object.keys(update).length === 0) {
    return getWallById(wallId, client);
  }

  const { data, error } = await db(client)
    .from("walls")
    .update(update)
    .eq("id", wallId)
    .select("*")
    .single<DbWallRow>();
  if (error) {
    console.error("[walls-db] updateWall failed:", error.message);
    return null;
  }
  return data ? rowToWall(data) : null;
}

export async function deleteWall(
  wallId: string,
  client?: SupabaseClient,
): Promise<boolean> {
  const { error } = await db(client).from("walls").delete().eq("id", wallId);
  if (error) {
    console.error("[walls-db] deleteWall failed:", error.message);
    return false;
  }
  return true;
}

// ── Layout queries ──────────────────────────────────────────────────────

/**
 * The wall owner's own layouts on a wall. `ownerUserId` is part of the
 * query, not a courtesy: an artist's wall proposal is a wall_layouts row on
 * the venue's wall too (see src/lib/placements/wall-proposals.ts), and it
 * must never appear in the venue's editor.
 */
export async function listLayoutsByWall(
  wallId: string,
  ownerUserId: string,
  client?: SupabaseClient,
): Promise<WallLayout[]> {
  const { data, error } = await db(client)
    .from("wall_layouts")
    .select("*")
    .eq("wall_id", wallId)
    .eq("user_id", ownerUserId)
    .order("updated_at", { ascending: false });
  if (error) {
    console.error("[walls-db] listLayoutsByWall failed:", error.message);
    return [];
  }
  return (data as DbLayoutRow[]).map(rowToLayout);
}

/** The owner's own layouts on a wall; artist proposals never count against the cap. */
export async function countLayoutsByWall(
  wallId: string,
  ownerUserId: string,
  client?: SupabaseClient,
): Promise<number> {
  const { count, error } = await db(client)
    .from("wall_layouts")
    .select("id", { count: "exact", head: true })
    .eq("wall_id", wallId)
    .eq("user_id", ownerUserId);
  if (error) {
    console.error("[walls-db] countLayoutsByWall failed:", error.message);
    return 0;
  }
  return count ?? 0;
}

export async function getLayoutById(
  layoutId: string,
  client?: SupabaseClient,
): Promise<WallLayout | null> {
  const { data, error } = await db(client)
    .from("wall_layouts")
    .select("*")
    .eq("id", layoutId)
    .maybeSingle<DbLayoutRow>();
  if (error) {
    console.error("[walls-db] getLayoutById failed:", error.message);
    return null;
  }
  return data ? rowToLayout(data) : null;
}

export interface CreateLayoutInput {
  user_id: string;
  wall_id: string;
  name: string;
  items: WallItem[];
  layout_hash: string;
}

export async function createLayout(
  input: CreateLayoutInput,
  client?: SupabaseClient,
): Promise<WallLayout | null> {
  const { data, error } = await db(client)
    .from("wall_layouts")
    .insert({
      user_id: input.user_id,
      wall_id: input.wall_id,
      name: input.name,
      items: input.items,
      layout_hash: input.layout_hash,
    })
    .select("*")
    .single<DbLayoutRow>();
  if (error) {
    console.error("[walls-db] createLayout failed:", error.message);
    return null;
  }
  return data ? rowToLayout(data) : null;
}

export interface UpdateLayoutInput {
  name?: string;
  items?: WallItem[];
  layout_hash?: string;
  last_render_id?: string;
}

export async function updateLayout(
  layoutId: string,
  patch: UpdateLayoutInput,
  client?: SupabaseClient,
): Promise<WallLayout | null> {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.items !== undefined) update.items = patch.items;
  if (patch.layout_hash !== undefined) update.layout_hash = patch.layout_hash;
  if (patch.last_render_id !== undefined) {
    update.last_render_id = patch.last_render_id;
  }

  if (Object.keys(update).length === 0) {
    return getLayoutById(layoutId, client);
  }

  // Bumped here rather than trusting a trigger: the wall's picture is the
  // newest layout's render, so a save must make this layout the newest.
  update.updated_at = new Date().toISOString();
  const { data, error } = await db(client)
    .from("wall_layouts")
    .update(update)
    .eq("id", layoutId)
    .select("*")
    .single<DbLayoutRow>();
  if (error) {
    console.error("[walls-db] updateLayout failed:", error.message);
    return null;
  }
  return data ? rowToLayout(data) : null;
}

export async function deleteLayout(
  layoutId: string,
  client?: SupabaseClient,
): Promise<boolean> {
  const { error } = await db(client)
    .from("wall_layouts")
    .delete()
    .eq("id", layoutId);
  if (error) {
    console.error("[walls-db] deleteLayout failed:", error.message);
    return false;
  }
  return true;
}

// ── Saved previews ──────────────────────────────────────────────────────

/**
 * Public URL of the saved preview for each wall in `walls`, keyed by wall
 * id. A wall's preview is the render its most recently updated layout
 * points at (`wall_layouts.last_render_id`); walls with no saved preview
 * are simply absent from the result.
 *
 * Only the wall OWNER's layouts are considered. An artist's wall proposal
 * is a wall_layouts row on the venue's wall under the artist's user_id
 * (src/lib/placements/wall-proposals.ts), and it is usually the newest
 * layout there; without this filter it would replace the venue's own
 * preview on My Walls and on the public profile. Callers pass the owner
 * with each wall so the filter needs no extra query.
 *
 * Two queries for the whole set (layouts, then the renders they point
 * at), never one per wall: the list page and the public profile call this
 * for every wall they show.
 */
export async function getWallPreviewUrls(
  walls: ReadonlyArray<{ id: string; user_id: string }>,
  client?: SupabaseClient,
): Promise<Record<string, string>> {
  if (walls.length === 0) return {};
  const conn = db(client);
  const ownerByWall = new Map(walls.map((w) => [w.id, w.user_id] as const));

  const { data: layouts, error: layoutsErr } = await conn
    .from("wall_layouts")
    .select("wall_id, user_id, last_render_id, updated_at")
    .in("wall_id", Array.from(ownerByWall.keys()))
    .order("updated_at", { ascending: false });
  if (layoutsErr || !layouts) {
    console.warn("[walls-db] getWallPreviewUrls layouts failed:", layoutsErr?.message);
    return {};
  }

  // Newest layout with a render wins per wall (rows arrive newest first),
  // skipping every layout that is not the owner's.
  const renderIdByWall = new Map<string, string>();
  for (const row of layouts as Array<{
    wall_id: string; user_id: string; last_render_id: string | null;
  }>) {
    if (row.user_id !== ownerByWall.get(row.wall_id)) continue;
    if (!row.last_render_id || renderIdByWall.has(row.wall_id)) continue;
    renderIdByWall.set(row.wall_id, row.last_render_id);
  }
  if (renderIdByWall.size === 0) return {};

  const { data: renders, error: rendersErr } = await conn
    .from("wall_renders")
    .select("id, output_path")
    .in("id", Array.from(new Set(renderIdByWall.values())));
  if (rendersErr || !renders) {
    console.warn("[walls-db] getWallPreviewUrls renders failed:", rendersErr?.message);
    return {};
  }
  const pathByRenderId = new Map<string, string>();
  for (const row of renders as Array<{ id: string; output_path: string | null }>) {
    if (row.output_path) pathByRenderId.set(row.id, row.output_path);
  }

  const out: Record<string, string> = {};
  for (const [wallId, renderId] of renderIdByWall) {
    const path = pathByRenderId.get(renderId);
    if (path) out[wallId] = getPublicRenderUrl(path, conn);
  }
  return out;
}

// ── Row → domain type mapping ───────────────────────────────────────────

function rowToWall(row: DbWallRow): Wall {
  return {
    id: row.id,
    user_id: row.user_id,
    owner_type: row.owner_type,
    name: row.name,
    kind: row.kind,
    preset_id: row.preset_id,
    source_image_path: row.source_image_path,
    width_cm: Number(row.width_cm),
    height_cm: Number(row.height_cm),
    wall_color_hex: row.wall_color_hex,
    perspective_homography:
      (row.perspective_homography as Wall["perspective_homography"]) ?? null,
    segmentation_mask_path: row.segmentation_mask_path,
    notes: row.notes,
    is_public_on_profile: row.is_public_on_profile === true,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToLayout(row: DbLayoutRow): WallLayout {
  return {
    id: row.id,
    wall_id: row.wall_id,
    user_id: row.user_id,
    name: row.name,
    items: Array.isArray(row.items) ? (row.items as WallItem[]) : [],
    layout_hash: row.layout_hash,
    last_render_id: row.last_render_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
