/**
 * /api/walls/[id]/layouts/[lid]
 *
 * GET     fetch a single layout (owner only)
 * PATCH   partial update, name and/or items
 *         When items change, the layout_hash is recomputed so the
 *         render cache key stays consistent.
 * DELETE  remove
 *
 * Both URL parts are validated:
 *   - the wall must exist and be owned by the caller
 *   - the layout must exist AND belong to that wall
 */

import { NextResponse } from "next/server";
import { isFlagOn } from "@/lib/feature-flags";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { updateLayoutSchema } from "@/lib/visualizer/validations";
import { computeLayoutHash } from "@/lib/visualizer/layout-hash";
import {
  deleteLayout,
  getLayoutById,
  getWallById,
  updateLayout,
} from "@/lib/visualizer/walls-db";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string; lid: string }>;
}

async function resolveOwnerLayout(request: Request, ctx: RouteContext) {
  if (!isFlagOn("WALL_VISUALIZER_V1")) {
    return { errResponse: NextResponse.json({ error: "Not enabled" }, { status: 404 }) };
  }
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return { errResponse: auth.error };

  const { id, lid } = await ctx.params;
  const wall = await getWallById(id);
  if (!wall || wall.user_id !== auth.user!.id) {
    return {
      errResponse: NextResponse.json({ error: "Wall not found" }, { status: 404 }),
    };
  }
  const layout = await getLayoutById(lid);
  if (!layout || layout.wall_id !== wall.id || layout.user_id !== auth.user!.id) {
    return {
      errResponse: NextResponse.json({ error: "Layout not found" }, { status: 404 }),
    };
  }
  return { wall, layout, userId: auth.user!.id };
}

export async function GET(request: Request, ctx: RouteContext) {
  const r = await resolveOwnerLayout(request, ctx);
  if (r.errResponse) return r.errResponse;
  return NextResponse.json({ layout: r.layout });
}

export async function PATCH(request: Request, ctx: RouteContext) {
  const r = await resolveOwnerLayout(request, ctx);
  if (r.errResponse) return r.errResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = updateLayoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const itemsChanged = parsed.data.items !== undefined;
  const newItems = parsed.data.items ?? r.layout!.items;

  const newHash = itemsChanged
    ? computeLayoutHash({
        items: newItems,
        background:
          r.wall!.kind === "preset"
            ? {
                kind: "preset",
                preset_id: r.wall!.preset_id ?? "",
                color_hex: r.wall!.wall_color_hex,
              }
            : {
                kind: "uploaded",
                image_path: r.wall!.source_image_path ?? "",
              },
        width_cm: r.wall!.width_cm,
        height_cm: r.wall!.height_cm,
      })
    : undefined;

  const updated = await updateLayout(r.layout!.id, {
    name: parsed.data.name,
    items: parsed.data.items,
    layout_hash: newHash,
  });
  if (!updated) {
    return NextResponse.json(
      { error: "Could not update layout" },
      { status: 500 },
    );
  }
  return NextResponse.json({ layout: updated });
}

export async function DELETE(request: Request, ctx: RouteContext) {
  const r = await resolveOwnerLayout(request, ctx);
  if (r.errResponse) return r.errResponse;

  const ok = await deleteLayout(r.layout!.id);
  if (!ok) {
    return NextResponse.json(
      { error: "Could not delete layout" },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
