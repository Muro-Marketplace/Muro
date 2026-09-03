/**
 * Artist wall proposals: the artist lays their work out on a venue's public
 * wall, previews it, and sends that picture with the placement request.
 *
 * WHERE A PROPOSAL LIVES. No migration was possible when this shipped, so a
 * proposal is stored in tables that already exist, and the placement row
 * gains no column:
 *
 *   wall_layouts row on the VENUE's wall
 *     wall_id         the venue wall the artist placed work on
 *     user_id         the ARTIST, not the wall owner
 *     name            `proposal:<placementId>`, the only link to the placement
 *     items           the artist's arrangement, in cm, as the editor stores it
 *     last_render_id  the wall_renders row holding the capture the artist
 *                     previewed (public bucket wall-renders, via persistRender)
 *
 *   placements row    unchanged shape. The link is the name convention above:
 *                     verified at placement creation (verifyWallProposalLink)
 *                     and resolved with one query when placements are listed
 *                     (getWallProposalsForPlacements).
 *
 * CONSEQUENCES of that choice, so nobody is surprised later:
 *   - Deleting the wall cascades the proposal layout, and with it the
 *     preview link, away; the placement row remains and simply shows no
 *     proposal image. Nothing else about the placement changes.
 *   - The venue's own layout listing, layout count and wall previews must
 *     filter on user_id = wall owner, or an artist's proposal would show up
 *     in the venue's editor and replace the venue's saved preview on its
 *     public profile. See listLayoutsByWall, countLayoutsByWall and
 *     getWallPreviewUrls in src/lib/visualizer/walls-db.ts.
 *   - A placement id carries at most one proposal: the name is derived from
 *     the id, and the upload route refuses an id that already exists.
 *   - Every /api/walls/[id]/layouts/[lid]/* route requires the layout's
 *     user_id to be the caller's as well as wall ownership, so a venue cannot
 *     open or edit an artist's proposal through ?lid=.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { computeLayoutHash } from "@/lib/visualizer/layout-hash";
import {
  getPublicRenderUrl,
  persistRender,
  type RenderContentType,
} from "@/lib/visualizer/renders-db";
import {
  createLayout,
  deleteLayout,
  getLayoutById,
  getWallById,
  updateLayout,
} from "@/lib/visualizer/walls-db";
import type {
  LayoutBackground,
  Wall,
  WallItem,
  WallLayout,
} from "@/lib/visualizer/types";

const NAME_PREFIX = "proposal:";

/** PostgREST `like` pattern matching every proposal layout. */
export const PROPOSAL_LAYOUT_NAME_PATTERN = `${NAME_PREFIX}%`;

export function proposalLayoutName(placementId: string): string {
  return `${NAME_PREFIX}${placementId}`;
}

/** The placement id a proposal layout name carries, or null for any other name. */
export function parseProposalLayoutName(name: string | null | undefined): string | null {
  if (typeof name !== "string" || !name.startsWith(NAME_PREFIX)) return null;
  const id = name.slice(NAME_PREFIX.length);
  return id.length > 0 ? id : null;
}

/** The same hash the preview and render routes compute for a layout on this wall. */
export function proposalLayoutHash(wall: Wall, items: WallItem[]): string {
  const background: LayoutBackground =
    wall.kind === "preset"
      ? { kind: "preset", preset_id: wall.preset_id ?? "", color_hex: wall.wall_color_hex }
      : { kind: "uploaded", image_path: wall.source_image_path ?? "" };
  return computeLayoutHash({
    items,
    background,
    width_cm: wall.width_cm,
    height_cm: wall.height_cm,
  });
}

// ── Create ──────────────────────────────────────────────────────────────

export interface CreateWallProposalInput {
  artistUserId: string;
  wall: Wall;
  items: WallItem[];
  placementId: string;
  /** The editor's capture, WebP or PNG bytes already checked by the route. */
  imageBuffer: Buffer;
  contentType?: RenderContentType;
}

