/**
 * /api/walls/render-quick
 *
 * POST, render a single artwork on a wall WITHOUT requiring a saved
 * wall + layout row first. This powers the customer "View on a wall"
 * flow on the artwork detail page: a customer browsing finds a piece
 * they like, clicks Render, and gets back a high-quality composite
 * within seconds, no account-creation required to drag, only to
 * generate the polished image.
 *
 * Request shape (validated by `quickRenderRequestSchema`):
 *   - Either `wall_id` (use the user's saved wall) OR
 *     `preset_id` + `width_cm` + `height_cm` + `wall_color_hex` (built
 *     on the fly, no DB row).
 *   - `work_id`, the artwork to place.
 *   - Optional `placement`, explicit position/size/frame; otherwise
 *     centred at a sensible default.
 *   - `kind`, "standard" | "hd" | "showroom" (default: standard).
 *
 * Response: same shape as the saved-layout render endpoint:
 *   { render, publicUrl, cached, cost_units, meta? }
 *
 * Quota:
 *   Routes through the same consumeQuota / refundQuota guarantees as
 *   the saved-layout path, failure refunds. Layout_id is persisted as
 *   null on the wall_renders row (the column is nullable in the
 *   migration), so cache hits via (user_id, layout_hash, kind) still
 *   work cleanly.
 */

import { NextResponse } from "next/server";
import { isFlagOn } from "@/lib/feature-flags";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { computeLayoutHash } from "@/lib/visualizer/layout-hash";
import { defaultFrameConfig } from "@/lib/visualizer/frames";
import { getPresetWall } from "@/lib/visualizer/preset-walls";
import { findCachedRender } from "@/lib/visualizer/render-cache";
import { renderLayout } from "@/lib/visualizer/render-service";
import { getPublicRenderUrl, persistRender } from "@/lib/visualizer/renders-db";
import { consumeQuota, refundQuota } from "@/lib/visualizer/quota";
import { quickRenderRequestSchema } from "@/lib/visualizer/validations";
import { getWallById } from "@/lib/visualizer/walls-db";
import type {
  LayoutBackground,
  RenderKind,
  VisualizerAction,
  WallItem,
  WallOwnerType,
} from "@/lib/visualizer/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Sensible default centred placement when caller doesn't override. */
function defaultPlacement(
  wallWidthCm: number,
  wallHeightCm: number,
): {
  x_cm: number;
  y_cm: number;
  width_cm: number;
  height_cm: number;
} {
  // Half the smaller wall dimension, capped at 80cm, feels right on
  // most preset walls (300×240) and won't overflow tighter ones.
  const cap = Math.min(wallWidthCm, wallHeightCm) * 0.5;
  const w = Math.min(80, cap);
  const h = Math.min(80, cap);
  return {
    x_cm: (wallWidthCm - w) / 2,
    y_cm: (wallHeightCm - h) / 2,
    width_cm: w,
    height_cm: h,
  };
}

