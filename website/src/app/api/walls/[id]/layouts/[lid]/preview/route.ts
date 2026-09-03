/**
 * /api/walls/[id]/layouts/[lid]/preview
 *
 * POST  store a preview the editor captured of this layout.
 *
 * The editor's Preview is a pixel capture of its own Konva stage, so what
 * the owner saves is exactly what they lined up. The server does no
 * compositing here (see render-service.ts for why that path drifted):
 * it validates the bytes, stores them as a wall_renders row and points
 * the layout at it, which is what the wall list and the public venue
 * profile read back as `preview_image_url`.
 *
 * Pipeline:
 *   1. Flag + auth + per-user burst limit.
 *   2. Ownership, wall and layout (404 either way, no enumeration).
 *   3. Body: multipart field `image`, or a raw body with an image content
 *      type. 8 MB cap. WebP or PNG by magic bytes, the declared type is
 *      not trusted.
 *   4. persistRender(kind standard, cost 0, provider client_capture) then
 *      updateLayout(last_render_id, layout_hash), as the render route does.
 *
 * Quota: none. The user's own browser did the work, so nothing is metered
 * against the render budget. The burst limit is the only ceiling and it
 * exists to stop one account filling the bucket in a loop.
 *
 * Body size: Vercel's serverless functions reject bodies above roughly
 * 4.5 MB before this code runs. A 2400 px WebP is a few hundred KB; a PNG
 * from a browser that can't encode WebP can be larger, and surfaces as a
 * platform 413 rather than this route's own.
 */

import { NextResponse } from "next/server";
import { isFlagOn } from "@/lib/feature-flags";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { withRateLimit } from "@/lib/rate-limit";
import { computeLayoutHash } from "@/lib/visualizer/layout-hash";
import {
  PREVIEW_CONTENT_TYPES,
  PREVIEW_MAX_BYTES,
  sniffPreviewImage,
} from "@/lib/visualizer/preview-image";
import { persistRender } from "@/lib/visualizer/renders-db";
import {
  getLayoutById,
  getWallById,
  updateLayout,
} from "@/lib/visualizer/walls-db";
import type { LayoutBackground } from "@/lib/visualizer/types";

export const dynamic = "force-dynamic";

/** Per-user ceiling on saves, its own bucket so it never touches renders. */
const PREVIEW_BURST = { name: "wall_preview_burst", limit: 60, windowSeconds: 3600 };

interface RouteContext {
  params: Promise<{ id: string; lid: string }>;
}

type BodyResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; response: NextResponse };

function reject(status: number, error: string): BodyResult {
  return { ok: false, response: NextResponse.json({ error }, { status }) };
}

function tooLarge(): BodyResult {
  return reject(
    413,
    `Preview too large. Max ${Math.round(PREVIEW_MAX_BYTES / 1024 / 1024)} MB.`,
  );
}

/**
 * The image bytes from either accepted body shape. The declared
 * Content-Length is checked first so an oversize body is refused before
 * it is buffered; the byte count is checked again after reading because
 * the header is optional and unverified.
 */
async function readImageBody(request: Request): Promise<BodyResult> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > PREVIEW_MAX_BYTES) return tooLarge();

  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  let blob: Blob;
  if (contentType.startsWith("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return reject(400, "Expected multipart/form-data with an 'image' part");
    }
    const part = form.get("image");
    if (!(part instanceof Blob)) return reject(400, "Missing 'image' part");
    blob = part;
  } else if (contentType.startsWith("image/")) {
    blob = await request.blob();
  } else {
    return reject(
      400,
      "Expected multipart/form-data with an 'image' part, or an image body",
    );
  }

  if (blob.size === 0) return reject(400, "Image is empty");
  if (blob.size > PREVIEW_MAX_BYTES) return tooLarge();
  return { ok: true, bytes: new Uint8Array(await blob.arrayBuffer()) };
}

export async function POST(request: Request, ctx: RouteContext) {
  if (!isFlagOn("WALL_VISUALIZER_V1")) {
    return NextResponse.json({ error: "Not enabled" }, { status: 404 });
  }
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;
  const userId = auth.user!.id;

  const burst = await withRateLimit(request, { ...PREVIEW_BURST, key: userId });
  if (burst) return burst;

  const { id, lid } = await ctx.params;

  // Ownership on both rows, mirroring the render route: a wall or layout
  // that isn't the caller's reads as missing, never as forbidden.
  const wall = await getWallById(id);
  if (!wall || wall.user_id !== userId) {
    return NextResponse.json({ error: "Wall not found" }, { status: 404 });
  }
  const layout = await getLayoutById(lid);
  if (!layout || layout.wall_id !== wall.id || layout.user_id !== userId) {
    return NextResponse.json({ error: "Layout not found" }, { status: 404 });
  }

  const body = await readImageBody(request);
  if (!body.ok) return body.response;

  const format = sniffPreviewImage(body.bytes);
  if (!format) {
    return NextResponse.json(
      { error: "Unsupported image. The preview must be WebP or PNG." },
      { status: 400 },
    );
  }

  // Hash the layout as stored. The editor flushes its auto-save before
  // uploading, so this is the layout the capture shows.
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
    items: layout.items,
    background,
    width_cm: wall.width_cm,
    height_cm: wall.height_cm,
  });

  const persisted = await persistRender({
    userId,
    layoutId: layout.id,
    kind: "standard",
    layoutHash,
    costUnits: 0,
    imageBuffer: Buffer.from(body.bytes),
    contentType: PREVIEW_CONTENT_TYPES[format],
    provider: "client_capture",
  });
  if (!persisted) {
    return NextResponse.json(
      { error: "Failed to save preview", reason: "persistence_failed" },
      { status: 500 },
    );
  }

  const updated = await updateLayout(layout.id, {
    last_render_id: persisted.render.id,
    layout_hash: layoutHash,
  });
  if (!updated) {
    // The file is stored but nothing points at it, so the wall would still
    // show its old preview. Say so rather than report a save that didn't land.
    return NextResponse.json(
      { error: "Preview stored but the wall could not be updated", reason: "layout_update_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    render: persisted.render,
    publicUrl: persisted.publicUrl,
  });
}
