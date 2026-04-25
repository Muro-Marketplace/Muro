/**
 * /api/walls/[id]
 *
 * GET     fetch a single wall (owner only)
 * PATCH   partial update (name, dimensions, colour, notes)
 * DELETE  remove (cascades to layouts via FK)
 *
 * Ownership:
 *   walls table has a SELECT-own RLS policy — anonymous reads can't
 *   leak rows. Mutations go through the service-role client here, which
 *   bypasses RLS, so we re-check `wall.user_id === auth.user.id` before
 *   touching the row.
 */

import { NextResponse } from "next/server";
import { isFlagOn } from "@/lib/feature-flags";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { updateWallSchema } from "@/lib/visualizer/validations";
import {
  deleteWall,
  getWallById,
  updateWall,
} from "@/lib/visualizer/walls-db";
import type { Wall } from "@/lib/visualizer/types";

export const dynamic = "force-dynamic";

const PHOTOS_BUCKET = "wall-photos";

/**
 * Resolve a signed display URL for an uploaded wall photo. Returns
 * null when the wall isn't of `kind === 'uploaded'` or when signing
 * fails (the editor will gracefully degrade to the solid colour).
 *
 * 1 hour TTL — long enough for an editor session, short enough that a
 * leaked URL self-expires.
 */
async function signWallPhotoUrl(wall: Wall): Promise<string | null> {
  if (wall.kind !== "uploaded" || !wall.source_image_path) return null;
  const db = getSupabaseAdmin();
  const { data, error } = await db.storage
    .from(PHOTOS_BUCKET)
    .createSignedUrl(wall.source_image_path, 60 * 60);
  if (error || !data?.signedUrl) {
    console.warn(
      "[walls/[id]] could not sign photo URL:",
      error?.message ?? "no url",
    );
    return null;
  }
  return data.signedUrl;
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function resolveAndAuthorize(request: Request, ctx: RouteContext) {
  if (!isFlagOn("WALL_VISUALIZER_V1")) {
    return { errResponse: NextResponse.json({ error: "Not enabled" }, { status: 404 }) };
  }
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return { errResponse: auth.error };

  const { id } = await ctx.params;
  const wall = await getWallById(id);
  if (!wall) {
    return {
      errResponse: NextResponse.json({ error: "Wall not found" }, { status: 404 }),
    };
  }
  if (wall.user_id !== auth.user!.id) {
    // 404 not 403 — don't leak existence to non-owners.
    return {
      errResponse: NextResponse.json({ error: "Wall not found" }, { status: 404 }),
    };
  }
  return { wall, userId: auth.user!.id };
}

export async function GET(request: Request, ctx: RouteContext) {
  const r = await resolveAndAuthorize(request, ctx);
  if (r.errResponse) return r.errResponse;
  // Sign the photo URL for uploaded walls so the editor can <img> it.
  const sourceImageUrl = await signWallPhotoUrl(r.wall!);
  return NextResponse.json({ wall: r.wall, sourceImageUrl });
}

export async function PATCH(request: Request, ctx: RouteContext) {
  const r = await resolveAndAuthorize(request, ctx);
  if (r.errResponse) return r.errResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = updateWallSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const updated = await updateWall(r.wall!.id, {
    name: parsed.data.name,
    width_cm: parsed.data.width_cm,
    height_cm: parsed.data.height_cm,
    wall_color_hex: parsed.data.wall_color_hex,
    notes: parsed.data.notes ?? undefined,
  });
  if (!updated) {
    return NextResponse.json({ error: "Could not update wall" }, { status: 500 });
  }
  return NextResponse.json({ wall: updated });
}

export async function DELETE(request: Request, ctx: RouteContext) {
  const r = await resolveAndAuthorize(request, ctx);
  if (r.errResponse) return r.errResponse;

  const ok = await deleteWall(r.wall!.id);
  if (!ok) {
    return NextResponse.json({ error: "Could not delete wall" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