export interface WallProposal {
  layoutId: string;
  renderId: string;
  previewUrl: string;
  layoutHash: string;
}

/**
 * Store a proposal: the layout row, then the capture as a wall_renders row,
 * then the pointer from one to the other. Nothing is left half-done: if the
 * capture cannot be stored or pointed at, the layout is removed again, so a
 * `proposal:` layout always has a preview behind it.
 */
export async function createWallProposal(
  input: CreateWallProposalInput,
  client?: SupabaseClient,
): Promise<WallProposal | null> {
  const db = client ?? getSupabaseAdmin();
  const layoutHash = proposalLayoutHash(input.wall, input.items);

  const layout = await createLayout(
    {
      user_id: input.artistUserId,
      wall_id: input.wall.id,
      name: proposalLayoutName(input.placementId),
      items: input.items,
      layout_hash: layoutHash,
    },
    db,
  );
  if (!layout) return null;

  const persisted = await persistRender(
    {
      userId: input.artistUserId,
      layoutId: layout.id,
      kind: "standard",
      layoutHash,
      costUnits: 0,
      imageBuffer: input.imageBuffer,
      contentType: input.contentType,
      provider: "client_capture",
    },
    db,
  );
  if (!persisted) {
    await deleteLayout(layout.id, db);
    return null;
  }

  const updated = await updateLayout(layout.id, { last_render_id: persisted.render.id }, db);
  if (!updated) {
    await deleteLayout(layout.id, db);
    return null;
  }

  return {
    layoutId: layout.id,
    renderId: persisted.render.id,
    previewUrl: persisted.publicUrl,
    layoutHash,
  };
}

// ── Read ────────────────────────────────────────────────────────────────

export interface PlacementWallProposal {
  layoutId: string;
  wallId: string;
  wallName: string;
  previewUrl: string;
}

/**
 * The proposal behind each placement id, keyed by placement id. Three
 * queries for the whole list (layouts by name, then the walls and renders
 * they point at), never one per placement: the portals call this for every
 * row they show. Placements without a proposal are absent. Fails soft to an
 * empty map so a lookup problem never empties the placement list.
 */
export async function getWallProposalsForPlacements(
  placementIds: string[],
  client?: SupabaseClient,
): Promise<Record<string, PlacementWallProposal>> {
  const ids = Array.from(new Set(placementIds.filter((id) => typeof id === "string" && id.length > 0)));
  if (ids.length === 0) return {};
  const db = client ?? getSupabaseAdmin();

  try {
    const { data: layouts, error: layoutsErr } = await db
      .from("wall_layouts")
      .select("id, wall_id, name, last_render_id")
      .in("name", ids.map(proposalLayoutName));
    if (layoutsErr || !layouts) {
      console.warn("[wall-proposals] layouts lookup failed:", layoutsErr?.message);
      return {};
    }
    const rows = (layouts as Array<{
      id: string; wall_id: string; name: string; last_render_id: string | null;
    }>).filter((row) => !!row.last_render_id);
    if (rows.length === 0) return {};

    const wallIds = Array.from(new Set(rows.map((r) => r.wall_id)));
    const renderIds = Array.from(new Set(rows.map((r) => r.last_render_id as string)));
    const [wallsRes, rendersRes] = await Promise.all([
      db.from("walls").select("id, name").in("id", wallIds),
      db.from("wall_renders").select("id, output_path").in("id", renderIds),
    ]);
    if (wallsRes.error) console.warn("[wall-proposals] walls lookup failed:", wallsRes.error.message);
    if (rendersRes.error) console.warn("[wall-proposals] renders lookup failed:", rendersRes.error.message);

    const wallNameById = new Map<string, string>();
    for (const w of (wallsRes.data ?? []) as Array<{ id: string; name: string | null }>) {
      wallNameById.set(w.id, w.name ?? "");
    }
    const pathByRenderId = new Map<string, string>();
    for (const r of (rendersRes.data ?? []) as Array<{ id: string; output_path: string | null }>) {
      if (r.output_path) pathByRenderId.set(r.id, r.output_path);
    }

    const out: Record<string, PlacementWallProposal> = {};
    for (const row of rows) {
      const placementId = parseProposalLayoutName(row.name);
      const path = pathByRenderId.get(row.last_render_id as string);
      const wallName = wallNameById.get(row.wall_id);
      if (!placementId || !path || wallName === undefined) continue;
      out[placementId] = {
        layoutId: row.id,
        wallId: row.wall_id,
        wallName,
        previewUrl: getPublicRenderUrl(path, db),
      };
    }
    return out;
  } catch (err) {
    console.warn("[wall-proposals] lookup failed:", err);
    return {};
  }
}

