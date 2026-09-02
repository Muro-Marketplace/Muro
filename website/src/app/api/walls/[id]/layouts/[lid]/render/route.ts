/**
 * /api/walls/[id]/layouts/[lid]/render
 *
 * POST  composite a saved layout into a webp + return the URL.
 *
 * Pipeline:
 *   1. Auth + flag + ownership.
 *   2. Resolve final items list (body override or persisted layout items).
 *   3. Compute layout hash for cache lookup.
 *   4. Cache hit (within 24h, same kind) → return URL, 0 cost units.
 *   5. Cache miss → consume quota (1 unit standard, 2 hd).
 *   6. Fetch work image URLs for the items in the layout.
 *   7. Run sharp composite (`renderLayout`).
 *   8. Persist to Storage + insert wall_renders row.
 *   9. Update layout.last_render_id + layout_hash if items overrode.
 *   10. On any failure after quota consumption → refund.
 *
 * Quota:
 *   `consumeQuota` is called BEFORE compositing starts. If anything
 *   downstream throws or returns null, `refundQuota` inserts a negative
 *   ledger row so the user isn't out a render unit.
 *
 * Rate limit:
 *   The visualizer burst limit (30/h per user, see quota.ts) is layered
 *   on the consume call automatically, no separate guard needed here.
 */

import { NextResponse } from "next/server";
import { isFlagOn } from "@/lib/feature-flags";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { renderRequestSchema } from "@/lib/visualizer/validations";
import { computeLayoutHash } from "@/lib/visualizer/layout-hash";
import { findCachedRender } from "@/lib/visualizer/render-cache";
import { renderLayout } from "@/lib/visualizer/render-service";
import { getPublicRenderUrl, persistRender } from "@/lib/visualizer/renders-db";
import { consumeQuota, refundQuota } from "@/lib/visualizer/quota";
import {
  getLayoutById,
  getWallById,
  updateLayout,
} from "@/lib/visualizer/walls-db";
import type {
  LayoutBackground,
  RenderKind,
  VisualizerAction,
  WallItem,
} from "@/lib/visualizer/types";

export const dynamic = "force-dynamic";
// Render can take up to ~10s for a 5-item layout, bump the function budget.
export const maxDuration = 30;

interface RouteContext {
  params: Promise<{ id: string; lid: string }>;
}

