/**
 * /api/walls/[id]/layouts
 *
 * GET   list layouts on a wall (owner only)
 * POST  create a new layout under a wall (owner only, tier-capped)
 *
 * Both read the OWNER's layouts only: an artist's wall proposal is a
 * wall_layouts row on this wall under the artist's user_id
 * (src/lib/placements/wall-proposals.ts), and it must neither show in the
 * venue's editor nor count against the venue's layout cap.
 *
 * Tier cap:
 *   `getTierLimits(tier).saved_layouts_per_wall` controls how many
 *   layouts a wall can hold. -1 = unlimited; 0 = saving disabled
 *   entirely; otherwise compared against the current count.
 */

import { NextResponse } from "next/server";
import { isFlagOn } from "@/lib/feature-flags";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { createLayoutSchema } from "@/lib/visualizer/validations";
import { resolveTier } from "@/lib/visualizer/tier-resolver";
import { getTierLimits } from "@/lib/visualizer/tier-limits";
import { computeLayoutHash } from "@/lib/visualizer/layout-hash";
import {
  countLayoutsByWall,
  createLayout,
  getWallById,
  listLayoutsByWall,
} from "@/lib/visualizer/walls-db";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function resolveOwnerWall(request: Request, ctx: RouteContext) {
  if (!isFlagOn("WALL_VISUALIZER_V1")) {
    return { errResponse: NextResponse.json({ error: "Not enabled" }, { status: 404 }) };
  }
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return { errResponse: auth.error };

  const { id } = await ctx.params;
  const wall = await getWallById(id);
  if (!wall || wall.user_id !== auth.user!.id) {
    return {
      errResponse: NextResponse.json({ error: "Wall not found" }, { status: 404 }),
    };
  }
  return { wall, userId: auth.user!.id };
}

export async function GET(request: Request, ctx: RouteContext) {
  const r = await resolveOwnerWall(request, ctx);
  if (r.errResponse) return r.errResponse;

  const layouts = await listLayoutsByWall(r.wall!.id, r.userId!);
  return NextResponse.json({ layouts });
}

export async function POST(request: Request, ctx: RouteContext) {
  const r = await resolveOwnerWall(request, ctx);
  if (r.errResponse) return r.errResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createLayoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  if (parsed.data.wall_id !== r.wall!.id) {
    return NextResponse.json(
      { error: "Layout wall_id does not match URL" },
      { status: 400 },
    );
  }

  // Tier cap on layouts per wall.
  const tier = await resolveTier({
    userId: r.userId!,
    ownerTypeHint: r.wall!.owner_type,
  });
  const limits = getTierLimits(tier);
  if (limits.saved_layouts_per_wall === 0) {
    return NextResponse.json(
      {
        error: "Saving layouts isn't included on your plan.",
        reason: "saved_layouts_not_allowed",
        tier,
      },
      { status: 402 },
    );
  }
  if (limits.saved_layouts_per_wall > 0) {
    const existing = await countLayoutsByWall(r.wall!.id, r.userId!);
    if (existing >= limits.saved_layouts_per_wall) {
      return NextResponse.json(
        {
          error: `You've used all ${limits.saved_layouts_per_wall} layouts on this wall.`,
          reason: "saved_layouts_cap",
          tier,
          cap: limits.saved_layouts_per_wall,
        },
        { status: 402 },
      );
    }
  }

  // Pre-compute layout hash so the next render call can hit the cache.
  const hash = computeLayoutHash({
    items: parsed.data.items,
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
  });

  const layout = await createLayout({
    user_id: r.userId!,
    wall_id: r.wall!.id,
    name: parsed.data.name,
    items: parsed.data.items,
    layout_hash: hash,
  });
  if (!layout) {
    return NextResponse.json(
      { error: "Could not create layout" },
      { status: 500 },
    );
  }
  return NextResponse.json({ layout }, { status: 201 });
}