export async function POST(request: Request) {
  if (!isFlagOn("WALL_VISUALIZER_V1")) {
    return NextResponse.json({ error: "Not enabled" }, { status: 404 });
  }
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;
  const userId = auth.user!.id;

  // Parse + validate.
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = quickRenderRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // Resolve background + dimensions.
  let background: LayoutBackground;
  let wallWidthCm: number;
  let wallHeightCm: number;
  // Undefined by default, the tier resolver will fall through artist →
  // venue → customer using the user's actual profile. Hard-coding
  // "customer" here meant a logged-in artist_premium (10/day) or
  // venue_standard (5/day) using the quick-render flow without a
  // saved wall (the customer artwork-page entry point) was capped at
  // the customer 2/day tier, which is what produced the "5 vs 2"
  // mismatch between My Walls and the artwork page. Real customers
  // still resolve to customer tier via the fallthrough.
  let ownerTypeHint: WallOwnerType | undefined = undefined;

  if (parsed.data.wall_id) {
    const wall = await getWallById(parsed.data.wall_id);
    if (!wall || wall.user_id !== userId) {
      // 404 not 403, don't leak existence to non-owners.
      return NextResponse.json({ error: "Wall not found" }, { status: 404 });
    }
    background =
      wall.kind === "uploaded"
        ? {
            kind: "uploaded",
            image_path: wall.source_image_path ?? "",
          }
        : {
            kind: "preset",
            preset_id: wall.preset_id ?? "",
            color_hex: wall.wall_color_hex,
          };
    wallWidthCm = wall.width_cm;
    wallHeightCm = wall.height_cm;
    ownerTypeHint = wall.owner_type;
  } else {
    // Preset path, caller supplied preset_id + dims (zod refine guarantees both).
    const preset = getPresetWall(parsed.data.preset_id!);
    if (!preset) {
      return NextResponse.json(
        { error: `Unknown preset_id '${parsed.data.preset_id}'` },
        { status: 400 },
      );
    }
    const colorHex =
      (parsed.data.wall_color_hex ?? preset.defaultColorHex)
        .replace(/^#/, "")
        .toUpperCase();
    background = {
      kind: "preset",
      preset_id: preset.id,
      color_hex: colorHex,
    };
    wallWidthCm = parsed.data.width_cm!;
    wallHeightCm = parsed.data.height_cm!;
  }

  // Build the single-item layout. Use placement override if supplied.
  const placement =
    parsed.data.placement ??
    {
      ...defaultPlacement(wallWidthCm, wallHeightCm),
      frame: defaultFrameConfig("none"),
    };

  const items: WallItem[] = [
    {
      // Stable id derived from work, keeps cache hash deterministic.
      id: `quick-${parsed.data.work_id}`,
      work_id: parsed.data.work_id,
      x_cm: placement.x_cm,
      y_cm: placement.y_cm,
      width_cm: placement.width_cm,
      height_cm: placement.height_cm,
      rotation_deg: 0,
      z_index: 0,
      frame: placement.frame,
    },
  ];

  const kind: RenderKind = parsed.data.kind;
  const action: VisualizerAction =
    kind === "hd" ? "render_hd" : "render_standard";
  const costUnits = kind === "hd" ? 2 : 1;

  // Hash-for-cache.
  const layoutHash = computeLayoutHash({
    items,
    background,
    width_cm: wallWidthCm,
    height_cm: wallHeightCm,
  });

  // Cache hit → free.
  const cached = await findCachedRender({ userId, layoutHash, kind });
  if (cached) {
    return NextResponse.json({
      render: cached,
      publicUrl: getPublicRenderUrl(cached.output_path),
      cached: true,
      cost_units: 0,
    });
  }

  // Consume quota.
  const consumed = await consumeQuota({
    userId,
    action,
    units: costUnits,
    ownerTypeHint,
    metadata: { mode: "quick", work_id: parsed.data.work_id },
  });
  if (!consumed.ok) {
    return NextResponse.json(
      {
        error: "Quota exceeded",
        reason: consumed.reason,
        resets_at: consumed.resets_at,
        tier: consumed.tier,
      },
      { status: 429 },
    );
  }

  // Refund-on-failure machinery.
  let refundOnFail = true;
  const failAndRefund = async (status: number, payload: object) => {
    if (refundOnFail) {
      await refundQuota({
        userId,
        originalAction: action,
        units: costUnits,
        reason: "render_failed",
      });
    }
    return NextResponse.json(payload, { status });
  };

  try {
    // Resolve the work image URL.
    const db = getSupabaseAdmin();
    const { data: workRow, error: workErr } = await db
      .from("artist_works")
      .select("id, image")
      .eq("id", parsed.data.work_id)
      .maybeSingle();
    if (workErr) {
      console.warn("[render-quick] work lookup failed:", workErr.message);
    }
    if (!workRow || !(workRow as { image?: string }).image) {
      return await failAndRefund(424, {
        error: "Failed dependency",
        reason: "no_work_image",
      });
    }
    const workById = {
      [parsed.data.work_id]: {
        imageUrl: (workRow as { image: string }).image,
      },
    };

    // Render.
    const result = await renderLayout({
      background,
      wallWidthCm,
      wallHeightCm,
      items,
      workById,
    });

    // Persist (layout_id null, this is an unsaved customer render).
    const persisted = await persistRender({
      userId,
      layoutId: null,
      kind,
      layoutHash,
      costUnits,
      imageBuffer: result.buffer,
      provider: null,
    });
    if (!persisted) {
      return await failAndRefund(500, {
        error: "Failed to save render",
        reason: "persistence_failed",
      });
    }

    // Success.
    refundOnFail = false;
    return NextResponse.json({
      render: persisted.render,
      publicUrl: persisted.publicUrl,
      cached: false,
      cost_units: costUnits,
      meta: result.meta,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown render error";
    console.error(
      "[render-quick] crashed:",
      message,
      err instanceof Error ? err.stack : err,
    );
    return await failAndRefund(500, {
      error: `Render failed: ${message}`,
      reason: "exception",
    });
  }
}