export async function POST(request: Request, ctx: RouteContext) {
  if (!isFlagOn("WALL_VISUALIZER_V1")) {
    return NextResponse.json({ error: "Not enabled" }, { status: 404 });
  }
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;
  const userId = auth.user!.id;

  const { id, lid } = await ctx.params;

  // Resolve wall + layout (ownership check both sides).
  const wall = await getWallById(id);
  if (!wall || wall.user_id !== userId) {
    return NextResponse.json({ error: "Wall not found" }, { status: 404 });
  }
  const layout = await getLayoutById(lid);
  if (!layout || layout.wall_id !== wall.id || layout.user_id !== userId) {
    return NextResponse.json({ error: "Layout not found" }, { status: 404 });
  }

  // Parse body (kind + optional items override).
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is fine, defaults to standard render of saved items.
    body = {};
  }
  const parsed = renderRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const items: WallItem[] = parsed.data.items ?? layout.items;
  const kind: RenderKind = parsed.data.kind;
  const action: VisualizerAction =
    kind === "hd" ? "render_hd" : "render_standard";
  const costUnits = kind === "hd" ? 2 : 1;

  // Build background descriptor (matches the canvas).
  const background: LayoutBackground =
    wall.kind === "preset"
      ? {
          kind: "preset",
          preset_id: wall.preset_id ?? "",
          color_hex: wall.wall_color_hex,
        }
      : {
          kind: "uploaded",
          image_path: wall.source_image_path ?? "",
        };

  const layoutHash = computeLayoutHash({
    items,
    background,
    width_cm: wall.width_cm,
    height_cm: wall.height_cm,
  });

  // ── Cache check (free path) ────────────────────────────────────────
  const cached = await findCachedRender({
    userId,
    layoutHash,
    kind,
  });
  if (cached) {
    const publicUrl = getPublicRenderUrl(cached.output_path);
    return NextResponse.json({
      render: cached,
      publicUrl,
      cached: true,
      cost_units: 0,
    });
  }

  // ── Consume quota ──────────────────────────────────────────────────
  // Pass `work_ids` so consumeQuota can apply the per-artwork model:
  // re-renders of works the user has already rendered today are free,
  // and only NEW artworks count against the daily allowance.
  const workIdsForQuota = Array.from(
    new Set(items.map((i) => i.work_id).filter((id): id is string => !!id)),
  );
  const consumed = await consumeQuota({
    userId,
    action,
    // No `units` passed, consumeQuota will auto-calculate based on
    // how many of `work_ids` are new today.
    ownerTypeHint: wall.owner_type,
    referenceId: layout.id,
    metadata: {
      wall_id: wall.id,
      layout_id: layout.id,
      item_count: items.length,
      work_ids: workIdsForQuota,
    },
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

  // From here on, any failure must refund the quota unit.
  let refundOnFail = true;
  const failAndRefund = async (status: number, payload: object) => {
    if (refundOnFail) {
      await refundQuota({
        userId,
        originalAction: action,
        units: costUnits,
        referenceId: layout.id,
        reason: "render_failed",
      });
    }
    return NextResponse.json(payload, { status });
  };

  try {
    // ── Resolve work image URLs ──────────────────────────────────────
    const workIds = Array.from(new Set(items.map((i) => i.work_id)));
    const workById = await fetchWorkImageUrls(workIds);

    // Hard fail if NONE of the items can be resolved, the user has no
    // signal that the render contained anything if we let it through.
    if (items.length > 0 && Object.keys(workById).length === 0) {
      return await failAndRefund(424, {
        error: "Failed dependency",
        reason: "no_work_images_resolvable",
      });
    }

    // ── Render ────────────────────────────────────────────────────────
    const result = await renderLayout({
      background,
      wallWidthCm: wall.width_cm,
      wallHeightCm: wall.height_cm,
      items,
      workById,
    });

    // ── Persist to Storage + DB ──────────────────────────────────────
    const persisted = await persistRender({
      userId,
      layoutId: layout.id,
      kind,
      layoutHash,
      costUnits,
      imageBuffer: result.buffer,
      provider: null, // Phase 1 = local sharp; Phase 2 = "replicate", etc.
    });
    if (!persisted) {
      return await failAndRefund(500, {
        error: "Failed to save render",
        reason: "persistence_failed",
      });
    }

    // ── Update layout pointer ─────────────────────────────────────────
    // Set last_render_id + the freshly-computed hash so next render hits
    // the cache for free if nothing changes.
    await updateLayout(layout.id, {
      last_render_id: persisted.render.id,
      layout_hash: layoutHash,
    });

    // Success, don't refund.
    refundOnFail = false;

    return NextResponse.json({
      render: persisted.render,
      publicUrl: persisted.publicUrl,
      cached: false,
      cost_units: costUnits,
      meta: result.meta,
    });
  } catch (err) {
    // Log the full error server-side AND surface the message back to
    // the client. The artist needs to know whether the failure was
    // "image fetch timed out" vs "your work image is gone" vs
    // "sharp choked on the input", opaque "Render failed" leaves
    // them stuck. Stack trace is logged, message is sent back.
    const message =
      err instanceof Error ? err.message : "Unknown render error";
    console.error(
      "[render route] crashed:",
      message,
      err instanceof Error ? err.stack : err,
    );
    return await failAndRefund(500, {
      error: `Render failed: ${message}`,
      reason: "exception",
    });
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

async function fetchWorkImageUrls(
  workIds: string[],
): Promise<Record<string, { imageUrl: string }>> {
  if (workIds.length === 0) return {};
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("artist_works")
    .select("id, image")
    .in("id", workIds);
  if (error || !data) {
    console.warn("[render route] work image lookup failed:", error?.message);
    return {};
  }
  const out: Record<string, { imageUrl: string }> = {};
  for (const row of data as Array<{ id: string; image: string | null }>) {
    if (row.image) out[row.id] = { imageUrl: row.image };
  }
  return out;
}