// ── Verify ──────────────────────────────────────────────────────────────

export interface VerifyWallProposalLinkInput {
  layoutId: string;
  placementId: string;
  artistUserId: string;
  venueUserId: string;
}

export type VerifyWallProposalLinkResult =
  | { ok: true; layout: WallLayout; wall: Wall; previewUrl: string | null }
  | { ok: false; reason: string };

/**
 * Is `layoutId` a proposal this artist made, for this placement id, on a
 * wall this venue has made public? Every part of the link is checked, so a
 * request cannot borrow another artist's proposal, reuse one under a new
 * id, or point at a wall the venue has since taken down.
 */
export async function verifyWallProposalLink(
  input: VerifyWallProposalLinkInput,
  client?: SupabaseClient,
): Promise<VerifyWallProposalLinkResult> {
  const db = client ?? getSupabaseAdmin();
  const fail = (reason: string): VerifyWallProposalLinkResult => ({ ok: false, reason });

  const layout = await getLayoutById(input.layoutId, db);
  if (!layout) return fail("That wall proposal no longer exists.");
  if (layout.user_id !== input.artistUserId) return fail("That wall proposal isn't yours.");
  if (layout.name !== proposalLayoutName(input.placementId)) {
    return fail("That wall proposal belongs to a different request.");
  }
  if (!layout.last_render_id) return fail("That wall proposal has no preview image.");

  const wall = await getWallById(layout.wall_id, db);
  if (!wall || wall.user_id !== input.venueUserId) {
    return fail("That wall proposal isn't on this venue's wall.");
  }
  if (!wall.is_public_on_profile) return fail("That wall is no longer open to proposals.");

  return { ok: true, layout, wall, previewUrl: await renderPublicUrl(layout.last_render_id, db) };
}

async function renderPublicUrl(renderId: string, db: SupabaseClient): Promise<string | null> {
  try {
    const { data } = await db
      .from("wall_renders")
      .select("output_path")
      .eq("id", renderId)
      .maybeSingle<{ output_path: string | null }>();
    return data?.output_path ? getPublicRenderUrl(data.output_path, db) : null;
  } catch {
    return null;
  }
}

// ── Guards used by the upload route ─────────────────────────────────────

/** How many proposal layouts this artist has created since `since`. */
export async function countRecentWallProposals(
  artistUserId: string,
  since: Date,
  client?: SupabaseClient,
): Promise<number> {
  const db = client ?? getSupabaseAdmin();
  const { count, error } = await db
    .from("wall_layouts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", artistUserId)
    .like("name", PROPOSAL_LAYOUT_NAME_PATTERN)
    .gte("created_at", since.toISOString());
  if (error) {
    console.warn("[wall-proposals] recent count failed:", error.message);
    return 0;
  }
  return count ?? 0;
}

/** Whether a placement row already carries this id. Null when the read fails. */
export async function placementExists(
  placementId: string,
  client?: SupabaseClient,
): Promise<boolean | null> {
  const db = client ?? getSupabaseAdmin();
  const { data, error } = await db
    .from("placements")
    .select("id")
    .eq("id", placementId)
    .maybeSingle<{ id: string }>();
  if (error) {
    console.warn("[wall-proposals] placement lookup failed:", error.message);
    return null;
  }
  return !!data;
}
